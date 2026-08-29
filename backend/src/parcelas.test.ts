/**
 * Testes das datas de parcelamento.  Rode com:  npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { datasDasParcelas } from './parcelas.ts';

/** Compara só a parte da data, que é o que vai para a coluna DATE. */
function comoTexto(datas: Date[]): string[] {
  return datas.map((d) => d.toISOString().slice(0, 10));
}

function data(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('datasDasParcelas', () => {
  it('gera uma parcela por mês a partir da data da compra', () => {
    assert.deepEqual(comoTexto(datasDasParcelas(data('2026-08-10'), 3)), [
      '2026-08-10',
      '2026-09-10',
      '2026-10-10',
    ]);
  });

  it('vira o ano', () => {
    assert.deepEqual(comoTexto(datasDasParcelas(data('2026-11-20'), 3)), [
      '2026-11-20',
      '2026-12-20',
      '2027-01-20',
    ]);
  });

  it('uma parcela só devolve a própria data', () => {
    assert.deepEqual(comoTexto(datasDasParcelas(data('2026-08-10'), 1)), ['2026-08-10']);
  });

  it('encolhe para o último dia quando o mês não tem o dia escolhido', () => {
    // Dia 31 em setembro (30 dias) e novembro (30 dias).
    assert.deepEqual(comoTexto(datasDasParcelas(data('2026-08-31'), 4)), [
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
    ]);
  });

  it('não arrasta o dia encurtado para as parcelas seguintes', () => {
    // Fevereiro encurta para 28, mas março volta para 31 — cada parcela é
    // calculada a partir da data original, não da anterior.
    const datas = comoTexto(datasDasParcelas(data('2027-01-31'), 3));
    assert.deepEqual(datas, ['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('respeita fevereiro de ano bissexto', () => {
    assert.deepEqual(comoTexto(datasDasParcelas(data('2028-01-31'), 2)), [
      '2028-01-31',
      '2028-02-29',
    ]);
  });

  it('aguenta um parcelamento longo sem perder o dia', () => {
    const datas = comoTexto(datasDasParcelas(data('2026-08-15'), 12));

    assert.equal(datas.length, 12);
    assert.equal(datas[0], '2026-08-15');
    assert.equal(datas.at(-1), '2027-07-15');
  });
});
