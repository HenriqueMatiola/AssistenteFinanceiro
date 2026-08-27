import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.ts';
import { gerarToken, exigirLogin } from './auth.ts';
import { rotasDeTransacoes } from './rotas/transacoes.ts';
import { rotasDeResumo } from './rotas/resumo.ts';

const app = express();

// Autoriza o navegador a chamar esta API a partir do endereço do frontend.
// Sem isto, o navegador bloqueia a chamada por política de mesma origem (CORS).
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));

// Permite receber corpo de requisição em JSON.
app.use(express.json());

// Hash de uma senha que ninguém usa. Quando o login não existe, comparamos
// contra ele só para gastar mais ou menos o mesmo tempo — senão daria para
// descobrir quais logins existem cronometrando as respostas.
const HASH_DESCARTAVEL = bcrypt.hashSync('login-inexistente', 10);

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

// Login: confere usuário e senha e devolve o token de sessão.
app.post('/api/login', async (req, res) => {
  try {
    const { login, senha } = req.body as { login?: unknown; senha?: unknown };

    if (typeof login !== 'string' || typeof senha !== 'string' || !login || !senha) {
      res.status(400).json({ erro: 'Informe login e senha.' });
      return;
    }

    const usuario = await prisma.usuario.findUnique({
      where: { login: login.trim().toLowerCase() },
    });

    const senhaConfere = await bcrypt.compare(senha, usuario?.senhaHash ?? HASH_DESCARTAVEL);

    // Mesma mensagem para "login não existe" e "senha errada": não entregamos
    // de graça a informação de quais logins são válidos.
    if (!usuario || !senhaConfere) {
      res.status(401).json({ erro: 'Login ou senha inválidos.' });
      return;
    }

    res.json({
      token: gerarToken(usuario.id),
      usuario: { id: usuario.id, nome: usuario.nome, login: usuario.login },
    });
  } catch (erro) {
    console.error('Falha no login:', erro);
    res.status(500).json({ erro: 'Erro interno ao fazer login.' });
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
      select: { id: true, nome: true, login: true, criadoEm: true },
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

// Lançamentos. O exigirLogin fica no grupo inteiro: nenhuma rota de
// transação existe sem autenticação, nem por esquecimento.
app.use('/api/transacoes', exigirLogin, rotasDeTransacoes);

// Totais e agrupamentos do Dashboard.
app.use('/api/resumo', exigirLogin, rotasDeResumo);

const porta = Number(process.env.PORT ?? 3001);

app.listen(porta, () => {
  console.log(`Backend rodando em http://localhost:${porta}`);
});
