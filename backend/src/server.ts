import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.ts';
import { gerarToken, exigirLogin, exigirEmailConfirmado } from './auth.ts';
import { ErroDeValidacao } from './validacao.ts';
import {
  validarNomeDeUsuario,
  validarEmail,
  validarSenha,
  normalizarIdentificador,
  nomeDeExibicao,
} from './credenciais.ts';
import { rotasDeTransacoes } from './rotas/transacoes.ts';
import { rotasDeResumo } from './rotas/resumo.ts';
import { rotasDeRecorrencias } from './rotas/recorrencias.ts';
import { rotasDeProjecao } from './rotas/projecao.ts';
import { rotasDeInvestimentos } from './rotas/investimentos.ts';
import { rotasDeAcertos } from './rotas/acertos.ts';
import { rotasDePerfil } from './rotas/perfil.ts';
import {
  rotasDeConfirmacaoDeEmail,
  mandarCodigoDeConfirmacao,
} from './rotas/confirmacaoDeEmail.ts';
import { rotasDeRecuperacaoDeSenha } from './rotas/recuperacaoDeSenha.ts';
import { envioDeEmailEstaConfigurado } from './email.ts';
import {
  verificarCredencialDoGoogle,
  candidatosDeLogin,
  entrarComGoogleEstaConfigurado,
} from './google.ts';
import { CAMPOS_DO_USUARIO, paraUsuarioPublico } from './usuarioPublico.ts';

const app = express();

// Autoriza o navegador a chamar esta API a partir do endereço do frontend.
// Sem isto, o navegador bloqueia a chamada por política de mesma origem (CORS).
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));

// Permite receber corpo de requisição em JSON.
//
// O limite sobe de 100 KB (padrão) para 1 MB por causa da foto de perfil: ela
// viaja como data URI, e base64 engorda o arquivo em um terço. O teto de
// verdade é o de `foto.ts`, que recusa imagem acima de 400 KB.
app.use(express.json({ limit: '1mb' }));

// Quanto maior, mais lento (de propósito) fica calcular o hash — o que atrapalha
// quem tentar adivinhar senhas por força bruta. 10 é o padrão recomendado.
const CUSTO_DO_HASH = 10;

// Hash de uma senha que ninguém usa. Quando o login não existe, comparamos
// contra ele só para gastar mais ou menos o mesmo tempo — senão daria para
// descobrir quais logins existem cronometrando as respostas.
const HASH_DESCARTAVEL = bcrypt.hashSync('login-inexistente', CUSTO_DO_HASH);

// --- Rotas públicas ---------------------------------------------------------

// Rota "hello world" — só prova que o backend está no ar.
app.get('/api/hello', (_req, res) => {
  res.json({
    mensagem: 'Olá! O backend do Assistente Financeiro está no ar.',
    horario: new Date().toISOString(),
  });
});

// Rota de saúde — prova que o backend consegue falar com o PostgreSQL.
app.get('/api/health', async (_req, res) => {
  try {
    const resultado = await prisma.$queryRaw<{ agora: Date; versao: string }[]>`
      SELECT NOW() AS agora, version() AS versao
    `;
    const linha = resultado[0];

    res.json({
      api: 'ok',
      banco: 'ok',
      horarioDoBanco: linha?.agora ?? null,
      versaoDoBanco: linha?.versao ?? null,
    });
  } catch (erro) {
    console.error('Falha ao consultar o banco:', erro);
    res.status(500).json({
      api: 'ok',
      banco: 'erro',
      detalhe: erro instanceof Error ? erro.message : 'erro desconhecido',
    });
  }
});

