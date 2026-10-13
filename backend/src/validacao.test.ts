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
  validarIds,
  validarMes,
  validarParcelas,
  validarValor,
  validarVencimento,
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

describe('validarVencimento', () => {
  const COMPRA = new Date('2026-10-05T00:00:00.000Z');

  it('ausente significa "no mesmo dia"', () => {
    // Os três jeitos de o campo chegar vazio da tela.
    assert.equal(validarVencimento(undefined, COMPRA), null);
    assert.equal(validarVencimento(null, COMPRA), null);
    assert.equal(validarVencimento('', COMPRA), null);
  });

  it('aceita vencimento depois da compra', () => {
    const vencimento = validarVencimento('2026-11-10', COMPRA);
    assert.equal(vencimento?.toISOString().slice(0, 10), '2026-11-10');
  });

  it('aceita o mesmo dia — é um jeito explícito de dizer "à vista"', () => {
    assert.equal(validarVencimento('2026-10-05', COMPRA)?.toISOString(), COMPRA.toISOString());
  });

  it('recusa vencimento anterior à compra', () => {
    // Não é caso de uso, é dedo no campo errado — e o estrago seria calado,
    // jogando a despesa para um mês já fechado.
    assert.throws(() => validarVencimento('2026-09-30', COMPRA), ErroDeValidacao);
  });

  it('recusa data inexistente, como qualquer outro campo de data', () => {
    assert.throws(() => validarVencimento('2026-02-31', COMPRA), ErroDeValidacao);
  });
});

describe('validarIds', () => {
  it('aceita uma lista de ids e descarta os repetidos', () => {
    assert.deepEqual(validarIds([3, 1, 3]), [3, 1]);
  });

  it('recusa lista vazia e o que não é lista', () => {
    assert.throws(() => validarIds([]), ErroDeValidacao);
    assert.throws(() => validarIds(undefined), ErroDeValidacao);
    assert.throws(() => validarIds(5), ErroDeValidacao);
  });

  it('recusa a lista inteira se um id for inválido', () => {
    // Fazer metade do pedido em silêncio seria pior que recusar o pedido.
    assert.throws(() => validarIds([1, 0]), ErroDeValidacao);
    assert.throws(() => validarIds([1, 'abc']), ErroDeValidacao);
    assert.throws(() => validarIds([1, 2.5]), ErroDeValidacao);
  });

  it('recusa acima do teto por requisição', () => {
    const muitos = Array.from({ length: 501 }, (_, i) => i + 1);
    assert.throws(() => validarIds(muitos), ErroDeValidacao);
  });
});
