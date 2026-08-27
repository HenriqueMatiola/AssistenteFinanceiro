/**
 * Rotas de lançamentos (transações).
 *
 * IMPORTANTE: este router é montado atrás do middleware `exigirLogin`, então
 * `req.usuarioId` sempre existe aqui. Toda consulta filtra por ele — é isso
 * que impede um usuário de ver os dados do outro.
 */
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { TipoTransacao } from '../generated/prisma/enums.ts';
import { ErroDeValidacao, intervaloDoMes } from '../validacao.ts';

export const rotasDeTransacoes = Router();

// --- Validação --------------------------------------------------------------

/** Aceita "2026-08-18" e devolve a data em UTC, sem hora. */
function validarData(bruto: unknown): Date {
  if (typeof bruto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
    throw new ErroDeValidacao('Data inválida. Use o formato AAAA-MM-DD.');
  }

  // O "T00:00:00.000Z" força UTC. Sem ele, o Node interpretaria no fuso local
  // e a data poderia recuar um dia.
  const data = new Date(`${bruto}T00:00:00.000Z`);

  if (Number.isNaN(data.getTime())) {
    throw new ErroDeValidacao('Data inexistente no calendário.');
  }
  // Pega casos como 2026-02-31, que o construtor "conserta" para 03-03.
  if (data.toISOString().slice(0, 10) !== bruto) {
    throw new ErroDeValidacao('Data inexistente no calendário.');
  }

  return data;
}

/**
 * Devolve o valor como string com 2 casas (ex: "1234.56").
 * Texto, e não número, porque é assim que o valor chega ao PostgreSQL sem
 * passar por nenhuma conversão que possa perder centavos.
 */
function validarValor(bruto: unknown): string {
  const numero =
    typeof bruto === 'string' ? Number(bruto.replace(',', '.')) : bruto;

  if (typeof numero !== 'number' || !Number.isFinite(numero)) {
    throw new ErroDeValidacao('Valor inválido.');
  }
  if (numero <= 0) {
    // O sinal vem do campo `tipo`, não do valor.
    throw new ErroDeValidacao('O valor precisa ser maior que zero.');
  }
  // A coluna é DECIMAL(12,2): no máximo 10 dígitos antes da vírgula.
  if (numero >= 10_000_000_000) {
    throw new ErroDeValidacao('Valor alto demais.');
  }

  return numero.toFixed(2);
}

function validarCategoria(bruto: unknown): string {
  if (typeof bruto !== 'string' || !bruto.trim()) {
    throw new ErroDeValidacao('Informe uma categoria.');
  }
  const categoria = bruto.trim();
  if (categoria.length > 60) {
    throw new ErroDeValidacao('Categoria longa demais (máximo 60 caracteres).');
  }
  return categoria;
}

function validarTipo(bruto: unknown): TipoTransacao {
  if (bruto !== TipoTransacao.GASTO && bruto !== TipoTransacao.GANHO) {
    throw new ErroDeValidacao('Tipo inválido. Use GASTO ou GANHO.');
  }
  return bruto;
}

// --- Formato de saída -------------------------------------------------------

interface TransacaoDoBanco {
  id: number;
  data: Date;
  valor: { toNumber(): number };
  categoria: string;
  tipo: TipoTransacao;
}

/**
 * Converte o formato do banco para o formato da API:
 * - `data` vira texto "AAAA-MM-DD" (sem hora, sem fuso)
 * - `valor` vira número (no banco é um objeto Decimal)
 */
function paraResposta(t: TransacaoDoBanco) {
  return {
    id: t.id,
    data: t.data.toISOString().slice(0, 10),
    valor: t.valor.toNumber(),
    categoria: t.categoria,
    tipo: t.tipo,
  };
}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/transacoes
 * Filtros opcionais: ?mes=2026-08  &tipo=GASTO
 */
rotasDeTransacoes.get('/', async (req, res) => {
  try {
    const filtro: {
      usuarioId: number;
      tipo?: TipoTransacao;
      data?: { gte: Date; lt: Date };
    } = { usuarioId: idDoUsuarioLogado(req) };

    const { mes, tipo } = req.query;

    if (typeof tipo === 'string' && tipo !== '') {
      filtro.tipo = validarTipo(tipo);
    }

    if (typeof mes === 'string' && mes !== '') {
      filtro.data = intervaloDoMes(mes);
    }

    const transacoes = await prisma.transacao.findMany({
      where: filtro,
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
    });

    res.json({ transacoes: transacoes.map(paraResposta) });
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }
    console.error('Falha ao listar transações:', erro);
    res.status(500).json({ erro: 'Erro interno ao listar transações.' });
  }
});

/** POST /api/transacoes — cria um lançamento para o usuário logado. */
rotasDeTransacoes.post('/', async (req, res) => {
  try {
    const corpo = req.body as Record<string, unknown>;

    const transacao = await prisma.transacao.create({
      data: {
        // O dono vem SEMPRE do token, nunca do corpo da requisição — senão
        // qualquer um poderia lançar transações na conta de outra pessoa.
        usuarioId: idDoUsuarioLogado(req),
        data: validarData(corpo['data']),
        valor: validarValor(corpo['valor']),
        categoria: validarCategoria(corpo['categoria']),
        tipo: validarTipo(corpo['tipo']),
      },
    });

    res.status(201).json({ transacao: paraResposta(transacao) });
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }
    console.error('Falha ao criar transação:', erro);
    res.status(500).json({ erro: 'Erro interno ao criar a transação.' });
  }
});
