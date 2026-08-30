import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.ts';
import { gerarToken, exigirLogin } from './auth.ts';
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
import { rotasDePerfil } from './rotas/perfil.ts';

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

    // Mesma mensagem para "não existe" e "senha errada": não entregamos de
    // graça a informação de quais contas existem.
    if (!usuario || !senhaConfere) {
      res.status(401).json({ erro: 'Usuário, e-mail ou senha inválidos.' });
      return;
    }

    res.json({
      token: gerarToken(usuario.id),
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        login: usuario.login,
        email: usuario.email,
        foto: usuario.foto,
      },
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

    const usuario = await prisma.usuario.create({
      data: {
        nome: nomeDeExibicao(login),
        login,
        email,
        senhaHash: await bcrypt.hash(senha, CUSTO_DO_HASH),
      },
      select: { id: true, nome: true, login: true, email: true, foto: true },
    });

    res.status(201).json({ token: gerarToken(usuario.id), usuario });
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

// --- Rotas protegidas -------------------------------------------------------
// Tudo abaixo exige um token válido. O middleware preenche req.usuarioId.

// Devolve os dados do usuário dono do token. O frontend usa isto ao abrir a
// página para saber se o token guardado ainda vale.
app.get('/api/eu', exigirLogin, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuarioId },
      select: { id: true, nome: true, login: true, email: true, foto: true, criadoEm: true },
    });

    if (!usuario) {
      // Token válido, mas o usuário sumiu do banco (ex: apagado à mão).
      res.status(401).json({ erro: 'Usuário não encontrado.' });
      return;
    }

    res.json({ usuario });
  } catch (erro) {
    console.error('Falha ao buscar o usuário:', erro);
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// Nome, e-mail, foto e troca de senha da própria conta.
app.use('/api/perfil', exigirLogin, rotasDePerfil);

// Lançamentos. O exigirLogin fica no grupo inteiro: nenhuma rota de
// transação existe sem autenticação, nem por esquecimento.
app.use('/api/transacoes', exigirLogin, rotasDeTransacoes);

// Totais e agrupamentos do Dashboard.
app.use('/api/resumo', exigirLogin, rotasDeResumo);

// Contas que se repetem todo mês, e a projeção que as usa.
app.use('/api/recorrencias', exigirLogin, rotasDeRecorrencias);
app.use('/api/projecao', exigirLogin, rotasDeProjecao);

// Carteira de ativos, com cotação buscada ao vivo a cada consulta.
app.use('/api/investimentos', exigirLogin, rotasDeInvestimentos);

const porta = Number(process.env.PORT ?? 3001);

export default app;

if (!process.env.VERCEL) {
  const porta = Number(process.env.PORT ?? 3001);

  app.listen(porta, () => {
    console.log(`Backend rodando em http://localhost:${porta}`);
  });
}

