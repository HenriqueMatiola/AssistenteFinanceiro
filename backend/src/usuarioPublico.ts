/**
 * O usuário como o frontend o vê.
 *
 * Existe num módulo próprio porque quatro rotas devolvem a mesma pessoa —
 * entrar, cadastrar, entrar com o Google e `/api/eu` — e a lista de campos
 * duplicada em quatro lugares é a lista que um dia esquece de crescer numa
 * delas. O hash da senha nunca sai daqui.
 */
import { motivoDoBloqueio } from './acessoAoApp.ts';
import { problemaComOCodigo } from './codigoPorEmail.ts';
import { envioDeEmailEstaConfigurado } from './email.ts';

/**
 * O que buscar no banco. Inclui hashes que NÃO saem daqui — o da senha, para
 * responder `temSenha`, e o do código, para responder `codigoDeEmailPendente`.
 */
export const CAMPOS_DO_USUARIO = {
  id: true,
  nome: true,
  login: true,
  email: true,
  foto: true,
  senhaHash: true,
  emailVerificadoEm: true,
  codigoDeEmailHash: true,
  codigoDeEmailExpiraEm: true,
  codigoDeEmailTentativas: true,
} as const;

/** O que a linha do banco tem, do ponto de vista deste módulo. */
interface LinhaDeUsuario {
  id: number;
  nome: string;
  login: string;
  email: string | null;
  foto: string | null;
  senhaHash: string | null;
  emailVerificadoEm: Date | null;
  codigoDeEmailHash: string | null;
  codigoDeEmailExpiraEm: Date | null;
  codigoDeEmailTentativas: number;
}

export interface UsuarioPublico {
  id: number;
  nome: string;
  login: string;
  email: string | null;
  foto: string | null;
  /**
   * Se a conta tem senha. Falso em quem só entra pelo Google — a tela de
   * Perfil usa isto para não oferecer um "trocar senha" que não tem o que
   * trocar. O hash em si não sai do backend, nem em pedaço.
   */
  temSenha: boolean;
  /**
   * Se a pessoa já provou que a caixa de e-mail é dela. A data em si não sai
   * do backend: para a interface, só interessa o sim ou não.
   */
  emailVerificado: boolean;
  /**
   * Se o app está BARRADO até essa prova aparecer.
   *
   * Não é o contrário de `emailVerificado`, e é por isso que existe: num
   * servidor sem envio de e-mail configurado ninguém é barrado, mesmo sem ter
   * confirmado nada. Sem este campo, a tela teria que adivinhar se o servidor
   * sabe mandar e-mail — e adivinharia errado, travando a navegação de quem o
   * backend está deixando passar.
   *
   * A decisão é a mesma que barra as rotas em `exigirEmailConfirmado`, tomada
   * pela mesma função. Uma regra só, consultada de dois lugares.
   */
  precisaConfirmarEmail: boolean;
  /**
   * Se existe um código válido esperando para ser digitado.
   *
   * A tela usa isto para abrir direto no campo do código em vez de oferecer um
   * botão "Enviar código" — o cadastro já manda o primeiro, e pedir um segundo
   * só levaria a pessoa a um "aguarde 60 segundos" que ela não provocou.
   *
   * Vale a mesma porteira que a rota de conferir usa: código ausente, vencido
   * ou com as tentativas esgotadas não está "esperando", está morto.
   */
  codigoDeEmailPendente: boolean;
}

export function paraUsuarioPublico(linha: LinhaDeUsuario): UsuarioPublico {
  return {
    id: linha.id,
    nome: linha.nome,
    login: linha.login,
    email: linha.email,
    foto: linha.foto,
    temSenha: linha.senhaHash !== null,
    emailVerificado: linha.emailVerificadoEm !== null,
    precisaConfirmarEmail: motivoDoBloqueio(linha, envioDeEmailEstaConfigurado()) !== null,
    codigoDeEmailPendente:
      problemaComOCodigo({
        hash: linha.codigoDeEmailHash,
        expiraEm: linha.codigoDeEmailExpiraEm,
        tentativas: linha.codigoDeEmailTentativas,
      }) === null,
  };
}
