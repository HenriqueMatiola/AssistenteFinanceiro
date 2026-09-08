import test from 'node:test';
import assert from 'node:assert/strict';
import { motivoDoBloqueio, mensagemDoBloqueio } from './acessoAoApp.ts';

const CONFIRMADO = new Date('2026-09-01T12:00:00.000Z');

// O servidor sabe mandar e-mail. É o caso em que o portão de fato funciona;
// por isso ele é o padrão dos testes abaixo.
const ENVIO_LIGADO = true;
const ENVIO_DESLIGADO = false;

// --- A válvula de segurança -------------------------------------------------

test('sem envio de e-mail configurado, ninguém é barrado', () => {
  // O teste que mais importa deste arquivo: é ele que impede o app de trancar
  // todo mundo para fora num servidor que não tem como mandar o código.
  assert.equal(
    motivoDoBloqueio({ email: 'ana@exemplo.com', emailVerificadoEm: null }, ENVIO_DESLIGADO),
    null
  );

  assert.equal(motivoDoBloqueio({ email: null, emailVerificadoEm: null }, ENVIO_DESLIGADO), null);
});

// --- Quem passa -------------------------------------------------------------

test('quem já confirmou o e-mail passa', () => {
  assert.equal(
    motivoDoBloqueio({ email: 'ana@exemplo.com', emailVerificadoEm: CONFIRMADO }, ENVIO_LIGADO),
    null
  );
});

// --- Quem é barrado ---------------------------------------------------------

test('quem tem e-mail e não confirmou é barrado, e a saída é digitar o código', () => {
  assert.equal(
    motivoDoBloqueio({ email: 'ana@exemplo.com', emailVerificadoEm: null }, ENVIO_LIGADO),
    'nao-confirmado'
  );
});

test('conta antiga sem e-mail nenhum é barrada por outro motivo', () => {
  // A distinção não é preciosismo: mandar "confirme seu e-mail" para quem não
  // tem e-mail nenhum é um beco sem saída. O motivo separado é o que deixa a
  // tela dizer "cadastre um" em vez disso.
  assert.equal(motivoDoBloqueio({ email: null, emailVerificadoEm: null }, ENVIO_LIGADO), 'sem-email');
});

// --- As frases --------------------------------------------------------------

test('cada motivo tem uma frase própria, e nenhuma vem vazia', () => {
  for (const motivo of ['sem-email', 'nao-confirmado'] as const) {
    assert.ok(mensagemDoBloqueio(motivo).length > 0);
  }

  assert.notEqual(mensagemDoBloqueio('sem-email'), mensagemDoBloqueio('nao-confirmado'));
});
