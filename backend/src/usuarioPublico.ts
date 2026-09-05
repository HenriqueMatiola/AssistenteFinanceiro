/**
 * O usuário como o frontend o vê.
 *
 * Existe num módulo próprio porque quatro rotas devolvem a mesma pessoa —
 * entrar, cadastrar, entrar com o Google e `/api/eu` — e a lista de campos
 * duplicada em quatro lugares é a lista que um dia esquece de crescer numa
 * delas. O hash da senha nunca sai daqui.
 */

/** O que buscar no banco. Inclui o hash só para responder `temSenha` abaixo. */
export const CAMPOS_DO_USUARIO = {
  id: true,
  nome: true,
  login: true,
  email: true,
  foto: true,
  senhaHash: true,
  emailVerificadoEm: true,
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
   * Se a pessoa já provou que a caixa de e-mail é dela. A tela usa isto para
   * decidir se mostra a faixa pedindo confirmação. A data em si não sai do
   * backend: para a interface, só interessa o sim ou não.
   */
  emailVerificado: boolean;
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
  };
}
