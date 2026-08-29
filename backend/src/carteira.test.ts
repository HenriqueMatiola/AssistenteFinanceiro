/**
 * Testes da consolidação da carteira.  Rode com:  npm test
 *
 * O foco é a regra do preço médio depois de uma venda, que é a parte fácil de
 * errar — e que nenhum typecheck pegaria se errasse.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { consolidarPorAtivo, resumirPorClasse } from './carteira.ts';

/** Atalho para escrever operações sem repetir os campos fixos. */
function compra(ativo: string, data: string, quantidade: number, valor: number) {
  return { ativo, classe: 'ACAO' as const, tipo: 'COMPRA' as const, data, quantidade, valor };
}

function venda(ativo: string, data: string, quantidade: number, valor: number) {
  return { ativo, classe: 'ACAO' as const, tipo: 'VENDA' as const, data, quantidade, valor };
}

describe('consolidarPorAtivo', () => {
  it('soma compras e calcula o preço médio ponderado', () => {
    // 100 a R$ 30 e 100 a R$ 40 → 200 papéis com média de R$ 35.
    const [p] = consolidarPorAtivo([
      compra('PETR4.SA', '2026-01-10', 100, 3000),
      compra('PETR4.SA', '2026-03-15', 100, 4000),
    ]);

    assert.equal(p?.quantidade, 200);
    assert.equal(p?.custoTotal, 7000);
    assert.equal(p?.precoMedio, 35);
  });

  it('venda parcial NÃO muda o preço médio', () => {
    // Esta é a regra central. Vender metade não torna a outra metade mais
    // cara: ela custou o que custou.
    const [p] = consolidarPorAtivo([
      compra('PETR4.SA', '2026-01-10', 200, 7000), // média 35
      venda('PETR4.SA', '2026-06-01', 100, 4500), // vendeu 100 por 4500
    ]);

    assert.equal(p?.quantidade, 100);
    assert.equal(p?.precoMedio, 35, 'a média tem de continuar 35');
    assert.equal(p?.custoTotal, 3500, 'sobrou o custo dos 100 que ficaram');
    // Recebeu 4500 por algo que custou 100 × 35 = 3500.
    assert.equal(p?.lucroRealizado, 1000);
    assert.equal(p?.quantidadeVendida, 100);
  });

  it('registra prejuízo realizado quando se vende abaixo da média', () => {
    const [p] = consolidarPorAtivo([
      compra('PETR4.SA', '2026-01-10', 100, 4000), // média 40
      venda('PETR4.SA', '2026-06-01', 50, 1500), // 50 × 40 = 2000 de custo
    ]);

    assert.equal(p?.lucroRealizado, -500);
    assert.equal(p?.precoMedio, 40);
  });

  it('a ordem das operações é a das datas, não a da lista', () => {
    // A venda chega antes na lista, mas aconteceu depois. Se o motor não
    // ordenasse, ela venderia de uma posição que ainda não existia.
    const [p] = consolidarPorAtivo([
      venda('PETR4.SA', '2026-06-01', 100, 4500),
      compra('PETR4.SA', '2026-01-10', 200, 7000),
    ]);

    assert.equal(p?.quantidade, 100);
    assert.equal(p?.lucroRealizado, 1000);
  });

  it('zera a posição quando tudo é vendido, mantendo o resultado', () => {
    const [p] = consolidarPorAtivo([
      compra('PETR4.SA', '2026-01-10', 100, 3000),
      venda('PETR4.SA', '2026-06-01', 100, 3800),
    ]);

    assert.equal(p?.quantidade, 0);
    assert.equal(p?.custoTotal, 0);
    assert.equal(p?.precoMedio, 0);
    // O ativo continua na lista: o lucro dele é história que interessa.
    assert.equal(p?.lucroRealizado, 800);
  });

  it('comprar de novo depois de zerar recomeça a média', () => {
    const [p] = consolidarPorAtivo([
      compra('PETR4.SA', '2026-01-10', 100, 3000),
      venda('PETR4.SA', '2026-06-01', 100, 3800),
      compra('PETR4.SA', '2026-07-01', 50, 2500), // média nova: 50
    ]);

    assert.equal(p?.quantidade, 50);
    assert.equal(p?.precoMedio, 50);
    assert.equal(p?.lucroRealizado, 800, 'o lucro da venda anterior continua valendo');
  });

  it('não deixa a posição ficar negativa', () => {
    const [p] = consolidarPorAtivo([
      compra('PETR4.SA', '2026-01-10', 100, 3000),
      venda('PETR4.SA', '2026-06-01', 500, 1000),
    ]);

    assert.equal(p?.quantidade, 0);
    assert.equal(p?.quantidadeVendida, 100);
  });

  it('separa ativos diferentes', () => {
    const posicoes = consolidarPorAtivo([
      compra('PETR4.SA', '2026-01-10', 100, 3000),
      compra('HGLG11.SA', '2026-02-10', 20, 3200),
    ]);

    assert.equal(posicoes.length, 2);
    assert.equal(posicoes.find((p) => p.ativo === 'HGLG11.SA')?.precoMedio, 160);
  });

  it('aguenta quantidade fracionária de cripto', () => {
    const [p] = consolidarPorAtivo([
      { ativo: 'BTC-USD', classe: 'CRIPTO', tipo: 'COMPRA', data: '2026-01-10', quantidade: 0.005, valor: 1500 },
      { ativo: 'BTC-USD', classe: 'CRIPTO', tipo: 'COMPRA', data: '2026-02-10', quantidade: 0.005, valor: 1700 },
    ]);

    assert.equal(p?.quantidade, 0.01);
    assert.equal(p?.custoTotal, 3200);
    assert.equal(p?.precoMedio, 320000);
  });

  it('lista vazia não quebra', () => {
    assert.deepEqual(consolidarPorAtivo([]), []);
  });
});

