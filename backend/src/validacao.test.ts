/**
 * Testes das validações que várias rotas compartilham.  Rode com:  npm test
 *
 * `validarData` é a que mais merece teste: ela existe justamente para recusar
 * datas que o construtor `Date` aceitaria calado — 31 de fevereiro vira 3 de
 * março sem reclamar de nada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ErroDeValidacao,
  validarData,
  validarDiaDoMes,
  validarMes,
  validarParcelas,
  validarValor,
} from './validacao.ts';

describe('validarData', () => {
  it('aceita uma data válida e devolve em UTC, sem hora', () => {
    const data = validarData('2026-08-18');

    assert.equal(data.toISOString(), '2026-08-18T00:00:00.000Z');
  });

  it('recusa o que não está no formato AAAA-MM-DD', () => {
    for (const invalida of ['18/08/2026', '2026-8-18', 'ontem', '', '2026-08']) {
      assert.throws(() => validarData(invalida), ErroDeValidacao, `deveria recusar: ${invalida}`);
    }
  });

  it('recusa dias que não existem no calendário', () => {
    // O construtor Date "conserta" isto para 3 de março, calado.
    assert.throws(() => validarData('2026-02-31'), ErroDeValidacao);
    assert.throws(() => validarData('2026-04-31'), ErroDeValidacao);
    assert.throws(() => validarData('2027-02-29'), ErroDeValidacao);
  });

  it('aceita 29 de fevereiro em ano bissexto', () => {
    assert.equal(validarData('2028-02-29').toISOString().slice(0, 10), '2028-02-29');
  });

  it('recusa o que não é texto', () => {
    assert.throws(() => validarData(20260818), ErroDeValidacao);
    assert.throws(() => validarData(null), ErroDeValidacao);
    assert.throws(() => validarData(undefined), ErroDeValidacao);
  });
});

describe('validarMes', () => {
  it('aceita AAAA-MM', () => {
    assert.equal(validarMes('2026-08'), '2026-08');
  });

  it('recusa mês fora de 1 a 12', () => {
    // Sem esta checagem, "2026-99" viraria um mês de 2034 silenciosamente.
    assert.throws(() => validarMes('2026-99'), ErroDeValidacao);
    assert.throws(() => validarMes('2026-00'), ErroDeValidacao);
  });
});

describe('validarValor', () => {
  it('devolve texto com duas casas', () => {
    assert.equal(validarValor(1234.5), '1234.50');
  });

  it('aceita vírgula, como se escreve em português', () => {
    assert.equal(validarValor('1234,56'), '1234.56');
  });

  it('recusa zero e negativo — o sinal vem do tipo', () => {
    assert.throws(() => validarValor(0), ErroDeValidacao);
    assert.throws(() => validarValor(-10), ErroDeValidacao);
  });
});

describe('validarDiaDoMes', () => {
  it('aceita 1 a 31', () => {
    assert.equal(validarDiaDoMes(1), 1);
    assert.equal(validarDiaDoMes('31'), 31);
  });

  it('recusa fora do intervalo', () => {
    assert.throws(() => validarDiaDoMes(0), ErroDeValidacao);
    assert.throws(() => validarDiaDoMes(32), ErroDeValidacao);
  });
});

describe('validarParcelas', () => {
  it('ausente significa à vista', () => {
    assert.equal(validarParcelas(undefined), 1);
    assert.equal(validarParcelas(''), 1);
  });

  it('recusa acima do limite', () => {
    assert.throws(() => validarParcelas(99), ErroDeValidacao);
  });
});
