/**
 * Autenticação: geração e verificação do token de login (JWT).
 *
 * Um JWT é um texto assinado com o JWT_SECRET. Ele carrega o id do usuário
 * dentro dele, então o backend descobre quem está pedindo sem consultar o
 * banco. Qualquer um consegue LER o conteúdo de um JWT — por isso nunca se
 * coloca senha lá dentro —, mas ninguém consegue FORJAR um sem o segredo.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

// O `?? ''` deixa o tipo como string (e não "string ou indefinido"), e a
// verificação logo abaixo derruba o servidor se a variável estiver faltando.
const segredo: string = process.env.JWT_SECRET ?? '';

if (!segredo) {
  throw new Error('JWT_SECRET não definida. Veja backend/.env.example.');
}

// Depois disso o usuário precisa fazer login de novo.
const VALIDADE_DO_TOKEN = '7d';

// Ensina ao TypeScript que nossas requisições podem carregar um usuarioId,
// preenchido pelo middleware abaixo.
declare global {
  namespace Express {
    interface Request {
      usuarioId?: number;
    }
  }
}

export function gerarToken(usuarioId: number): string {
  return jwt.sign({ usuarioId }, segredo, { expiresIn: VALIDADE_DO_TOKEN });
}

/**
 * Middleware: roda antes da rota e só deixa passar quem mandou um token
 * válido no cabeçalho `Authorization: Bearer <token>`.
 */
export function exigirLogin(req: Request, res: Response, next: NextFunction): void {
  const cabecalho = req.headers.authorization;

  if (!cabecalho?.startsWith('Bearer ')) {
    res.status(401).json({ erro: 'Não autenticado. Faça login.' });
    return;
  }

  const token = cabecalho.slice('Bearer '.length);

  try {
    const conteudo = jwt.verify(token, segredo);

    // O token veio de fora, então conferimos o que tem dentro em vez de
    // simplesmente confiar no formato.
    const usuarioId =
      typeof conteudo === 'object' && conteudo !== null
        ? (conteudo as Record<string, unknown>)['usuarioId']
        : undefined;

    if (typeof usuarioId !== 'number') {
      res.status(401).json({ erro: 'Sessão inválida. Faça login de novo.' });
      return;
    }

    // A partir daqui, qualquer rota protegida sabe de quem é a requisição.
    req.usuarioId = usuarioId;
    next();
  } catch {
    // Cai aqui se o token foi adulterado ou se já expirou.
    res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
  }
}

/**
 * Lê o id do usuário dono da requisição.
 * Só funciona em rotas montadas atrás de `exigirLogin`; se alguém esquecer o
 * middleware, isto estoura na hora em vez de devolver dados sem filtro.
 */
export function idDoUsuarioLogado(req: Request): number {
  if (typeof req.usuarioId !== 'number') {
    throw new Error('Rota protegida foi montada sem o middleware exigirLogin.');
  }
  return req.usuarioId;
}
