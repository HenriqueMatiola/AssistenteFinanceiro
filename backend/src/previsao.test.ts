/**
 * Testes da previsão que entra no balanço.  Rode com:  npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mesAceitaPrevisao, recorrenciasPendentes, totalPrevisto } from './previsao.ts';

describe('mesAceitaPrevisao', () => {
  it('aceita o mês corrente', () => {
    assert.equal(mesAceitaPrevisao('2026-08', '2026-08'), true);
  });

  it('aceita meses futuros', () => {
    assert.equal(mesAceitaPrevisao('2026-12', '2026-08'), true);
    assert.equal(mesAceitaPrevisao('2027-01', '2026-08'), true);
  });

  it('recusa meses passados', () => {
    // Julho não ganha um aluguel estimado só porque ninguém o lançou.
    assert.equal(mesAceitaPrevisao('2026-07', '2026-08'), false);
    assert.equal(mesAceitaPrevisao('2025-12', '2026-08'), false);
  });
});

describe('recorrenciasPendentes', () => {
  const recorrencias = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('devolve todas quando nada foi lançado', () => {
    assert.deepEqual(recorrenciasPendentes(recorrencias, new Set()), recorrencias);
  });

  it('tira as que já viraram lançamento', () => {
    assert.deepEqual(
      recorrenciasPendentes(recorrencias, new Set([2])).map((r) => r.id),
      [1, 3]
    );
  });

  it('devolve vazio quando todas já foram lançadas', () => {
    assert.deepEqual(recorrenciasPendentes(recorrencias, new Set([1, 2, 3])), []);
  });
});

describe('totalPrevisto', () => {
  it('separa entrada de saída', () => {
    const totais = totalPrevisto([
      { id: 1, valor: 2404, tipo: 'GANHO' },
      { id: 2, valor: 1200, tipo: 'GASTO' },
      { id: 3, valor: 31.9, tipo: 'GASTO' },
    ]);

    assert.equal(totais.entradas, 2404);
    assert.equal(totais.saidas, 1231.9);
  });

  it('devolve zeros sem nenhuma pendente', () => {
    assert.deepEqual(totalPrevisto([]), { entradas: 0, saidas: 0 });
  });

  it('não deixa o ponto flutuante estragar os centavos', () => {
    // Somados como `number`, 0.1 + 0.2 dariam 0.30000000000000004.
    const totais = totalPrevisto([
      { id: 1, valor: 0.1, tipo: 'GASTO' },
      { id: 2, valor: 0.2, tipo: 'GASTO' },
    ]);

    assert.equal(totais.saidas, 0.3);
  });
});
