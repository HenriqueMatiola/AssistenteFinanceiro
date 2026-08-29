/**
 * Datas de uma compra parcelada.
 *
 * Igual ao motor de projeção, este arquivo não conhece banco nem Express: dá
 * uma data e uma quantidade, recebe as datas de volta. Assim dá para testar a
 * regra chata (o dia 31 que não existe em todo mês) sem subir nada.
 */

/**
 * As datas das parcelas, uma por mês, começando na data informada.
 *
 * A parcela 1 cai no dia escolhido; as seguintes caem no mesmo dia dos meses
 * seguintes. Quando o mês não tem aquele dia — 31 de janeiro parcelado cairia
 * em 31 de fevereiro — a parcela vai para o último dia do mês.
 *
 * Repare que o dia NÃO é "arrastado": uma compra em 31/01 gera 28/02 e depois
 * 31/03, e não 28/03. Cada parcela é calculada a partir da data original, então
 * um mês curto no meio do caminho não encurta todas as parcelas seguintes.
 *
 * @param dataInicial Data da primeira parcela, em UTC e sem hora.
 * @param quantidade  Quantas parcelas ao todo (a primeira inclusa).
 */
export function datasDasParcelas(dataInicial: Date, quantidade: number): Date[] {
  const ano = dataInicial.getUTCFullYear();
  const mes = dataInicial.getUTCMonth();
  const diaEscolhido = dataInicial.getUTCDate();

  const datas: Date[] = [];

  for (let i = 0; i < quantidade; i += 1) {
    // O "dia 0" do mês seguinte é o último dia do mês que nos interessa.
    const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + i + 1, 0)).getUTCDate();
    const dia = Math.min(diaEscolhido, ultimoDiaDoMes);

    datas.push(new Date(Date.UTC(ano, mes + i, dia)));
  }

  return datas;
}
