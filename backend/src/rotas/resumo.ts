/**
 * Rotas do Dashboard: números já somados, prontos para exibir.
 *
 * Quem soma é o PostgreSQL, não o Node. Em vez de baixar todas as transações
 * do mês e somar aqui, pedimos ao banco o total pronto — são 3 números na
 * resposta em vez de 300 linhas, e a soma sai exata em centavos porque o
 * DECIMAL do Postgres não passa por ponto flutuante.
 *
 * Montado atrás de `exigirLogin`, então `req.usuarioId` sempre existe e toda
 * consulta filtra por ele — é isso que mantém os dados de cada um separados.
 */
import { Router, type Response } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { ErroDeValidacao, intervaloDoMes, mesAtualUTC } from '../validacao.ts';
import { TipoTransacao } from '../generated/prisma/enums.ts';

export const rotasDeResumo = Router();

// --- Auxiliares -------------------------------------------------------------

/** O Prisma devolve a soma como Decimal — ou null, quando não há nenhuma linha. */
function somaParaNumero(soma: { toNumber(): number } | null | undefined): number {
  return soma ? soma.toNumber() : 0;
}

/**
 * Corta a sujeira do ponto flutuante depois de uma conta com dinheiro.
 * Em JavaScript, `0.1 + 0.2` dá 0.30000000000000004: `number` é binário e não
 * representa centavos exatamente. As somas vêm exatas do banco; só a subtração
 * do saldo acontece aqui, e é ela que precisa deste arredondamento.
 */
function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Lê `?mes=AAAA-MM`, caindo no mês atual quando o cliente não manda nada. */
function mesPedido(valorBruto: unknown): string {
  return typeof valorBruto === 'string' && valorBruto !== '' ? valorBruto : mesAtualUTC();
}

/** Traduz a exceção em resposta HTTP: 400 se foi culpa do pedido, 500 se foi nossa. */
function responderErro(res: Response, erro: unknown, contexto: string): void {
  if (erro instanceof ErroDeValidacao) {
    res.status(400).json({ erro: erro.message });
    return;
  }
  console.error(`${contexto}:`, erro);
  res.status(500).json({ erro: `Erro interno ao ${contexto}.` });
}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/resumo?mes=2026-08
 * Totais do mês: quanto entrou, quanto saiu e o que sobrou.
 */
rotasDeResumo.get('/', async (req, res) => {
  try {
    const mes = mesPedido(req.query['mes']);

    // Uma consulta só, agrupada por tipo: o banco devolve no máximo duas
    // linhas (GANHO e GASTO), cada uma já com a soma do mês.
    const porTipo = await prisma.transacao.groupBy({
      by: ['tipo'],
      where: {
        usuarioId: idDoUsuarioLogado(req),
        data: intervaloDoMes(mes),
      },
      _sum: { valor: true },
    });

    // `find` devolve undefined quando o mês não teve nenhum ganho (ou nenhum
    // gasto); o somaParaNumero transforma essa ausência em 0.
    const entradas = somaParaNumero(
      porTipo.find((linha) => linha.tipo === TipoTransacao.GANHO)?._sum.valor
    );
    const saidas = somaParaNumero(
      porTipo.find((linha) => linha.tipo === TipoTransacao.GASTO)?._sum.valor
    );

    res.json({
      mes,
      entradas,
      saidas,
      // Negativo quando se gastou mais do que entrou — e é justamente esse o
      // número que o dashboard existe para mostrar.
      saldo: arredondarCentavos(entradas - saidas),
    });
  } catch (erro) {
    responderErro(res, erro, 'calcular o resumo do mês');
  }
});

/**
 * GET /api/resumo/categorias?mes=2026-08
 * Gastos do mês somados por categoria, do maior para o menor — é o que
 * alimenta o gráfico. Só GASTO: um gráfico que misturasse salário com mercado
 * não responderia nenhuma pergunta.
 */
rotasDeResumo.get('/categorias', async (req, res) => {
  try {
    const mes = mesPedido(req.query['mes']);

    const porCategoria = await prisma.transacao.groupBy({
      by: ['categoria'],
      where: {
        usuarioId: idDoUsuarioLogado(req),
        tipo: TipoTransacao.GASTO,
        data: intervaloDoMes(mes),
      },
      _sum: { valor: true },
      // Ordenar no banco, e não no navegador, mantém a regra num lugar só.
      orderBy: { _sum: { valor: 'desc' } },
    });

    const categorias = porCategoria.map((linha) => ({
      categoria: linha.categoria,
      total: somaParaNumero(linha._sum.valor),
    }));

    res.json({
      mes,
      categorias,
      // O total vai junto para o frontend calcular percentuais sem somar de novo.
      total: arredondarCentavos(categorias.reduce((soma, c) => soma + c.total, 0)),
    });
  } catch (erro) {
    responderErro(res, erro, 'agrupar os gastos por categoria');
  }
});
