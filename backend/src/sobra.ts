/**
 * Quanto do passado entra no mês — a linha "Sobra anterior" do Dashboard.
 *
 * São duas parcelas, e elas NÃO entram do mesmo jeito. A diferença é a razão
 * de este módulo existir.
 *
 * 1. O ACUMULADO dos meses anteriores, calculado pelo app (ganhos − gastos de
 *    tudo que já passou). Este é limitado em zero.
 *
 *    Dois motivos. O primeiro é o que a palavra quer dizer: sobra é o que
 *    SOBROU. Um mês que fechou no vermelho não deixou sobra negativa — não
 *    deixou sobra nenhuma. A conta daquele mês foi paga na época, o dinheiro
 *    saiu lá atrás, e arrastar o vermelho para a frente cobra a mesma conta
 *    duas vezes: uma quando ela foi paga, e outra em todo mês seguinte, para
 *    sempre.
 *
 *    O segundo é o que o app sabe e o que não sabe. O acumulado é uma conta
 *    sobre o que foi DIGITADO, não um extrato bancário. Quem lança as despesas
 *    com disciplina e esquece metade da renda acumula um vermelho que nunca
 *    existiu na conta — e via de regra é isso que acontece, porque contas a
 *    pagar doem e por isso são lembradas, e salário cai sozinho.
 *
 * 2. A sobra INFORMADA À MÃO no mês (`ehSobraDoMesAnterior`), para quem começou
 *    a usar o app no meio da vida. Esta passa como está, inclusive negativa.
 *
 *    É uma declaração explícita: a pessoa abriu o formulário e disse "comecei
 *    este mês devendo 500". Limitar isso em zero seria discordar do usuário
 *    sobre um fato que só ele conhece. Por isso a soma final ainda pode ficar
 *    negativa — mas só por este caminho, e só porque alguém digitou.
 */

/**
 * Junta as duas parcelas. Devolve reais (com centavos), sem arredondar: quem
 * chama é que corta a sujeira do ponto flutuante, junto do resto da conta.
 */
export function sobraQueEntraNoMes(
  acumuladoDosMesesAnteriores: number,
  informadaAMao: number
): number {
  return Math.max(0, acumuladoDosMesesAnteriores) + informadaAMao;
}
