/**
 * Testes das contas de investimento.  Rode com:  npm test
 *
 * Nenhum deles toca a internet: a conta é separada da busca de cotação
 * justamente para poder ser verificada com o mercado fechado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calcularPosicao, somarCarteira } from './investimentos.ts';

describe('calcularPosicao', () => {
  it('calcula preço médio, valor atual e lucro', () => {
    // 100 ações por R$ 3.000 = R$ 30,00 cada. Cotação a R$ 35,50.
    const r = calcularPosicao({ quantidade: 100, valorPago: 3000 }, 35.5);

    assert.equal(r.precoMedio, 30);
    assert.equal(r.valorAtual, 3550);
    assert.equal(r.lucro, 550);
    assert.equal(r.variacao?.toFixed(4), '0.1833');
  });

  it('mostra prejuízo como lucro negativo', () => {
    const r = calcularPosicao({ quantidade: 100, valorPago: 3000 }, 25);

    assert.equal(r.valorAtual, 2500);
    assert.equal(r.lucro, -500);
    assert.equal(r.variacao?.toFixed(4), '-0.1667');
  });

  it('aguenta quantidade fracionária, como em cripto', () => {
    // 0,005 BTC comprados por R$ 1.500 → R$ 300.000 por BTC.
    const r = calcularPosicao({ quantidade: 0.005, valorPago: 1500 }, 340000);

    assert.equal(r.precoMedio, 300000);
    assert.equal(r.valorAtual, 1700);
    assert.equal(r.lucro, 200);
  });

  it('devolve nulos quando a cotação não veio', () => {
    // Sem preço não há valor atual. Zerar diria que o ativo virou pó.
    const r = calcularPosicao({ quantidade: 100, valorPago: 3000 }, null);

    assert.equal(r.precoMedio, 30);
    assert.equal(r.valorAtual, null);
    assert.equal(r.lucro, null);
    assert.equal(r.variacao, null);
  });

  it('não divide por zero', () => {
    assert.equal(calcularPosicao({ quantidade: 0, valorPago: 0 }, 10).precoMedio, 0);
    assert.equal(calcularPosicao({ quantidade: 10, valorPago: 0 }, 10).variacao, null);
  });

  it('lucro zero quando a cotação é igual ao preço médio', () => {
    const r = calcularPosicao({ quantidade: 100, valorPago: 3000 }, 30);

    assert.equal(r.lucro, 0);
    assert.equal(r.variacao, 0);
  });
});

describe('somarCarteira', () => {
  it('soma as posições e calcula o resultado', () => {
    const total = somarCarteira([
      { valorPago: 3000, valorAtual: 3550 },
      { valorPago: 1500, valorAtual: 1700 },
    ]);

    assert.equal(total.valorPago, 4500);
    assert.equal(total.valorAtual, 5250);
    assert.equal(total.lucro, 750);
    assert.equal(total.semCotacao, 0);
  });

  it('deixa de fora os DOIS lados de uma posição sem cotação', () => {
    // Somar o valor pago sem o valor atual correspondente inventaria um
    // prejuízo do tamanho exato da posição sem preço.
    const total = somarCarteira([
      { valorPago: 3000, valorAtual: 3550 },
      { valorPago: 9999, valorAtual: null },
    ]);

    assert.equal(total.valorPago, 3000);
    assert.equal(total.valorAtual, 3550);
    assert.equal(total.lucro, 550);
    assert.equal(total.semCotacao, 1);
  });

  it('carteira vazia não quebra nem inventa percentual', () => {
    const total = somarCarteira([]);

    assert.equal(total.valorPago, 0);
    assert.equal(total.lucro, 0);
    assert.equal(total.variacao, null);
  });
});
