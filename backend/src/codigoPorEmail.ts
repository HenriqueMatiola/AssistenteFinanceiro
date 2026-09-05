/**
 * As regras do código de 6 dígitos que viaja por e-mail.
 *
 * Servem a DOIS fluxos: confirmar o endereço e recuperar a senha. As regras são
 * as mesmas — sorteio, validade, teto de tentativas, intervalo entre envios —,
 * o que muda é só em quais colunas cada fluxo guarda o seu código. Os códigos
 * em si nunca se misturam: um pedido para confirmar o e-mail não vale para
 * trocar a senha.
 *
 * Módulo próprio, sem Prisma nem Express, pelo mesmo motivo de `credenciais.ts`:
 * aqui mora a decisão ("este código ainda vale?"), e não o vaivém com o banco.
 * Assim dá para testar cada regra sozinha, sem subir servidor nem PostgreSQL.
 *
 * O que este módulo NÃO faz: mandar o e-mail (é `email.ts`) e ler ou gravar
 * usuário (é a rota).
 */
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ErroDeValidacao } from './validacao.ts';

/**
 * Quanto tempo o código vale.
 *
 * Curto o bastante para que um código esquecido numa caixa de e-mail aberta não
 * sirva depois, e longo o bastante para quem foi buscar o celular e voltou.
 */
export const VALIDADE_EM_MINUTOS = 15;

/**
 * Quantos palpites errados o mesmo código aguenta antes de morrer.
 *
 * Seis dígitos são um milhão de combinações — parece muito, mas um script faz
 * um milhão de tentativas em minutos. Com teto de 5, a chance de acertar
 * chutando é de 5 em 1.000.000, e queimar o código força a pedir outro (que
 * por sua vez esbarra no intervalo de reenvio abaixo).
 */
export const MAXIMO_DE_TENTATIVAS = 5;

/**
 * Espera mínima entre dois envios.
 *
 * Sem isto, quem clicasse "reenviar" sem parar mandaria e-mail atrás de e-mail
 * em nome da conta que envia — o caminho mais curto para ela ser marcada como
 * spam e parar de entregar para todo mundo.
 */
export const INTERVALO_ENTRE_ENVIOS_EM_SEGUNDOS = 60;

/** Mesmo custo usado nas senhas: lento de propósito para quem tenta adivinhar. */
const CUSTO_DO_HASH = 10;

const FORMATO_DO_CODIGO = /^\d{6}$/;

/**
 * Sorteia o código.
 *
 * `randomInt` do módulo `crypto`, e não `Math.random`: o segundo é previsível a
 * partir de saídas anteriores, e um código de confirmação previsível não
 * confirma nada. O `padStart` preserva os zeros à esquerda — sem ele, o sorteio
 * 42 viraria o código "42" e nunca "000042".
 */
export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Confere o que a pessoa digitou e devolve só os dígitos.
 *
 * Espaço e traço saem antes: quem copia de um e-mail costuma trazer junto um
 * espaço no fim, e recusar por isso seria implicância.
 */
export function validarCodigoDigitado(bruto: unknown): string {
  if (typeof bruto !== 'string') {
    throw new ErroDeValidacao('Informe o código que enviamos por e-mail.');
  }

  const codigo = bruto.replace(/[\s-]/g, '');

  if (!FORMATO_DO_CODIGO.test(codigo)) {
    throw new ErroDeValidacao('O código tem 6 dígitos.');
  }

  return codigo;
}

/** Até quando um código sorteado agora vai valer. */
export function expiracaoAPartirDe(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + VALIDADE_EM_MINUTOS * 60_000);
}

/**
 * Quantos segundos ainda faltam para poder mandar outro código.
 *
 * Zero quer dizer "pode mandar agora" — inclusive quando nunca se mandou um.
 */
export function segundosParaPoderReenviar(
  enviadoEm: Date | null,
  agora: Date = new Date()
): number {
  if (!enviadoEm) return 0;

  const decorridos = (agora.getTime() - enviadoEm.getTime()) / 1000;
  const restantes = INTERVALO_ENTRE_ENVIOS_EM_SEGUNDOS - decorridos;

  // Arredonda para cima para não dizer "0 segundos" a quem ainda precisa esperar
  // uma fração; e nunca devolve negativo.
  return restantes > 0 ? Math.ceil(restantes) : 0;
}

/** O código guardado na linha do usuário, do ponto de vista deste módulo. */
export interface CodigoGuardado {
  hash: string | null;
  expiraEm: Date | null;
  tentativas: number;
}

/** Por que este código não pode nem ser conferido. `null` = pode. */
export type ProblemaComOCodigo = 'sem-codigo' | 'expirado' | 'tentativas-esgotadas';

/**
 * Olha o código guardado ANTES de comparar com o que foi digitado.
 *
 * A ordem importa: sem esta porteira, um código expirado ou já queimado ainda
 * seria comparado, e bastaria acertar os dígitos para entrar. As três respostas
 * levam à mesma saída prática — pedir um código novo.
 */
export function problemaComOCodigo(
  guardado: CodigoGuardado,
  agora: Date = new Date()
): ProblemaComOCodigo | null {
  if (!guardado.hash || !guardado.expiraEm) return 'sem-codigo';
  if (guardado.expiraEm.getTime() <= agora.getTime()) return 'expirado';
  if (guardado.tentativas >= MAXIMO_DE_TENTATIVAS) return 'tentativas-esgotadas';
  return null;
}

/** A frase que a pessoa lê quando o código não serve mais. */
export function mensagemDoProblema(problema: ProblemaComOCodigo): string {
  switch (problema) {
    case 'sem-codigo':
      return 'Nenhum código pendente. Peça um novo código.';
    case 'expirado':
      return `O código vale por ${VALIDADE_EM_MINUTOS} minutos e este já passou. Peça um novo.`;
    case 'tentativas-esgotadas':
      return 'Muitas tentativas erradas neste código. Peça um novo.';
  }
}

/** Guardamos o hash, e não os dígitos: se o banco vazar, o código não vai junto. */
export function hashDoCodigo(codigo: string): Promise<string> {
  return bcrypt.hash(codigo, CUSTO_DO_HASH);
}

export function codigoConfere(digitado: string, hash: string): Promise<boolean> {
  return bcrypt.compare(digitado, hash);
}