describe('resumirPorClasse', () => {
  it('agrupa investido e valor atual por tipo de ativo', () => {
    const resumo = resumirPorClasse([
      { classe: 'ACAO', quantidade: 100, custoTotal: 3000, valorAtual: 4355 },
      { classe: 'ACAO', quantidade: 50, custoTotal: 1650, valorAtual: 1959 },
      { classe: 'FII', quantidade: 20, custoTotal: 3200, valorAtual: 2966 },
    ]);

    const acoes = resumo.find((c) => c.classe === 'ACAO');
    assert.equal(acoes?.investido, 4650);
    assert.equal(acoes?.valorAtual, 6314);
    assert.equal(acoes?.lucro, 1664);
    assert.equal(acoes?.ativos, 2);

    const fiis = resumo.find((c) => c.classe === 'FII');
    assert.equal(fiis?.lucro, -234);
  });

  it('ordena da maior posição para a menor', () => {
    const resumo = resumirPorClasse([
      { classe: 'FII', quantidade: 1, custoTotal: 100, valorAtual: 100 },
      { classe: 'ACAO', quantidade: 1, custoTotal: 900, valorAtual: 900 },
    ]);

    assert.equal(resumo[0]?.classe, 'ACAO');
  });

  it('ignora posições zeradas', () => {
    const resumo = resumirPorClasse([
      { classe: 'ACAO', quantidade: 0, custoTotal: 0, valorAtual: 0 },
      { classe: 'FII', quantidade: 20, custoTotal: 3200, valorAtual: 2966 },
    ]);

    assert.equal(resumo.length, 1);
    assert.equal(resumo[0]?.classe, 'FII');
  });

  it('deixa de fora os dois lados de um ativo sem cotação', () => {
    // Somar o investido sem o valor atual correspondente mostraria um
    // prejuízo do tamanho da posição sem preço.
    const resumo = resumirPorClasse([
      { classe: 'ACAO', quantidade: 100, custoTotal: 3000, valorAtual: 4355 },
      { classe: 'ACAO', quantidade: 10, custoTotal: 9999, valorAtual: null },
    ]);

    assert.equal(resumo[0]?.investido, 3000);
    assert.equal(resumo[0]?.valorAtual, 4355);
    assert.equal(resumo[0]?.ativos, 1);
  });
});
