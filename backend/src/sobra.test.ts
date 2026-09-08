import test from 'node:test';
import assert from 'node:assert/strict';
import { sobraQueEntraNoMes } from './sobra.ts';

// --- O acumulado do app -----------------------------------------------------

test('acumulado positivo atravessa inteiro', () => {
  assert.equal(sobraQueEntraNoMes(1200.5, 0), 1200.5);
});

test('acumulado negativo vira zero — foi conta paga, não dívida deste mês', () => {
  // O caso que motivou o módulo: meses fechados no vermelho apareciam como
  // "sobra anterior" negativa e derrubavam o disponível todo mês, cobrando de
  // novo contas que já tinham sido pagas.
  assert.equal(sobraQueEntraNoMes(-1057.95, 0), 0);
});

test('acumulado exatamente zero continua zero', () => {
  assert.equal(sobraQueEntraNoMes(0, 0), 0);
});

// --- A sobra digitada pela pessoa -------------------------------------------

test('a sobra informada à mão passa como está, inclusive negativa', () => {
  // Quem começou a usar o app devendo disse isso de propósito. Zerar seria
  // discordar do usuário sobre o saldo da conta dele.
  assert.equal(sobraQueEntraNoMes(0, -500), -500);
  assert.equal(sobraQueEntraNoMes(0, 800), 800);
});

test('o vermelho acumulado não come a sobra informada à mão', () => {
  // Sem o Math.max, isto daria -200. O acumulado morre em zero ANTES da soma,
  // então sobra o que a pessoa declarou.
  assert.equal(sobraQueEntraNoMes(-1000, 800), 800);
});

test('as duas parcelas positivas se somam', () => {
  assert.equal(sobraQueEntraNoMes(300, 200), 500);
});

test('acumulado positivo e mão negativa podem se anular', () => {
  assert.equal(sobraQueEntraNoMes(500, -500), 0);
});
