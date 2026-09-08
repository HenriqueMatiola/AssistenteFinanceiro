/**
 * Quem já pode USAR o app, e quem ainda precisa confirmar o e-mail.
 *
 * Entrar e poder usar deixaram de ser a mesma coisa. O login diz quem a pessoa
 * é; esta regra diz se ela já provou que a caixa de e-mail que cadastrou é
 * dela. Sem a separação, qualquer um abre conta com o endereço de outra pessoa
 * e usa o app à vontade — e no dia em que essa conta pedir "esqueci minha
 * senha", o código vai cair na caixa de quem nunca pediu nada.
 *
 * Quem entra pelo Google não esbarra aqui: a conta dele já nasce confirmada,
 * porque o ID token assinado pelo Google traz `email_verified` — uma prova mais
 * forte do que qualquer código de 6 dígitos que a gente mandasse depois.
 *
 * Módulo próprio, sem Prisma nem Express, pelo mesmo motivo de
 * `codigoPorEmail.ts`: aqui mora a decisão, e não o vaivém com o banco. Quem
 * aplica a regra são dois lugares — o middleware em `auth.ts`, que barra as
 * rotas, e `usuarioPublico.ts`, que conta a mesma verdade para a tela.
 */

/**
 * Por que a conta está barrada. São dois problemas com saídas diferentes: um
 * se resolve digitando o código, o outro exige cadastrar um e-mail antes de
 * haver o que confirmar.
 */
export type MotivoDoBloqueio = 'sem-email' | 'nao-confirmado';

/** A linha do usuário, do ponto de vista deste módulo. */
export interface ContaParaLiberar {
  email: string | null;
  emailVerificadoEm: Date | null;
}

/**
 * A regra. `null` quer dizer "pode usar o app".
 *
 * `podeMandarEmail` é a válvula de segurança, e o parâmetro mais importante
 * desta função: um servidor que não sabe mandar e-mail não tem como exigir
 * confirmação por e-mail. Sem ela, quem sobe o app sem senha de app configurada
 * faz login, cai na tela de confirmação, pede o código, leva um 503 e não sai
 * mais dali — trancado para fora do próprio app, sem saída pela interface.
 *
 * Ou seja: a exigência se liga sozinha no dia em que o envio for configurado, e
 * se desliga sozinha se ele deixar de existir. Por isso ela mora numa função só
 * e é consultada de dois lugares — duas cópias da mesma decisão acabariam
 * discordando uma da outra, e a tela travaria o que o servidor liberou.
 */
export function motivoDoBloqueio(
  conta: ContaParaLiberar,
  podeMandarEmail: boolean
): MotivoDoBloqueio | null {
  if (!podeMandarEmail) return null;
  if (conta.emailVerificadoEm) return null;

  return conta.email ? 'nao-confirmado' : 'sem-email';
}

/** A frase que a pessoa lê quando bate no portão. */
export function mensagemDoBloqueio(motivo: MotivoDoBloqueio): string {
  switch (motivo) {
    case 'nao-confirmado':
      return 'Confirme seu e-mail para usar o app.';
    case 'sem-email':
      return 'Cadastre um e-mail no Perfil e confirme-o para usar o app.';
  }
}
