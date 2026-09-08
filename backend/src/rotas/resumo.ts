/**
 * Rotas do Dashboard: números já somados, prontos para exibir.
 *
 * Quem soma os lançamentos é o PostgreSQL, não o Node. Em vez de baixar todas
 * as transações do mês e somar aqui, pedimos ao banco o total pronto — são 3
 * números na resposta em vez de 300 linhas, e a soma sai exata em centavos
 * porque o DECIMAL do Postgres não passa por ponto flutuante.
 *
 * O balanço soma DUAS origens: os lançamentos do mês e as recorrências ativas
 * que ainda não viraram lançamento (a previsão). O vínculo `recorrenciaId` é o
 * que garante que uma conta não entre pelas duas portas ao mesmo tempo.
 *
 * Montado atrás de `exigirLogin`, então `req.usuarioId` sempre existe e toda
 * consulta filtra por ele — é isso que mantém os dados de cada um separados.
 */
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { intervaloDoMes, mesAtualUTC } from '../validacao.ts';
import { responderErro } from '../respostas.ts';
import { totalPrevisto } from '../previsao.ts';
import { previsaoDoMes } from '../previsaoDoMes.ts';
import { sobraQueEntraNoMes } from '../sobra.ts';
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
 * representa centavos exatamente.
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
function totalDe(linhas: LinhaAgrupada[], tipo: TipoTransacao, status?: StatusTransacao): number {
  return linhas
    .filter((linha) => linha.tipo === tipo && (status === undefined || linha.status === status))
    .reduce((soma, linha) => soma + somaParaNumero(linha._sum.valor), 0);
}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/resumo?mes=2026-08
 *
 * Balanço do mês, no formato de uma planilha:
 *   sobra do mês anterior + entradas − saídas = disponível
 *
 * Entradas e saídas contam tudo que se espera do mês: os lançamentos (pagos ou
 * não) mais as recorrências que ainda não foram lançadas. A resposta traz a
 * composição em três faixas — `realizado`, `pendente` e `previsto` — para dar
 * para conferir de onde cada real veio.
 */
