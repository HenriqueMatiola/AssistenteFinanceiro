/**
 * Em qual mês um lançamento pesa.
 *
 * Todo lançamento tem uma `data` — quando o fato aconteceu — e pode ter um
 * `vencimento` — quando o dinheiro se move. Quando os dois existem, quem manda
 * no balanço é o VENCIMENTO: o Dashboard responde "quanto me resta este mês",
 * e para isso vale o dia em que o dinheiro sai do bolso.
 *
 * Sem vencimento, vale a data. Por isso tudo que foi lançado antes deste campo
 * existir continua exatamente no mês em que sempre esteve.
 *
 * ## Por que não existe uma coluna "data efetiva"
 *
 * Ela seria a cópia de um valor que já dá para calcular, e cópia de dado é dado
 * que um dia discorda da origem — bastaria um `update` esquecer de recalculá-la.
 * O preço de não tê-la é que o filtro vira um OR de dois casos, e é o que as
 * funções abaixo montam, num lugar só, para as nove consultas que precisam dele
 * não saírem escrevendo cada uma a sua versão.
 */
import type { IntervaloDeMes } from './validacao.ts';

/** A data que manda neste lançamento. */
export function dataEfetiva(lancamento: { data: Date; vencimento: Date | null }): Date {
  return lancamento.vencimento ?? lancamento.data;
}

/**
 * Filtro Prisma: o lançamento cai DENTRO deste mês.
 *
 * Os dois ramos são excludentes — ou há vencimento, ou não —, então nenhuma
 * linha é contada duas vezes.
 */
export function dentroDoMes(intervalo: IntervaloDeMes) {
  return {
    OR: [
      { vencimento: null, data: intervalo },
      { vencimento: intervalo },
    ],
  };
}

/**
 * Filtro Prisma: o lançamento é de ANTES deste mês.
 *
 * É o que alimenta a sobra acumulada. `lt` sobre o começo do mês, e não `lte`
 * sobre o fim do mês anterior: o intervalo é meia-aberto em toda a aplicação, e
 * misturar os dois jeitos é como um lançamento do dia 1º some da conta.
 */
export function antesDoMes(intervalo: IntervaloDeMes) {
  return {
    OR: [
      { vencimento: null, data: { lt: intervalo.gte } },
      { vencimento: { lt: intervalo.gte } },
    ],
  };
}

/**
 * Ordena do mais recente para o mais antigo pela data que manda.
 *
 * Acontece no Node, e não no banco, porque ordenar por "vencimento, e quando
 * ele for nulo, a data" exigiria SQL escrito à mão. São dezenas de linhas por
 * mês — o custo é nenhum, e o SQL cru custaria a tipagem do Prisma.
 */
export function maisRecentePrimeiro<T extends { data: Date; vencimento: Date | null; id: number }>(
  lancamentos: T[]
): T[] {
  return [...lancamentos].sort((a, b) => {
    const diferenca = dataEfetiva(b).getTime() - dataEfetiva(a).getTime();
    // No mesmo dia, o lançado por último aparece em cima.
    return diferenca !== 0 ? diferenca : b.id - a.id;
  });
}