// Login: confere quem está entrando e devolve o token de sessão.
// O campo `login` aceita o nome de usuário OU o e-mail — quem entra não
// precisa lembrar qual dos dois cadastrou.
app.post('/api/login', async (req, res) => {
  try {
    const { login, senha } = req.body as { login?: unknown; senha?: unknown };

    if (typeof login !== 'string' || typeof senha !== 'string' || !login || !senha) {
      res.status(400).json({ erro: 'Informe usuário ou e-mail e a senha.' });
      return;
    }

    const identificador = normalizarIdentificador(login);

    // findFirst com OR, e não dois findUnique: uma consulta só, e o mesmo
    // caminho serve para os dois campos. Ambos são únicos, então no máximo
    // uma linha volta.
    const usuario = await prisma.usuario.findFirst({
      where: { OR: [{ login: identificador }, { email: identificador }] },
    });

    const senhaConfere = await bcrypt.compare(senha, usuario?.senhaHash ?? HASH_DESCARTAVEL);

    /*
     * Conta criada pelo Google não tem senha, e nenhuma senha digitada vai
     * funcionar nela. Dizer isso é melhor do que deixar a pessoa tentar de
     * novo até desistir — e não entrega nada de novo: o cadastro já responde
     * "esse e-mail já está em uso" para quem quiser descobrir se a conta
     * existe.
     */
    if (usuario && usuario.senhaHash === null) {
      res.status(401).json({
        erro: 'Esta conta entra pelo Google. Use o botão "Entrar com o Google".',
      });
      return;
    }

    // Mesma mensagem para "não existe" e "senha errada": não entregamos de
    // graça a informação de quais contas existem.
    if (!usuario || !senhaConfere) {
      res.status(401).json({ erro: 'Usuário, e-mail ou senha inválidos.' });
      return;
    }

    res.json({
      token: gerarToken(usuario.id),
      usuario: paraUsuarioPublico(usuario),
    });
  } catch (erro) {
    console.error('Falha no login:', erro);
    res.status(500).json({ erro: 'Erro interno ao fazer login.' });
  }
});

// Cadastro: cria a conta e já devolve o token, para quem acabou de se
// cadastrar cair direto no app em vez de digitar tudo de novo.
app.post('/api/cadastro', async (req, res) => {
  try {
    const corpo = req.body as { login?: unknown; email?: unknown; senha?: unknown };

    const login = validarNomeDeUsuario(corpo.login);
    const email = validarEmail(corpo.email);
    const senha = validarSenha(corpo.senha);

    // Conferimos antes de tentar gravar só para poder dizer QUAL dos dois já
    // está em uso. O índice UNIQUE do banco é quem de fato garante — se duas
    // pessoas se cadastrarem no mesmo instante, o P2002 lá embaixo pega.
    const jaExiste = await prisma.usuario.findFirst({
      where: { OR: [{ login }, { email }] },
      select: { login: true, email: true },
    });

    if (jaExiste) {
      res.status(409).json({
        erro:
          jaExiste.login === login
            ? 'Esse nome de usuário já está em uso.'
            : 'Esse e-mail já está em uso.',
      });
      return;
    }

    let usuario = await prisma.usuario.create({
      data: {
        nome: nomeDeExibicao(login),
        login,
        email,
        senhaHash: await bcrypt.hash(senha, CUSTO_DO_HASH),
      },
      select: CAMPOS_DO_USUARIO,
    });

    /*
     * O primeiro código sai junto com a conta.
     *
     * A pessoa vai cair na tela de confirmação de qualquer jeito; obrigá-la a
     * clicar em "Enviar código" para chegar lá seria um passo a mais para o
     * mesmo lugar. `usuario` é REATRIBUÍDO porque a linha volta atualizada, e é
     * ela que conta à tela que já existe um código esperando.
     *
     * Best-effort de propósito: a conta já existe e o token já vale, então um
     * Gmail fora do ar não pode derrubar o cadastro. Se o envio falhar, a
     * pessoa pede outro código pelo Perfil — exatamente o que ela faria se o
     * e-mail se perdesse no caminho.
     */
    if (envioDeEmailEstaConfigurado()) {
      try {
        usuario = await mandarCodigoDeConfirmacao(usuario.id, email, usuario.nome);
      } catch (erro) {
        console.error('Conta criada, mas o primeiro código não saiu:', erro);
      }
    }

    res.status(201).json({ token: gerarToken(usuario.id), usuario: paraUsuarioPublico(usuario) });
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }

    // P2002 = índice UNIQUE violado. Só chega aqui na corrida entre dois
    // cadastros simultâneos; a checagem acima cobre o caso normal.
    if (typeof erro === 'object' && erro !== null && 'code' in erro && erro.code === 'P2002') {
      res.status(409).json({ erro: 'Esse nome de usuário ou e-mail já está em uso.' });
      return;
    }

    console.error('Falha no cadastro:', erro);
    res.status(500).json({ erro: 'Erro interno ao criar a conta.' });
  }
});

