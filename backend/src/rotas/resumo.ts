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
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { intervaloDoMes, mesAtualUTC } from '../validacao.ts';
import { responderErro } from '../respostas.ts';
import { StatusTransacao, TipoTransacao } from '../generated/prisma/enums.ts';

export const rotasDeResumo = Router();

// --- Auxiliares -------------------------------------------------------------

/** O Prisma devolve a soma como Decimal — ou null, quando não há nenhuma linha. */
function somaParaNumero(soma: { toNumber(): number } | null | undefined): number {
  return soma ? soma.toNumber() : 0;
}

/**
 * Corta a sujeira do ponto flutuante depois de uma conta com dinheiro.
 * Em JavaScript, `0.1 + 0.2` dá 0.30000000000000004: `number` é binário e não
 * representa centavos exatamente. As somas vêm exatas do banco; só as
 * subtrações acontecem aqui, e são elas que precisam deste arredondamento.
 */
function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Lê `?mes=AAAA-MM`, caindo no mês atual quando o cliente não manda nada. */
function mesPedido(valorBruto: unknown): string {
  return typeof valorBruto === 'string' && valorBruto !== '' ? valorBruto : mesAtualUTC();
}

/** Uma linha do groupBy: tipo (e talvez status) com a soma pronta. */
interface LinhaAgrupada {
  tipo: TipoTransacao;
  status?: StatusTransacao;
  _sum: { valor: { toNumber(): number } | null };
}

/** Soma as linhas de um tipo, opcionalmente filtrando por status. */
function totalDe(
  linhas: LinhaAgrupada[],
  tipo: TipoTransacao,
  status?: StatusTransacao
): number {
  return linhas
    .filter((linha) => linha.tipo === tipo && (status === undefined || linha.status === status))
    .reduce((soma, linha) => soma + somaParaNumero(linha._sum.valor), 0);
}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/resumo?mes=2026-08
 *
 * Totais do mês, no mesmo formato de uma planilha de balanço:
 *   sobra do mês anterior + entradas − saídas = disponível
 *
 * Entradas e saídas contam TUDO que está lançado no mês, pago ou ainda a
 * pagar. É o que responde "como este mês fecha se tudo acontecer como
 * planejado" — a pergunta que se faz olhando o mês inteiro. A quebra por
 * status vai junto, em `realizado` e `pendente`, para dar para ver quanto
 * disso já saiu de fato da conta.
 */
rotasDeResumo.get('/', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const mes = mesPedido(req.query['mes']);
    const intervalo = intervaloDoMes(mes);

    // As duas consultas não dependem uma da outra: vão juntas.
    const [doMes, dosMesesAnteriores] = await Promise.all([
      // Agrupado também por status, para separar o que já aconteceu do que
      // ainda vai acontecer sem precisar de uma segunda consulta.
      prisma.transacao.groupBy({
        by: ['tipo', 'status'],
        where: { usuarioId, data: intervalo },
        _sum: { valor: true },
      }),

      // Tudo que veio antes deste mês. A diferença é a "sobra": o que sobrou
      // (ou faltou) de toda a história até aqui.
      prisma.transacao.groupBy({
        by: ['tipo'],
        where: { usuarioId, data: { lt: intervalo.gte } },
        _sum: { valor: true },
      }),
    ]);

    const entradas = totalDe(doMes, TipoTransacao.GANHO);
    const saidas = totalDe(doMes, TipoTransacao.GASTO);

    const sobraDoMesAnterior = arredondarCentavos(
      totalDe(dosMesesAnteriores, TipoTransacao.GANHO) -
        totalDe(dosMesesAnteriores, TipoTransacao.GASTO)
    );

    const saldo = arredondarCentavos(entradas - saidas);

    res.json({
      mes,
      sobraDoMesAnterior,
      entradas,
      saidas,
      // Negativo quando se gastou mais do que entrou — e é justamente esse o
      // número que o dashboard existe para mostrar.
      saldo,
      // O que efetivamente sobra na mão, arrastando o resultado dos meses
      // anteriores: um mês positivo depois de três negativos não é folga.
      disponivel: arredondarCentavos(sobraDoMesAnterior + saldo),

      realizado: {
        entradas: totalDe(doMes, TipoTransacao.GANHO, StatusTransacao.CONCLUIDA),
        saidas: totalDe(doMes, TipoTransacao.GASTO, StatusTransacao.CONCLUIDA),
      },
      pendente: {
        entradas: totalDe(doMes, TipoTransacao.GANHO, StatusTransacao.PENDENTE),
        saidas: totalDe(doMes, TipoTransacao.GASTO, StatusTransacao.PENDENTE),
      },
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

/**
 * GET /api/resumo/formas-de-pagamento?mes=2026-08
 *
 * Gastos do mês por forma de pagamento — na prática, quanto vem na fatura de
 * cada cartão. Junto vai a quebra por status, porque numa fatura o que
 * interessa é justamente o que ainda não foi pago.
 *
 * Lançamentos sem forma de pagamento informada entram como "Não informado":
 * some-los da lista faria o total não bater com as saídas do mês.
 */
rotasDeResumo.get('/formas-de-pagamento', async (req, res) => {
  try {
    const mes = mesPedido(req.query['mes']);

    const porForma = await prisma.transacao.groupBy({
      by: ['formaDePagamento', 'status'],
      where: {
        usuarioId: idDoUsuarioLogado(req),
        tipo: TipoTransacao.GASTO,
        data: intervaloDoMes(mes),
      },
      _sum: { valor: true },
    });

    // O groupBy devolve uma linha por (forma, status); aqui as duas viram uma
    // linha só por forma, com o pendente destacado.
    const acumulado = new Map<string, { total: number; pendente: number }>();

    for (const linha of porForma) {
      const forma = linha.formaDePagamento ?? 'Não informado';
      const atual = acumulado.get(forma) ?? { total: 0, pendente: 0 };
      const valor = somaParaNumero(linha._sum.valor);

      atual.total += valor;
      if (linha.status === StatusTransacao.PENDENTE) {
        atual.pendente += valor;
      }

      acumulado.set(forma, atual);
    }

    const formas = [...acumulado.entries()]
      .map(([forma, totais]) => ({
        forma,
        total: arredondarCentavos(totais.total),
        pendente: arredondarCentavos(totais.pendente),
      }))
      // Maior fatura primeiro: é a que decide o mês.
      .sort((a, b) => b.total - a.total);

    res.json({
      mes,
      formas,
      total: arredondarCentavos(formas.reduce((soma, f) => soma + f.total, 0)),
    });
  } catch (erro) {
    responderErro(res, erro, 'agrupar os gastos por forma de pagamento');
  }
});
