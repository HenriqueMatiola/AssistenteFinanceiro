/**
 * Regras de validação que mais de uma rota precisa.
 *
 * Vivem aqui, e não dentro de um arquivo de rotas, porque regra duplicada é
 * regra que um dia muda só num dos lugares.
 */

/** Erro de dado mal preenchido pelo cliente: vira resposta 400. */
export class ErroDeValidacao extends Error {}

/** Intervalo meia-aberto que cobre um mês inteiro: de `gte` (inclusive) a `lt` (exclusive). */
export interface IntervaloDeMes {
  gte: Date;
  lt: Date;
}

/**
 * Aceita "2026-08" e devolve o intervalo do dia 1 deste mês até o dia 1 do mês
 * seguinte.
 *
 * O intervalo é meia-aberto (>= início, < fim) em vez de "até o dia 31" porque
 * assim não precisamos saber quantos dias tem cada mês, nem tratar fevereiro de
 * ano bissexto como caso especial.
 */
export function intervaloDoMes(bruto: unknown): IntervaloDeMes {
  if (typeof bruto !== 'string' || !/^\d{4}-\d{2}$/.test(bruto)) {
    throw new ErroDeValidacao('Mês inválido. Use o formato AAAA-MM.');
  }

  const [ano, mes] = bruto.split('-').map(Number) as [number, number];

  // Sem esta conferência, "2026-99" viraria silenciosamente um mês de 2034:
  // o Date.UTC aceita mês 98 e vai somando anos.
  if (mes < 1 || mes > 12) {
    throw new ErroDeValidacao('Mês inválido. Use um valor entre 01 e 12.');
  }

  // Aqui o transbordo é proposital: o mês 12 vira o mês 0 do ano seguinte.
  return {
    gte: new Date(Date.UTC(ano, mes - 1, 1)),
    lt: new Date(Date.UTC(ano, mes, 1)),
  };
}

/** Mês atual ("AAAA-MM") em UTC — o padrão quando o cliente não informa um. */
export function mesAtualUTC(): string {
  return new Date().toISOString().slice(0, 7);
}
