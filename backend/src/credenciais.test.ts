import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validarNomeDeUsuario,
  validarEmail,
  validarSenha,
  normalizarIdentificador,
  nomeDeExibicao,
  validarNomeDeExibicao,
} from './credenciais.ts';
import { ErroDeValidacao } from './validacao.ts';

// --- Nome de usuário --------------------------------------------------------

test('nome de usuário vai para o banco em minúsculas e sem espaços nas pontas', () => {
  assert.equal(validarNomeDeUsuario('  Henrique  '), 'henrique');
});

test('nome de usuário aceita ponto, hífen, sublinhado e número', () => {
  assert.equal(validarNomeDeUsuario('pai.matiola_2'), 'pai.matiola_2');
});

test('nome de usuário recusa espaço no meio', () => {
  assert.throws(() => validarNomeDeUsuario('henrique matiola'), ErroDeValidacao);
});

test('nome de usuário recusa acento — quem cadastra "joão" digitaria "joao" ao entrar', () => {
  assert.throws(() => validarNomeDeUsuario('joão'), ErroDeValidacao);
});

test('nome de usuário recusa curto demais e longo demais', () => {
  assert.throws(() => validarNomeDeUsuario('ab'), ErroDeValidacao);
  assert.throws(() => validarNomeDeUsuario('a'.repeat(21)), ErroDeValidacao);
});

test('nome de usuário com 3 e com 20 caracteres passa — os limites são inclusivos', () => {
  assert.equal(validarNomeDeUsuario('abc'), 'abc');
  assert.equal(validarNomeDeUsuario('a'.repeat(20)), 'a'.repeat(20));
});

test('nome de usuário recusa o que não é texto', () => {
  assert.throws(() => validarNomeDeUsuario(undefined), ErroDeValidacao);
  assert.throws(() => validarNomeDeUsuario(12345), ErroDeValidacao);
});

// --- E-mail -----------------------------------------------------------------

test('e-mail é normalizado para minúsculas', () => {
  assert.equal(validarEmail('  Henrike.Matiola@Gmail.COM '), 'henrike.matiola@gmail.com');
});

test('e-mail recusa endereço sem arroba, sem domínio ou com espaço', () => {
  assert.throws(() => validarEmail('henrique'), ErroDeValidacao);
  assert.throws(() => validarEmail('henrique@gmail'), ErroDeValidacao);
  assert.throws(() => validarEmail('henrique @gmail.com'), ErroDeValidacao);
  assert.throws(() => validarEmail('@gmail.com'), ErroDeValidacao);
});

// --- Senha ------------------------------------------------------------------

test('senha com menos de 8 caracteres é recusada', () => {
  assert.throws(() => validarSenha('1234567'), ErroDeValidacao);
});

test('senha preserva espaço nas pontas — cortá-lo mudaria a senha escolhida', () => {
  assert.equal(validarSenha(' senha secreta '), ' senha secreta ');
});

// --- Identificador de entrada -----------------------------------------------

test('identificador é normalizado, mas não validado: texto estranho só não acha ninguém', () => {
  assert.equal(normalizarIdentificador('  HENRIQUE '), 'henrique');
  assert.equal(normalizarIdentificador('Nao@Existe.com'), 'nao@existe.com');
  assert.equal(normalizarIdentificador('!!!'), '!!!');
});

// --- Nome de exibição -------------------------------------------------------

test('nome de exibição sobe a primeira letra do nome de usuário', () => {
  assert.equal(nomeDeExibicao('henrique'), 'Henrique');
  assert.equal(nomeDeExibicao('pai.matiola'), 'Pai.matiola');
});

test('nome de exibição aceita acento, espaço e maiúscula — não é chave de acesso', () => {
  assert.equal(validarNomeDeExibicao('  João Matiola  '), 'João Matiola');
});

test('nome de exibição junta espaços repetidos', () => {
  assert.equal(validarNomeDeExibicao('Henrique   Matiola'), 'Henrique Matiola');
});

test('nome de exibição recusa vazio e só espaços', () => {
  assert.throws(() => validarNomeDeExibicao(''), ErroDeValidacao);
  assert.throws(() => validarNomeDeExibicao('    '), ErroDeValidacao);
  assert.throws(() => validarNomeDeExibicao(null), ErroDeValidacao);
});

test('nome de exibição recusa acima de 40 caracteres', () => {
  assert.equal(validarNomeDeExibicao('a'.repeat(40)), 'a'.repeat(40));
  assert.throws(() => validarNomeDeExibicao('a'.repeat(41)), ErroDeValidacao);
});