/*
 * Entrar com o Google — a mesma rota serve para entrar e para criar conta.
 *
 * Não são duas coisas diferentes do ponto de vista de quem usa: a pessoa
 * escolhe a conta do Google e espera estar dentro. Quem decide se é a primeira
 * vez é o backend, olhando o que já existe no banco.
 *
 * Três caminhos, nesta ordem:
 *
 *  1. Já entrou pelo Google antes  → acha pelo `googleId` e pronto.
 *  2. Tem conta de senha com o mesmo e-mail → vincula as duas. É o que evita
 *     a conta duplicada de quem se cadastrou com senha e um dia clicou no
 *     botão do Google. Só é seguro porque o token traz o e-mail verificado.
 *  3. Nada disso → conta nova, com um login inventado a partir do e-mail.
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    if (!entrarComGoogleEstaConfigurado()) {
      res.status(503).json({
        erro: 'Entrar com o Google não está configurado neste servidor.',
      });
      return;
    }

    const perfil = await verificarCredencialDoGoogle(
      (req.body as { credencial?: unknown }).credencial
    );

    // 1. Quem já entrou pelo Google alguma vez.
    const jaVinculado = await prisma.usuario.findUnique({
      where: { googleId: perfil.googleId },
      select: CAMPOS_DO_USUARIO,
    });

    if (jaVinculado) {
      res.json({ token: gerarToken(jaVinculado.id), usuario: paraUsuarioPublico(jaVinculado) });
      return;
    }

    // 2. Conta que já existia com esse e-mail: passa a aceitar os dois
    //    caminhos de entrada, e a senha que ela tinha continua valendo.
    const mesmoEmail = await prisma.usuario.findUnique({
      where: { email: perfil.email },
      select: { id: true },
    });

    if (mesmoEmail) {
      const vinculado = await prisma.usuario.update({
        where: { id: mesmoEmail.id },
        data: {
          googleId: perfil.googleId,
          // O Google acabou de provar que esta caixa é da pessoa (o
          // `email_verified` do token). Não faz sentido pedir um código para
          // confirmar o que já está confirmado.
          emailVerificadoEm: new Date(),
        },
        select: CAMPOS_DO_USUARIO,
      });

      res.json({ token: gerarToken(vinculado.id), usuario: paraUsuarioPublico(vinculado) });
      return;
    }

    // 3. Conta nova. O login não é escolhido por ninguém, então é preciso
    //    achar um que ainda esteja livre.
    const candidatos = candidatosDeLogin(perfil.email);

    const ocupados = await prisma.usuario.findMany({
      where: { login: { in: candidatos } },
      select: { login: true },
    });

    const tomados = new Set(ocupados.map((u) => u.login));
    const login = candidatos.find((c) => !tomados.has(c));

    if (!login) {
      // Todos os candidatos tomados. Improvável a ponto de não valer um
      // caminho de recuperação: o último deles termina em seis dígitos do
      // relógio. Tentar de novo gera outros.
      res.status(409).json({ erro: 'Não consegui criar um nome de usuário. Tente de novo.' });
      return;
    }

    const usuario = await prisma.usuario.create({
      data: {
        // O nome do Google é como a pessoa se chama; sem ele, o login serve.
        // O corte em 40 é o mesmo limite do campo na tela de Perfil.
        nome: perfil.nome ? perfil.nome.slice(0, 40) : nomeDeExibicao(login),
        login,
        email: perfil.email,
        googleId: perfil.googleId,
        // Nasce confirmada: o token do Google só passa por `google.ts` se
        // trouxer `email_verified`.
        emailVerificadoEm: new Date(),
        // Sem senha: esta conta entra pelo Google. A tela de Perfil esconde
        // o "trocar senha" quando não há uma.
        senhaHash: null,
      },
      select: CAMPOS_DO_USUARIO,
    });

    res.status(201).json({ token: gerarToken(usuario.id), usuario: paraUsuarioPublico(usuario) });
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }

    // P2002 = índice UNIQUE violado. Aqui só acontece se duas abas entrarem
    // no mesmo instante com a mesma conta: uma cria, a outra esbarra. Na
    // segunda tentativa ela cai no caminho 1 e entra normalmente.
    if (typeof erro === 'object' && erro !== null && 'code' in erro && erro.code === 'P2002') {
      res.status(409).json({ erro: 'Entrada simultânea detectada. Tente de novo.' });
      return;
    }

    console.error('Falha ao entrar com o Google:', erro);
    res.status(500).json({ erro: 'Erro interno ao entrar com o Google.' });
  }
});

// --- Rotas protegidas -------------------------------------------------------
// Tudo abaixo exige um token válido. O middleware preenche req.usuarioId.

// Devolve os dados do usuário dono do token. O frontend usa isto ao abrir a
// página para saber se o token guardado ainda vale.
app.get('/api/eu', exigirLogin, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuarioId },
      select: CAMPOS_DO_USUARIO,
    });

    if (!usuario) {
      // Token válido, mas o usuário sumiu do banco (ex: apagado à mão).
      res.status(401).json({ erro: 'Usuário não encontrado.' });
      return;
    }

    res.json({ usuario: paraUsuarioPublico(usuario) });
  } catch (erro) {
    console.error('Falha ao buscar o usuário:', erro);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Daqui para baixo, DOIS portões em vez de um.
//
// `exigirLogin` responde "quem é você?"; `exigirEmailConfirmado` responde "você
// já provou que o e-mail que cadastrou é seu?". A divisão abaixo é toda por
// causa disso: as três primeiras rotas são a SAÍDA de quem foi barrado, e por
// isso seguem sem o segundo portão. Fechá-las junto seria trancar a pessoa do
// lado de fora e esconder a chave.

// "Esqueci minha senha". PÚBLICA de propósito: quem esqueceu a senha não tem
// como fazer login para provar quem é — quem prova é o e-mail.
app.use('/api/senha', rotasDeRecuperacaoDeSenha);

// Nome, e-mail, foto e troca de senha da própria conta. É aqui que quem errou
// o e-mail no cadastro conserta o endereço, e aqui que a conta antiga sem
// e-mail nenhum ganha um — logo, tem que valer mesmo para quem está barrado.
app.use('/api/perfil', exigirLogin, rotasDePerfil);

// Confirmação do e-mail por código. Atrás de exigirLogin de propósito: fosse
// rota aberta, daria para disparar e-mail deste servidor para qualquer
// endereço do mundo. E sem o segundo portão pelo motivo oposto — ela É o
// caminho para atravessá-lo.
app.use('/api/email', exigirLogin, rotasDeConfirmacaoDeEmail);

// Lançamentos. Os dois middlewares ficam no grupo inteiro: nenhuma rota de
// transação existe sem autenticação, nem por esquecimento.
app.use('/api/transacoes', exigirLogin, exigirEmailConfirmado, rotasDeTransacoes);

// Totais e agrupamentos do Dashboard.
app.use('/api/resumo', exigirLogin, exigirEmailConfirmado, rotasDeResumo);

// Contas que se repetem todo mês, e a projeção que as usa.
app.use('/api/recorrencias', exigirLogin, exigirEmailConfirmado, rotasDeRecorrencias);
app.use('/api/projecao', exigirLogin, exigirEmailConfirmado, rotasDeProjecao);

// Carteira de ativos, com cotação buscada ao vivo a cada consulta.
app.use('/api/investimentos', exigirLogin, exigirEmailConfirmado, rotasDeInvestimentos);

// Dinheiro emprestado, adiantado ou rateado com alguém — a aba "A receber e a
// pagar". Fica fora do balanço de propósito: um acerto não tem data, então não
// pertence a mês nenhum.
app.use('/api/acertos', exigirLogin, exigirEmailConfirmado, rotasDeAcertos);

const porta = Number(process.env.PORT ?? 3001);

export default app;

if (!process.env.VERCEL) {
  const porta = Number(process.env.PORT ?? 3001);

  app.listen(porta, () => {
    console.log(`Backend rodando em http://localhost:${porta}`);
  });
}

