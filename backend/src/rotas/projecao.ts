/**
 * Rota da Projeção: "se nada mudar, como ficam os próximos meses?"
 *
 * Aqui só acontece o trabalho de ir ao banco e traduzir a resposta. A conta em
 * si mora em `../projecao.ts`, que não conhece Prisma nem Express e por isso
 * tem teste de unidade de verdade.
 *
 * Montado atrás de `exigirLogin`, então toda consulta filtra pelo usuário.
 */
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { responderErro } from '../respostas.ts';
import { ErroDeValidacao, intervaloDoMes, mesAtualUTC, validarMes } from '../validacao.ts';
import {
  dataPrevista,
  projetar,
  proximoMes,
  sequenciaDeMeses,
  type LancamentosDoMes,
} from '../projecao.ts';
import { TipoTransacao } from '../generated/prisma/enums.ts';

export const rotasDeProjecao = Router();

/** Quantos meses a projeção cobre quando o cliente não pede um número. */
const MESES_PADRAO = 6;

/** Além disso a projeção vira ficção: qualquer coisa muda em dois anos. */
const MESES_MAXIMO = 24;

// --- Leitura dos parâmetros -------------------------------------------------

/**
 * De qual mês a projeção começa.
 *
 * O padrão — e o mínimo aceito — é o mês QUE VEM. Projetar o mês corrente daria
 * número errado: o aluguel que já foi pago está lançado como transação, e a
 * recorrência dele seria somada de novo por cima. Como não há como saber quais
 * recorrências já viraram lançamento, o mês atual fica por conta do Dashboard,
 * que trabalha só com o que de fato aconteceu.
 */
function inicioPedido(bruto: unknown): string {
  const primeiroPermitido = proximoMes(mesAtualUTC());

  if (typeof bruto !== 'string' || bruto === '') {
    return primeiroPermitido;
  }

  const inicio = validarMes(bruto);

  if (inicio < primeiroPermitido) {
    throw new ErroDeValidacao(
      'A projeção começa no mês que vem. Para os meses já em andamento, use o Dashboard.'
    );
  }

  return inicio;
}

function quantidadePedida(bruto: unknown): number {
  if (typeof bruto !== 'string' || bruto === '') {
    return MESES_PADRAO;
  }

  const quantidade = Number(bruto);

  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MESES_MAXIMO) {
    throw new ErroDeValidacao(`Informe entre 1 e ${MESES_MAXIMO} meses.`);
  }

  return quantidade;
}

// --- Rota -------------------------------------------------------------------

/**
 * GET /api/projecao?inicio=2026-09&meses=6
 *
 * Ambos opcionais: o padrão é o mês que vem, por 6 meses.
 */
rotasDeProjecao.get('/', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const inicio = inicioPedido(req.query['inicio']);
    const quantidade = quantidadePedida(req.query['meses']);

    const meses = sequenciaDeMeses(inicio, quantidade);
    const ultimoMes = meses.at(-1) as string;

    // As duas consultas não dependem uma da outra: vão juntas.
    const [recorrencias, lancamentosFuturos] = await Promise.all([
      // Só as ativas: uma assinatura cancelada não deve pesar no futuro.
      prisma.recorrencia.findMany({
        where: { usuarioId, ativa: true },
        orderBy: [{ diaDoMes: 'asc' }, { id: 'asc' }],
      }),

      // Transações já lançadas com data dentro da janela projetada — a parcela
      // 3/10 de uma compra, por exemplo. Aqui buscamos as linhas e somamos no
      // Node em vez de pedir a soma pronta ao banco (como faz o Dashboard):
      // agrupar por MÊS exigiria SQL escrito à mão, e o volume aqui é pequeno,
      // porque são só os lançamentos que alguém digitou com data futura.
      prisma.transacao.findMany({
        where: {
          usuarioId,
          data: {
            gte: intervaloDoMes(inicio).gte,
            lt: intervaloDoMes(ultimoMes).lt,
          },
        },
        select: { data: true, valor: true, tipo: true },
      }),
    ]);

    // Agrupa os lançamentos por mês, no formato que o motor espera.
    const lancamentosPorMes = new Map<string, LancamentosDoMes>();

    for (const transacao of lancamentosFuturos) {
      const mes = transacao.data.toISOString().slice(0, 7);
      const totais = lancamentosPorMes.get(mes) ?? { entradas: 0, saidas: 0 };
      const valor = transacao.valor.toNumber();

      if (transacao.tipo === TipoTransacao.GANHO) {
        totais.entradas += valor;
      } else {
        totais.saidas += valor;
      }

      lancamentosPorMes.set(mes, totais);
    }

    const projecao = projetar(
      meses,
      recorrencias.map((r) => ({ valor: r.valor.toNumber(), tipo: r.tipo })),
      lancamentosPorMes
    );

    res.json({
      inicio,
      // Cada mês vai com a lista das recorrências que o compõem, para a tela
      // poder responder "de onde saiu esse número?" sem uma segunda chamada.
      meses: projecao.map((mes) => ({
        ...mes,
        itens: recorrencias.map((r) => ({
          id: r.id,
          descricao: r.descricao,
          categoria: r.categoria,
          valor: r.valor.toNumber(),
          tipo: r.tipo,
          data: dataPrevista(mes.mes, r.diaDoMes),
        })),
      })),
    });
  } catch (erro) {
    responderErro(res, erro, 'calcular a projeção');
  }
});
