/**
 * Envio de e-mail pelo SMTP do Gmail.
 *
 * Por que Gmail com senha de app, e não um serviço tipo Resend: aqui só sai um
 * tipo de mensagem, para uma pessoa de cada vez, algumas vezes por dia. Um
 * serviço de envio pediria domínio próprio verificado antes de mandar para
 * terceiros — burocracia que não paga por si num app de uso pessoal.
 *
 * A "senha de app" é uma senha de 16 letras que o Google gera só para um
 * programa. Ela não é a senha da conta, não abre o Gmail no navegador e pode
 * ser revogada sozinha. Exige verificação em duas etapas ligada:
 * myaccount.google.com → Segurança → Verificação em duas etapas → Senhas de app.
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { VALIDADE_EM_MINUTOS } from './codigoPorEmail.ts';

const remetente = process.env.EMAIL_REMETENTE ?? '';
const senhaDeApp = process.env.EMAIL_SENHA_DE_APP ?? '';
const nomeDoRemetente = process.env.EMAIL_NOME_DO_REMETENTE ?? 'Assistente Financeiro';

/**
 * Se dá para mandar e-mail neste servidor.
 *
 * Mesmo desenho de `entrarComGoogleEstaConfigurado()`: sem configuração o
 * recurso apaga, e o resto do app segue funcionando. Quem clona o projeto não
 * precisa criar senha de app para poder rodar.
 */
export function envioDeEmailEstaConfigurado(): boolean {
  return Boolean(remetente && senhaDeApp);
}

/**
 * O transporte é criado uma vez só e reaproveitado: ele mantém a conexão com o
 * servidor do Gmail em pé, e abrir uma nova a cada e-mail custa segundos.
 *
 * Preguiçoso porque num servidor sem configuração ele nunca chega a existir.
 */
let transporte: nodemailer.Transporter | null = null;

function pegarTransporte(): nodemailer.Transporter {
  transporte ??= nodemailer.createTransport({
    service: 'gmail',
    auth: { user: remetente, pass: senhaDeApp },
  });
  return transporte;
}

/**
 * O texto do e-mail, nas duas formas que toda mensagem leva: HTML para quem lê
 * num cliente moderno e texto puro para o resto — e para os filtros de spam,
 * que desconfiam de mensagem só-HTML.
 *
 * Sem imagem, sem link e sem botão de propósito: uma mensagem curta com um
 * número dentro é a que menos parece golpe, justamente por não pedir clique.
 */
export function textoDoCodigo(nome: string, codigo: string): { texto: string; html: string } {
  const texto = [
    `Olá, ${nome}!`,
    '',
    `Seu código para confirmar o e-mail no Assistente Financeiro é: ${codigo}`,
    '',
    `Ele vale por ${VALIDADE_EM_MINUTOS} minutos.`,
    '',
    'Se não foi você quem pediu, pode ignorar esta mensagem — nada muda na sua conta.',
  ].join('\n');

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; font-size: 15px; color: #1c1c1e; line-height: 1.5;">
      <p>Olá, ${escaparHtml(nome)}!</p>
      <p>Seu código para confirmar o e-mail no <strong>Assistente Financeiro</strong> é:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">${codigo}</p>
      <p>Ele vale por ${VALIDADE_EM_MINUTOS} minutos.</p>
      <p style="color: #6b7280; font-size: 13px;">Se não foi você quem pediu, pode ignorar esta mensagem — nada muda na sua conta.</p>
    </div>
  `.trim();

  return { texto, html };
}

/**
 * O e-mail de "esqueci minha senha".
 *
 * `contaSemSenha` troca "redefinir" por "criar": quem abriu a conta pelo Google
 * nunca escolheu uma, e falar em recuperar o que nunca existiu confunde.
 *
 * A frase final é a parte que mais importa numa mensagem destas: se não foi a
 * pessoa que pediu, ela precisa saber que ignorar basta — a senha atual dela
 * continua valendo, e ninguém entrou em lugar nenhum.
 */
export function textoDoCodigoDeSenha(
  nome: string,
  codigo: string,
  contaSemSenha: boolean
): { texto: string; html: string } {
  const acao = contaSemSenha ? 'criar uma senha' : 'redefinir sua senha';

  const texto = [
    `Olá, ${nome}!`,
    '',
    `Seu código para ${acao} no Assistente Financeiro é: ${codigo}`,
    '',
    `Ele vale por ${VALIDADE_EM_MINUTOS} minutos e só pode ser usado uma vez.`,
    '',
    'Se não foi você quem pediu, pode ignorar esta mensagem: sua senha atual',
    'continua valendo e ninguém entrou na sua conta.',
  ].join('\n');

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; font-size: 15px; color: #1c1c1e; line-height: 1.5;">
      <p>Olá, ${escaparHtml(nome)}!</p>
      <p>Seu código para ${acao} no <strong>Assistente Financeiro</strong> é:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">${codigo}</p>
      <p>Ele vale por ${VALIDADE_EM_MINUTOS} minutos e só pode ser usado uma vez.</p>
      <p style="color: #6b7280; font-size: 13px;">Se não foi você quem pediu, pode ignorar esta mensagem: sua senha atual continua valendo e ninguém entrou na sua conta.</p>
    </div>
  `.trim();

  return { texto, html };
}

/**
 * O nome vem do que a pessoa digitou no Perfil, então ele não entra cru no
 * HTML: quem se chamasse `<script>…` mandaria isso para dentro da mensagem.
 */
function escaparHtml(bruto: string): string {
  return bruto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Manda o código de recuperação de senha. Estoura se o envio falhar. */
export async function enviarCodigoDeSenha(
  para: string,
  nome: string,
  codigo: string,
  contaSemSenha: boolean
): Promise<void> {
  const { texto, html } = textoDoCodigoDeSenha(nome, codigo, contaSemSenha);

  await pegarTransporte().sendMail({
    from: `"${nomeDoRemetente}" <${remetente}>`,
    to: para,
    subject: `${codigo} é o seu código para ${contaSemSenha ? 'criar a senha' : 'redefinir a senha'}`,
    text: texto,
    html,
  });
}

/** Manda o código para a caixa de e-mail. Estoura se o envio falhar. */
export async function enviarCodigoDeConfirmacao(
  para: string,
  nome: string,
  codigo: string
): Promise<void> {
  const { texto, html } = textoDoCodigo(nome, codigo);

  await pegarTransporte().sendMail({
    from: `"${nomeDoRemetente}" <${remetente}>`,
    to: para,
    subject: `${codigo} é o seu código de confirmação`,
    text: texto,
    html,
  });
}
