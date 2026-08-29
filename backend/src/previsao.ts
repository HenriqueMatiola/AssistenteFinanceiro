/**
 * O que ainda vai acontecer num mês, além do que já foi lançado.
 *
 * O balanço de um mês soma duas coisas:
 *   1. os lançamentos daquele mês — o que você digitou;
 *   2. as recorrências ativas que ainda NÃO viraram lançamento ali.
 *
 * O item 2 é a previsão. Sem ele, um mês recém-começado parece vazio mesmo
 * tendo aluguel e salário garantidos. Com ele — e só com o vínculo do item 1 —
 * cada conta entra uma vez só.
 *
 * Como sempre, este arquivo não conhece banco nem Express: recebe listas e
 * devolve listas, e por isso tem teste de verdade.
 */
import type { TipoTransacao } from './generated/prisma/enums.ts';

export interface RecorrenciaPrevisivel {
  id: number;
  valor: number;
  tipo: TipoTransacao;
}

export interface TotaisPrevistos {
  entradas: number;
  saidas: number;
}

/**
 * Um mês passado só mostra o que de fato foi lançado.
 *
 * Previsão é sobre o que ainda vai acontecer. Se o aluguel de julho nunca foi
 * lançado, julho não deve inventar que ele existiu — o passado é fato
 * consumado, e "consertá-lo" com uma estimativa esconderia justamente o
 * lançamento esquecido.
 */
export function mesAceitaPrevisao(mes: string, mesCorrente: string): boolean {
  // Datas em "AAAA-MM" comparam corretamente como texto.
  return mes >= mesCorrente;
}

/**
 * As recorrências que ainda não têm lançamento no mês.
 *
 * @param recorrencias    Só as ativas — quem filtra é quem chama.
 * @param jaLancadas      Ids das recorrências que já viraram lançamento no mês.
 */
export function recorrenciasPendentes<T extends { id: number }>(
  recorrencias: T[],
  jaLancadas: Set<number>
): T[] {
  return recorrencias.filter((r) => !jaLancadas.has(r.id));
}

/**
 * Soma as pendentes, separando entrada de saída.
 *
 * Soma em centavos inteiros pelo mesmo motivo do motor de projeção: em
 * JavaScript `0.1 + 0.2` dá 0.30000000000000004, e o resto viraria centavo
 * errado na tela.
 */
export function totalPrevisto(pendentes: RecorrenciaPrevisivel[]): TotaisPrevistos {
  let entradas = 0;
  let saidas = 0;

  for (const r of pendentes) {
    const centavos = Math.round(r.valor * 100);
    if (r.tipo === 'GANHO') {
      entradas += centavos;
    } else {
      saidas += centavos;
    }
  }

  return { entradas: entradas / 100, saidas: saidas / 100 };
}
