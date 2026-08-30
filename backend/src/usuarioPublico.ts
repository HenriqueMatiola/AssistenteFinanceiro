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
} as const;

/** O que a linha do banco tem, do ponto de vista deste módulo. */
interface LinhaDeUsuario {
  id: number;
  nome: string;
  login: string;
  email: string | null;
  foto: string | null;
  senhaHash: string | null;
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
}

export function paraUsuarioPublico(linha: LinhaDeUsuario): UsuarioPublico {
  return {
    id: linha.id,
    nome: linha.nome,
    login: linha.login,
    email: linha.email,
    foto: linha.foto,
    temSenha: linha.senhaHash !== null,
  };
}