rotasDeResumo.get('/', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const mes = mesPedido(req.query['mes']);
    const intervalo = intervaloDoMes(mes);

    const [doMes, dosMesesAnteriores, sobraLancada, pendentes] = await Promise.all([
      // Agrupado também por status, para separar o que já aconteceu do que
      // ainda vai acontecer sem precisar de uma segunda consulta.
      // A sobra lançada fica de fora: ela não é receita nem despesa do mês.
      prisma.transacao.groupBy({
        by: ['tipo', 'status'],
        where: { usuarioId, data: intervalo, ehSobraDoMesAnterior: false },
        _sum: { valor: true },
      }),

      // Tudo que veio antes deste mês: o que sobrou de toda a história até
      // aqui. Só lançamentos — o passado não recebe previsão. Aqui a sobra
      // lançada CONTA, porque de um mês futuro ela é apenas mais um valor que
      // já estava na conta. Se a história fecha no vermelho, isso NÃO vira
      // dívida deste mês — quem corta em zero, e por quê, é `sobra.ts`.
      prisma.transacao.groupBy({
        by: ['tipo'],
        where: { usuarioId, data: { lt: intervalo.gte } },
        _sum: { valor: true },
      }),

      // A sobra que o próprio usuário lançou dentro deste mês, para quem
      // começou a usar o app no meio da vida e precisa informar o ponto de
      // partida à mão.
      prisma.transacao.groupBy({
        by: ['tipo'],
        where: { usuarioId, data: intervalo, ehSobraDoMesAnterior: true },
        _sum: { valor: true },
      }),

      previsaoDoMes(usuarioId, mes, intervalo),
    ]);

    const previsto = totalPrevisto(pendentes);

    const realizado = {
      entradas: totalDe(doMes, TipoTransacao.GANHO, StatusTransacao.CONCLUIDA),
      saidas: totalDe(doMes, TipoTransacao.GASTO, StatusTransacao.CONCLUIDA),
    };
    const pendenteLancado = {
      entradas: totalDe(doMes, TipoTransacao.GANHO, StatusTransacao.PENDENTE),
      saidas: totalDe(doMes, TipoTransacao.GASTO, StatusTransacao.PENDENTE),
    };

    const entradas = arredondarCentavos(
      realizado.entradas + pendenteLancado.entradas + previsto.entradas
    );
    const saidas = arredondarCentavos(
      realizado.saidas + pendenteLancado.saidas + previsto.saidas
    );

    // A sobra tem duas origens: o resultado acumulado dos meses já registrados
    // e o valor que o usuário informou à mão neste mês. Quem usa o app desde o
    // começo só tem a primeira; quem começou no meio, só a segunda.
    //
    // Elas NÃO entram do mesmo jeito — o acumulado morre em zero quando é
    // negativo, o informado à mão passa como está. `sobra.ts` explica por quê.
    const acumuladoDosMesesAnteriores =
      totalDe(dosMesesAnteriores, TipoTransacao.GANHO) -
      totalDe(dosMesesAnteriores, TipoTransacao.GASTO);

    const informadaAMao =
      totalDe(sobraLancada, TipoTransacao.GANHO) - totalDe(sobraLancada, TipoTransacao.GASTO);

    const sobraDoMesAnterior = arredondarCentavos(
      sobraQueEntraNoMes(acumuladoDosMesesAnteriores, informadaAMao)
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
      // O que efetivamente resta, arrastando o resultado dos meses anteriores:
      // um mês positivo depois de três negativos não é folga.
      disponivel: arredondarCentavos(sobraDoMesAnterior + saldo),

      // As três faixas que somam os totais acima.
      realizado,
      pendente: pendenteLancado,
      previsto,

      // Quais recorrências entraram como previsão, para a tela poder listá-las
      // e oferecer o botão de lançar.
      recorrenciasPrevistas: pendentes,
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
 *
 * Inclui as recorrências previstas, senão o total do gráfico não bateria com
 * as saídas do balanço.
 */
rotasDeResumo.get('/categorias', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const mes = mesPedido(req.query['mes']);
    const intervalo = intervaloDoMes(mes);

    const [porCategoria, pendentes] = await Promise.all([
      prisma.transacao.groupBy({
        by: ['categoria'],
        // A sobra do mês passado não é um gasto: fora do gráfico.
        where: {
          usuarioId,
          tipo: TipoTransacao.GASTO,
          data: intervalo,
          ehSobraDoMesAnterior: false,
        },
        _sum: { valor: true },
      }),
      previsaoDoMes(usuarioId, mes, intervalo),
    ]);

    // Junta as duas origens na mesma categoria: "Moradia" lançada e "Moradia"
    // prevista são uma linha só no gráfico.
    const totais = new Map<string, number>();

    for (const linha of porCategoria) {
      totais.set(linha.categoria, somaParaNumero(linha._sum.valor));
    }
    for (const r of pendentes) {
      if (r.tipo !== TipoTransacao.GASTO) continue;
      totais.set(r.categoria, (totais.get(r.categoria) ?? 0) + r.valor);
    }

    const categorias = [...totais.entries()]
      .map(([categoria, total]) => ({ categoria, total: arredondarCentavos(total) }))
      // Maior gasto primeiro: é o que decide o mês.
      .sort((a, b) => b.total - a.total);

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
 * cada cartão. Junto vai a quebra por situação, porque numa fatura o que
 * interessa é justamente o que ainda não foi pago.
 *
 * Lançamentos sem forma informada entram como "Não informado": escondê-los
 * faria o total não bater com as saídas do mês.
 */
rotasDeResumo.get('/formas-de-pagamento', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const mes = mesPedido(req.query['mes']);
    const intervalo = intervaloDoMes(mes);

    const [porForma, pendentes] = await Promise.all([
      prisma.transacao.groupBy({
        by: ['formaDePagamento', 'status'],
        // A sobra do mês passado não entra em fatura de cartão nenhuma.
        where: {
          usuarioId,
          tipo: TipoTransacao.GASTO,
          data: intervalo,
          ehSobraDoMesAnterior: false,
        },
        _sum: { valor: true },
      }),
      previsaoDoMes(usuarioId, mes, intervalo),
    ]);

    // O groupBy devolve uma linha por (forma, status); aqui as duas viram uma
    // linha só por forma, com o que falta pagar destacado.
    const acumulado = new Map<string, { total: number; pendente: number }>();

    function acrescentar(forma: string, valor: number, aindaNaoPago: boolean) {
      const atual = acumulado.get(forma) ?? { total: 0, pendente: 0 };
      atual.total += valor;
      if (aindaNaoPago) atual.pendente += valor;
      acumulado.set(forma, atual);
    }

    for (const linha of porForma) {
      acrescentar(
        linha.formaDePagamento ?? 'Não informado',
        somaParaNumero(linha._sum.valor),
        linha.status === StatusTransacao.PENDENTE
      );
    }

    // Uma recorrência prevista nunca foi paga — por definição ela ainda nem
    // virou lançamento.
    for (const r of pendentes) {
      if (r.tipo !== TipoTransacao.GASTO) continue;
      acrescentar(r.formaDePagamento ?? 'Não informado', r.valor, true);
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
