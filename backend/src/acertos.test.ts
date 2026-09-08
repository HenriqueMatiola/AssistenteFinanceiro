import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidarAcerto, cabeNoSaldo, totaisEmAberto } from './acertos.ts';

// --- Descontar as baixas ----------------------------------------------------

test('acerto sem baixa nenhuma deve tudo', () => {
  const { pago, saldo, quitado } = consolidarAcerto(200, []);

  assert.equal(pago, 0);
  assert.equal(saldo, 200);
  assert.equal(quitado, false);
});

test('baixa parcial abate só o que foi pago', () => {
  const { pago, saldo, quitado } = consolidarAcerto(200, [50]);

  assert.equal(pago, 50);
  assert.equal(saldo, 150);
  assert.equal(quitado, false);
});

test('baixas que somam o valor inteiro quitam o acerto', () => {
  const { saldo, quitado } = consolidarAcerto(200, [50, 100, 50]);

  assert.equal(saldo, 0);
  assert.equal(quitado, true);
});

test('centavos que não fecham em binário mesmo assim quitam', () => {
  // 0.1 + 0.2 dá 0.30000000000000004 em ponto flutuante. Somando em reais,
  // este acerto ficaria com um resto microscópico e nunca apareceria quitado.
  const { saldo, quitado } = consolidarAcerto(0.3, [0.1, 0.2]);

  assert.equal(saldo, 0);
  assert.equal(quitado, true);
});

test('dez parcelas de 33,33 não deixam sujeira', () => {
  const parcelas = Array.from({ length: 10 }, () => 33.33);
  const { pago, saldo } = consolidarAcerto(333.3, parcelas);

  assert.equal(pago, 333.3);
  assert.equal(saldo, 0);
});

// --- A baixa cabe? ----------------------------------------------------------

test('baixa menor ou igual ao saldo cabe', () => {
  assert.equal(cabeNoSaldo(50, 150), true);
  assert.equal(cabeNoSaldo(150, 150), true);
});

test('baixa maior que o saldo não cabe', () => {
  assert.equal(cabeNoSaldo(150.01, 150), false);
});

test('baixa de valor zero ou negativo não cabe', () => {
  // "Recebi R$ 0,00" não é um fato que mereça uma linha no histórico, e um
  // valor negativo faria a dívida CRESCER pela porta errada.
  assert.equal(cabeNoSaldo(0, 150), false);
  assert.equal(cabeNoSaldo(-10, 150), false);
});

test('num acerto já quitado nenhuma baixa cabe', () => {
  assert.equal(cabeNoSaldo(0.01, 0), false);
});

test('a comparação acontece em centavos, não em reais', () => {
  // Saldo de 0,30 nascido de 0,1 + 0,2: em reais a soma daria 0,30000000000004
  // e uma baixa de 0,30 seria recusada por um erro que não existe.
  const { saldo } = consolidarAcerto(0.6, [0.1, 0.2]);
  assert.equal(cabeNoSaldo(0.3, saldo), true);
});

// --- Os totais do topo ------------------------------------------------------

test('os totais somam os saldos, separando os dois lados', () => {
  const totais = totaisEmAberto([
    { tipo: 'RECEBER', valor: 200, baixas: [50] },
    { tipo: 'RECEBER', valor: 100, baixas: [] },
    { tipo: 'PAGAR', valor: 80, baixas: [30] },
  ]);

  assert.equal(totais.aReceber, 250);
  assert.equal(totais.aPagar, 50);
  assert.equal(totais.liquido, 200);
});

test('acerto quitado some dos totais, mesmo continuando na lista', () => {
  const totais = totaisEmAberto([
    { tipo: 'RECEBER', valor: 200, baixas: [200] },
    { tipo: 'PAGAR', valor: 80, baixas: [80] },
  ]);

  assert.equal(totais.aReceber, 0);
  assert.equal(totais.aPagar, 0);
  assert.equal(totais.liquido, 0);
});

test('o líquido fica negativo quando se deve mais do que se tem a receber', () => {
  const totais = totaisEmAberto([
    { tipo: 'RECEBER', valor: 100, baixas: [] },
    { tipo: 'PAGAR', valor: 250, baixas: [] },
  ]);

  assert.equal(totais.liquido, -150);
});

test('sem acerto nenhum, os três totais são zero', () => {
  const totais = totaisEmAberto([]);

  assert.equal(totais.aReceber, 0);
  assert.equal(totais.aPagar, 0);
  assert.equal(totais.liquido, 0);
});
