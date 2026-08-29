/**
 * Regras do que vale como nome de usuário, e-mail e senha.
 *
 * Ficam num módulo próprio, sem Prisma nem Express, porque duas portas de
 * entrada criam conta — a tela de cadastro e o script `npm run criar-usuario` —
 * e regra duplicada é regra que um dia muda só num dos lados.
 */
import { ErroDeValidacao } from './validacao.ts';

/** Curto demais não identifica ninguém; longo demais não cabe na interface. */
const MINIMO_LOGIN = 3;
const MAXIMO_LOGIN = 20;

/** Oito é o piso do NIST para senha que não exige troca periódica. */
export const TAMANHO_MINIMO_SENHA = 8;

/**
 * Só minúsculas, números, ponto, hífen e sublinhado.
 *
 * O acento fica de fora de propósito: quem cadastra "joão" digita "joao" na
 * hora de entrar e não entende por que foi recusado. O nome de exibição
 * aceita acento à vontade — este campo é chave de acesso, não nome próprio.
 */
const FORMATO_LOGIN = /^[a-z0-9._-]+$/;

/**
 * Validação de e-mail de propósito frouxa: algo@algo.algo, sem espaços.
 *
 * A regex "completa" do RFC 5322 tem mais de 400 caracteres, recusa endereços
 * válidos e aceita inválidos. Como aqui o e-mail é só um segundo apelido de
 * login, e não canal de mensagem, esta forma basta para pegar erro de digitação.
 */
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Confere o nome de usuário e devolve ele normalizado (sem espaços nas pontas
 * e em minúsculas), que é a forma como vai para o banco.
 */
export function validarNomeDeUsuario(bruto: unknown): string {
  if (typeof bruto !== 'string') {
    throw new ErroDeValidacao('Informe um nome de usuário.');
  }

  const login = bruto.trim().toLowerCase();

  if (login.length < MINIMO_LOGIN || login.length > MAXIMO_LOGIN) {
    throw new ErroDeValidacao(
      `O nome de usuário precisa ter de ${MINIMO_LOGIN} a ${MAXIMO_LOGIN} caracteres.`
    );
  }

  if (!FORMATO_LOGIN.test(login)) {
    throw new ErroDeValidacao(
      'O nome de usuário aceita apenas letras sem acento, números, ponto, hífen e sublinhado.'
    );
  }

  return login;
}

/** Confere o e-mail e devolve ele em minúsculas, sem espaços nas pontas. */
export function validarEmail(bruto: unknown): string {
  if (typeof bruto !== 'string') {
    throw new ErroDeValidacao('Informe um e-mail.');
  }

  const email = bruto.trim().toLowerCase();

  if (!FORMATO_EMAIL.test(email)) {
    throw new ErroDeValidacao('E-mail inválido.');
  }

  return email;
}

/**
 * Confere a senha e devolve ela como veio.
 *
 * Nada de trim aqui: espaço nas pontas é caractere de senha como outro
 * qualquer, e cortá-lo em silêncio mudaria a senha que a pessoa escolheu.
 */
export function validarSenha(bruto: unknown): string {
  if (typeof bruto !== 'string' || bruto.length < TAMANHO_MINIMO_SENHA) {
    throw new ErroDeValidacao(
      `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`
    );
  }

  return bruto;
}

/**
 * Prepara o que a pessoa digitou no campo "usuário ou e-mail" para a consulta.
 *
 * Não valida formato: na hora de entrar, texto fora do padrão simplesmente não
 * acha ninguém. Recusar antes de consultar entregaria de graça a informação de
 * quais nomes de usuário são possíveis.
 */
export function normalizarIdentificador(bruto: string): string {
  return bruto.trim().toLowerCase();
}

/**
 * Nome de exibição a partir do nome de usuário, para o cabeçalho do app.
 *
 * O cadastro pede três campos, e não quatro: quem entra como `henrique` aparece
 * como "Henrique" no topo da tela, em vez de em minúsculas.
 */
export function nomeDeExibicao(login: string): string {
  return login.charAt(0).toUpperCase() + login.slice(1);
}
