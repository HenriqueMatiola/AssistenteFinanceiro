/**
 * Entrar com o Google: conferir quem o navegador diz que é.
 *
 * O fluxo, do começo:
 *
 *  1. O navegador mostra o botão do Google e a pessoa escolhe uma conta.
 *  2. O Google devolve ao navegador um "ID token" — um JWT assinado por ele,
 *     dizendo quem entrou e para qual aplicativo.
 *  3. O navegador manda esse token para cá.
 *
 * O passo 3 é o motivo deste arquivo existir. O token chega pelo mesmo caminho
 * que qualquer outro dado de formulário, e um token inventado à mão chegaria
 * igual. Quem separa um do outro é a assinatura: `verifyIdToken` busca as
 * chaves públicas do Google (e as guarda em memória), confere a assinatura, a
 * validade e — o mais fácil de esquecer — se o token foi emitido para ESTE
 * aplicativo. Sem essa última checagem, um token legítimo emitido para
 * qualquer outro site serviria para entrar aqui.
 */
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';
import { ErroDeValidacao } from './validacao.ts';

/**
 * O mesmo identificador que o frontend usa no botão. Não é segredo — ele
 * aparece no HTML da página. O que ele faz aqui é dizer ao Google de quem os
 * tokens precisam ser para valerem.
 */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';

/**
 * O cliente guarda as chaves públicas do Google entre uma verificação e outra,
 * então vale a pena ser um só para o processo inteiro.
 */
const cliente = new OAuth2Client(CLIENT_ID);

/** Sem o identificador configurado, a rota inteira sai do ar — veja `server.ts`. */
export function entrarComGoogleEstaConfigurado(): boolean {
  return CLIENT_ID !== '';
}

/** O que o Google conta sobre quem entrou, já limpo do resto do token. */
export interface PerfilDoGoogle {
  /** O `sub`: o identificador da conta, estável mesmo se o e-mail mudar. */
  googleId: string;
  email: string;
  /** Como a pessoa se chama no Google. Vazio em conta sem nome definido. */
  nome: string;
}

/**
 * Confere o ID token e devolve o perfil de quem entrou.
 *
 * Lança `ErroDeValidacao` em qualquer recusa — token adulterado, expirado,
 * emitido para outro aplicativo ou de e-mail não verificado. A mensagem é a
 * mesma nos primeiros casos de propósito: quem manda um token forjado não
 * ganha um relatório de qual detalhe entregou a farsa.
 */
export async function verificarCredencialDoGoogle(bruto: unknown): Promise<PerfilDoGoogle> {
  if (typeof bruto !== 'string' || !bruto) {
    throw new ErroDeValidacao('Credencial do Google ausente.');
  }

  let conteudo;
  try {
    const ticket = await cliente.verifyIdToken({ idToken: bruto, audience: CLIENT_ID });
    conteudo = ticket.getPayload();
  } catch {
    throw new ErroDeValidacao('Não consegui confirmar sua conta do Google. Tente de novo.');
  }

  if (!conteudo?.sub || !conteudo.email) {
    throw new ErroDeValidacao('Não consegui confirmar sua conta do Google. Tente de novo.');
  }

  /*
   * `email_verified` é o que impede alguém de abrir uma conta Google com o
   * e-mail de outra pessoa e, com ela, assumir a conta que já existe aqui —
   * a rota vincula pelo e-mail quando ele bate. Contas Google comuns vêm
   * sempre verificadas; a checagem existe para os casos em que não vêm.
   */
  if (!conteudo.email_verified) {
    throw new ErroDeValidacao('Seu e-mail do Google ainda não foi verificado.');
  }

  return {
    googleId: conteudo.sub,
    email: conteudo.email.trim().toLowerCase(),
    nome: (conteudo.name ?? '').trim(),
  };
}

/** Mesmos limites de `credenciais.ts` — o login gerado aqui é login de verdade. */
const MINIMO_LOGIN = 3;
const MAXIMO_LOGIN = 20;

/**
 * Inventa um nome de usuário a partir do e-mail do Google.
 *
 * Quem entra pelo Google nunca escolhe um, mas a conta precisa ter: o login é
 * único, aparece no perfil e é o segundo jeito de entrar. `maria.souza@gmail`
 * vira `maria.souza`.
 *
 * Devolve uma LISTA de candidatos, do melhor para o pior, porque o primeiro
 * pode já estar tomado — quem escolhe é a rota, que sabe consultar o banco.
 * O último candidato termina em número grande e praticamente nunca colide;
 * se colidir, a rota trata como conflito comum.
 */
export function candidatosDeLogin(email: string): string[] {
  const local = email.split('@')[0] ?? '';

  // Fora do formato aceito, o caractere vira ponto em vez de sumir: `maria+
  // financas` viraria `mariafinancas`, um nome que ninguém reconhece.
  const base = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    // Pontuação sobrando nas pontas ou repetida no meio é ruído, não nome.
    .replace(/[._-]{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, MAXIMO_LOGIN);

  // E-mail curto ou só de símbolos não sobra nada aproveitável.
  const raiz = base.length >= MINIMO_LOGIN ? base : 'usuario';

  const candidatos = [raiz];

  for (const sufixo of ['2', '3', '4', '5', String(Date.now()).slice(-6)]) {
    // O sufixo entra no lugar do fim da raiz quando não há folga: um login de
    // 21 caracteres seria recusado pela mesma regra que vale para todo mundo.
    candidatos.push(raiz.slice(0, MAXIMO_LOGIN - sufixo.length) + sufixo);
  }

  return candidatos;
}
