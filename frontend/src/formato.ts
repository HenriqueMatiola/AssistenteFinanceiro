/** Formatação de datas e valores para exibição em português. */

/** Data de hoje como "AAAA-MM-DD", no fuso de quem está usando o app. */
export function hojeISO(): string {
  const agora = new Date();
  const minutosDeDiferenca = agora.getTimezoneOffset();
  // Desconta o fuso antes de converter, senão à noite a data volta um dia.
  return new Date(agora.getTime() - minutosDeDiferenca * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Mês atual como "AAAA-MM". */
export function mesAtualISO(): string {
  return hojeISO().slice(0, 7);
}

/** "2026-08-18" → "18/08/2026", sem passar por Date (e portanto sem fuso). */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "2026-08" → "agosto de 2026" */
export function formatarMes(iso: string): string {
  const [ano, mes] = iso.split('-').map(Number) as [number, number];
  const nome = new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return nome;
}

const formatadorDeDinheiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** 1234.5 → "R$ 1.234,50" */
export function formatarDinheiro(valor: number): string {
  return formatadorDeDinheiro.format(valor);
}

// --- Rótulos ----------------------------------------------------------------

/**
 * O mesmo status muda de nome conforme o tipo: dinheiro que sai está "A pagar",
 * dinheiro que entra está "A receber". Guardar um valor só no banco e traduzir
 * aqui evita ter dois campos dizendo a mesma coisa.
 */
export function rotuloDoStatus(
  tipo: 'GASTO' | 'GANHO',
  status: 'PENDENTE' | 'CONCLUIDA'
): string {
  if (tipo === 'GANHO') {
    return status === 'PENDENTE' ? 'A receber' : 'Recebido';
  }
  return status === 'PENDENTE' ? 'A pagar' : 'Pago';
}

/** O que o botão de status faz quando clicado — o oposto do estado atual. */
export function rotuloDaAcaoDeStatus(
  tipo: 'GASTO' | 'GANHO',
  status: 'PENDENTE' | 'CONCLUIDA'
): string {
  if (status === 'CONCLUIDA') {
    return 'Reabrir';
  }
  return tipo === 'GANHO' ? 'Marcar recebido' : 'Marcar pago';
}

export function rotuloDaClassificacao(classificacao: 'FIXO' | 'VARIAVEL' | null): string {
  if (classificacao === 'FIXO') return 'Fixo';
  if (classificacao === 'VARIAVEL') return 'Variável';
  return '';
}

/** "3/12" para uma compra parcelada; vazio quando foi à vista. */
export function rotuloDaParcela(atual: number | null, totais: number | null): string {
  if (atual === null || totais === null) return '';
  return `${atual}/${totais}`;
}
