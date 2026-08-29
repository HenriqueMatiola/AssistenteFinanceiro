/**
 * Regras de validação que mais de uma rota precisa.
 *
 * Vivem aqui, e não dentro de um arquivo de rotas, porque regra duplicada é
 * regra que um dia muda só num dos lugares.
 */
import {
  ClassificacaoGasto,
  StatusTransacao,
  TipoTransacao,
} from './generated/prisma/enums.ts';

/** Erro de dado mal preenchido pelo cliente: vira resposta 400. */
export class ErroDeValidacao extends Error {}

// --- Meses ------------------------------------------------------------------

/** Intervalo meia-aberto que cobre um mês inteiro: de `gte` (inclusive) a `lt` (exclusive). */
export interface IntervaloDeMes {
  gte: Date;
  lt: Date;
}

/** Confere que o texto é um mês no formato "AAAA-MM" e devolve ele. */
export function validarMes(bruto: unknown): string {
  if (typeof bruto !== 'string' || !/^\d{4}-\d{2}$/.test(bruto)) {
    throw new ErroDeValidacao('Mês inválido. Use o formato AAAA-MM.');
  }

  const numeroDoMes = Number(bruto.slice(5));

  // Sem esta conferência, "2026-99" viraria silenciosamente um mês de 2034:
  // o Date.UTC aceita mês 98 e vai somando anos.
  if (numeroDoMes < 1 || numeroDoMes > 12) {
    throw new ErroDeValidacao('Mês inválido. Use um valor entre 01 e 12.');
  }

  return bruto;
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
  const [ano, mes] = validarMes(bruto).split('-').map(Number) as [number, number];

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

// --- Datas ------------------------------------------------------------------

/** Aceita "2026-08-18" e devolve a data em UTC, sem hora. */
export function validarData(bruto: unknown): Date {
  if (typeof bruto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
    throw new ErroDeValidacao('Data inválida. Use o formato AAAA-MM-DD.');
  }

  // O "T00:00:00.000Z" força UTC. Sem ele, o Node interpretaria no fuso local
  // e a data poderia recuar um dia.
  const data = new Date(`${bruto}T00:00:00.000Z`);

  if (Number.isNaN(data.getTime())) {
    throw new ErroDeValidacao('Data inexistente no calendário.');
  }
  // Pega casos como 2026-02-31, que o construtor "conserta" para 03-03.
  if (data.toISOString().slice(0, 10) !== bruto) {
    throw new ErroDeValidacao('Data inexistente no calendário.');
  }

  return data;
}

// --- Campos de dinheiro -----------------------------------------------------

/**
 * Devolve o valor como string com 2 casas (ex: "1234.56").
 * Texto, e não número, porque é assim que o valor chega ao PostgreSQL sem
 * passar por nenhuma conversão que possa perder centavos.
 */
export function validarValor(bruto: unknown): string {
  const numero = typeof bruto === 'string' ? Number(bruto.replace(',', '.')) : bruto;

  if (typeof numero !== 'number' || !Number.isFinite(numero)) {
    throw new ErroDeValidacao('Valor inválido.');
  }
  if (numero <= 0) {
    // O sinal vem do campo `tipo`, não do valor.
    throw new ErroDeValidacao('O valor precisa ser maior que zero.');
  }
  // A coluna é DECIMAL(12,2): no máximo 10 dígitos antes da vírgula.
  if (numero >= 10_000_000_000) {
    throw new ErroDeValidacao('Valor alto demais.');
  }

  return numero.toFixed(2);
}

export function validarCategoria(bruto: unknown): string {
  if (typeof bruto !== 'string' || !bruto.trim()) {
    throw new ErroDeValidacao('Informe uma categoria.');
  }
  const categoria = bruto.trim();
  if (categoria.length > 60) {
    throw new ErroDeValidacao('Categoria longa demais (máximo 60 caracteres).');
  }
  return categoria;
}

export function validarTipo(bruto: unknown): TipoTransacao {
  if (bruto !== TipoTransacao.GASTO && bruto !== TipoTransacao.GANHO) {
    throw new ErroDeValidacao('Tipo inválido. Use GASTO ou GANHO.');
  }
  return bruto;
}

// --- Campos de recorrência --------------------------------------------------

export function validarDescricao(bruto: unknown): string {
  if (typeof bruto !== 'string' || !bruto.trim()) {
    throw new ErroDeValidacao('Informe uma descrição.');
  }
  const descricao = bruto.trim();
  if (descricao.length > 80) {
    throw new ErroDeValidacao('Descrição longa demais (máximo 80 caracteres).');
  }
  return descricao;
}

/**
 * Dia do mês em que a conta cai: 1 a 31.
 *
 * Aceitamos 31 mesmo sabendo que nem todo mês tem esse dia — quem resolve isso
 * é a projeção, encolhendo para o último dia do mês. Recusar o 31 obrigaria
 * quem paga a fatura no último dia a mentir a data.
 */
export function validarDiaDoMes(bruto: unknown): number {
  const numero = typeof bruto === 'string' ? Number(bruto) : bruto;

  if (typeof numero !== 'number' || !Number.isInteger(numero)) {
    throw new ErroDeValidacao('Dia do mês inválido. Use um número inteiro.');
  }
  if (numero < 1 || numero > 31) {
    throw new ErroDeValidacao('Dia do mês inválido. Use um valor entre 1 e 31.');
  }

  return numero;
}

// --- Identificadores --------------------------------------------------------

/** Lê um `:id` de rota e confere que é um inteiro positivo. */
export function validarId(bruto: unknown): number {
  const numero = typeof bruto === 'string' ? Number(bruto) : bruto;

  if (typeof numero !== 'number' || !Number.isInteger(numero) || numero <= 0) {
    throw new ErroDeValidacao('Identificador inválido.');
  }

  return numero;
}

// --- Campos de lançamento ---------------------------------------------------

/** Quantas parcelas um lançamento pode ter, no máximo. */
export const PARCELAS_MAXIMAS = 60;

export function validarStatus(bruto: unknown): StatusTransacao {
  if (bruto !== StatusTransacao.PENDENTE && bruto !== StatusTransacao.CONCLUIDA) {
    throw new ErroDeValidacao('Status inválido. Use PENDENTE ou CONCLUIDA.');
  }
  return bruto;
}

/**
 * Forma de pagamento é opcional: um ganho em dinheiro não tem uma, e obrigar
 * quem não quer controlar isso a inventar um valor só sujaria os dados.
 */
export function validarFormaDePagamento(bruto: unknown): string | null {
  if (typeof bruto !== 'string' || !bruto.trim()) {
    return null;
  }

  const forma = bruto.trim();

  if (forma.length > 60) {
    throw new ErroDeValidacao('Forma de pagamento longa demais (máximo 60 caracteres).');
  }

  return forma;
}

/** Fixo ou variável — opcional, e só faz sentido para gastos. */
export function validarClassificacao(bruto: unknown): ClassificacaoGasto | null {
  if (bruto === undefined || bruto === null || bruto === '') {
    return null;
  }
  if (bruto !== ClassificacaoGasto.FIXO && bruto !== ClassificacaoGasto.VARIAVEL) {
    throw new ErroDeValidacao('Classificação inválida. Use FIXO ou VARIAVEL.');
  }
  return bruto;
}

/**
 * Quantidade de parcelas. Ausente (ou 1) significa compra à vista.
 *
 * O valor informado no lançamento é o de CADA PARCELA, não o total — é o
 * número que aparece na fatura, e evita a sobra de centavo que uma divisão
 * como 100 ÷ 3 deixaria.
 */
export function validarParcelas(bruto: unknown): number {
  if (bruto === undefined || bruto === null || bruto === '') {
    return 1;
  }

  const quantidade = typeof bruto === 'string' ? Number(bruto) : bruto;

  if (typeof quantidade !== 'number' || !Number.isInteger(quantidade)) {
    throw new ErroDeValidacao('Número de parcelas inválido.');
  }
  if (quantidade < 1 || quantidade > PARCELAS_MAXIMAS) {
    throw new ErroDeValidacao(`Informe entre 1 e ${PARCELAS_MAXIMAS} parcelas.`);
  }

  return quantidade;
}
