/**
 * Motor de projeção: estima o saldo dos meses que ainda não aconteceram.
 *
 * Este arquivo não conhece o banco nem o Express, e isso é de propósito: ele
 * recebe números e devolve números. É por isso que dá para testá-lo sem subir
 * Docker nem servidor nenhum — veja `projecao.test.ts`.
 *
 * A regra que ele implementa: o total de um mês futuro é
 *   1. todas as recorrências ativas, cada uma contando UMA vez no mês, mais
 *   2. os lançamentos que já estão no banco com data naquele mês
 *      (ex: a parcela 3/10 de uma compra, lançada com data de dezembro).
 */
import type { TipoTransacao } from './generated/prisma/enums.ts';

// --- Dinheiro ---------------------------------------------------------------

/**
 * As contas todas acontecem em centavos INTEIROS, não em reais.
 *
 * Em JavaScript `0.1 + 0.2` dá 0.30000000000000004, porque `number` guarda o
 * valor em binário e 0,1 não tem representação exata — igual a 1/3 em decimal.
 * Somando 12 meses de recorrências, esse resto viraria centavo errado na tela.
 * Com inteiros o problema simplesmente não existe: 10 + 20 é 30, sempre.
 */
function paraCentavos(reais: number): number {
  return Math.round(reais * 100);
}

function paraReais(centavos: number): number {
  return centavos / 100;
}

// --- O que entra ------------------------------------------------------------

/** Uma recorrência, no mínimo que o motor precisa saber sobre ela. */
export interface RecorrenciaProjetavel {
  valor: number;
  tipo: TipoTransacao;
}

/** Totais das transações que JÁ estão lançadas com data num mês futuro. */
export interface LancamentosDoMes {
  entradas: number;
  saidas: number;
}

// --- O que sai --------------------------------------------------------------

export interface MesProjetado {
  /** Formato "AAAA-MM". */
  mes: string;
  entradas: number;
  saidas: number;
  /** Entradas menos saídas do mês. Negativo quando o mês fecha no vermelho. */
  saldo: number;

  /**
   * De onde veio cada parte do total. Sem isto, um mês estranho na tela vira
   * um mistério; com isto dá para ver na hora se o susto veio de uma
   * recorrência esquecida ou de uma parcela já lançada.
   */
  deRecorrencias: LancamentosDoMes;
  deLancamentos: LancamentosDoMes;

  /**
   * Saldo deste mês somado ao de todos os meses anteriores da projeção.
   * É o número que responde "se nada mudar, como eu termino o semestre?" —
   * um mês negativo isolado assusta menos do que três seguidos.
   */
  saldoAcumulado: number;
}

// --- Meses ------------------------------------------------------------------

/** "2026-12" → "2027-01" */
export function proximoMes(mes: string): string {
  const [ano, numeroDoMes] = mes.split('-').map(Number) as [number, number];
  // Date.UTC aceita mês 12 e transborda sozinho para janeiro do ano seguinte.
  return new Date(Date.UTC(ano, numeroDoMes, 1)).toISOString().slice(0, 7);
}

/** Sequência de meses a partir de `inicio`, incluindo ele: ["2026-09", "2026-10", …] */
export function sequenciaDeMeses(inicio: string, quantidade: number): string[] {
  const meses: string[] = [];
  let atual = inicio;

  for (let i = 0; i < quantidade; i += 1) {
    meses.push(atual);
    atual = proximoMes(atual);
  }

  return meses;
}

/**
 * Em que dia uma recorrência cai num mês, como "AAAA-MM-DD".
 *
 * Dia 31 num mês de 30 dias vira o dia 30: a conta continua vencendo, quem
 * não tem aquele dia é o calendário. Isso não muda o saldo do mês — a
 * recorrência conta uma vez de qualquer jeito — só a data que aparece na tela.
 */
export function dataPrevista(mes: string, diaDoMes: number): string {
  const [ano, numeroDoMes] = mes.split('-').map(Number) as [number, number];

  // O "dia 0" do mês seguinte é o último dia deste mês — assim não precisamos
  // de uma tabela de quantos dias tem cada mês, nem tratar ano bissexto.
  const ultimoDia = new Date(Date.UTC(ano, numeroDoMes, 0)).getUTCDate();

  return `${mes}-${String(Math.min(diaDoMes, ultimoDia)).padStart(2, '0')}`;
}

// --- O motor ----------------------------------------------------------------

/**
 * Monta a projeção de cada mês da lista.
 *
 * @param meses             Meses a projetar, em ordem ("AAAA-MM").
 * @param recorrencias      Só as ativas — quem filtra é quem chama.
 * @param lancamentosPorMes Totais já lançados, por mês. Mês ausente = mês sem
 *                          nenhum lançamento futuro, o que é o caso comum.
 */
export function projetar(
  meses: string[],
  recorrencias: RecorrenciaProjetavel[],
  lancamentosPorMes: Map<string, LancamentosDoMes>
): MesProjetado[] {
  // As recorrências são as mesmas em todos os meses, então a soma delas sai
  // uma vez só, fora do laço.
  let recorrentesEntradas = 0;
  let recorrentesSaidas = 0;

  for (const recorrencia of recorrencias) {
    const centavos = paraCentavos(recorrencia.valor);
    if (recorrencia.tipo === 'GANHO') {
      recorrentesEntradas += centavos;
    } else {
      recorrentesSaidas += centavos;
    }
  }

  let acumulado = 0;

  return meses.map((mes) => {
    const lancado = lancamentosPorMes.get(mes);
    const lancadasEntradas = paraCentavos(lancado?.entradas ?? 0);
    const lancadasSaidas = paraCentavos(lancado?.saidas ?? 0);

    const entradas = recorrentesEntradas + lancadasEntradas;
    const saidas = recorrentesSaidas + lancadasSaidas;
    const saldo = entradas - saidas;

    acumulado += saldo;

    return {
      mes,
      entradas: paraReais(entradas),
      saidas: paraReais(saidas),
      saldo: paraReais(saldo),
      deRecorrencias: {
        entradas: paraReais(recorrentesEntradas),
        saidas: paraReais(recorrentesSaidas),
      },
      deLancamentos: {
        entradas: paraReais(lancadasEntradas),
        saidas: paraReais(lancadasSaidas),
      },
      saldoAcumulado: paraReais(acumulado),
    };
  });
}
