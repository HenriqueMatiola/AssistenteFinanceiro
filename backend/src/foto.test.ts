import test from 'node:test';
import assert from 'node:assert/strict';
import { validarFotoDePerfil, bytesDoBase64, TAMANHO_MAXIMO_DA_FOTO } from './foto.ts';
import { ErroDeValidacao } from './validacao.ts';

/** Monta um data URI com um payload de base64 do tamanho pedido. */
function fotaDe(bytes: number, tipo = 'image/jpeg'): string {
  // 3 bytes viram 4 caracteres, então o payload sem enchimento é múltiplo de 4.
  const caracteres = Math.ceil(bytes / 3) * 4;
  return `data:${tipo};base64,${'A'.repeat(caracteres)}`;
}

test('null é aceito — é assim que se tira a foto e volta às iniciais', () => {
  assert.equal(validarFotoDePerfil(null), null);
});

test('JPEG, PNG e WebP passam', () => {
  for (const tipo of ['image/jpeg', 'image/png', 'image/webp']) {
    const foto = fotaDe(1024, tipo);
    assert.equal(validarFotoDePerfil(foto), foto);
  }
});

test('SVG é recusado mesmo sendo imagem: aceita script dentro', () => {
  assert.throws(() => validarFotoDePerfil(fotaDe(500, 'image/svg+xml')), ErroDeValidacao);
});

test('recusa o que não é imagem', () => {
  assert.throws(() => validarFotoDePerfil(fotaDe(500, 'application/pdf')), ErroDeValidacao);
  assert.throws(() => validarFotoDePerfil(fotaDe(500, 'text/html')), ErroDeValidacao);
});

test('recusa texto que não é data URI', () => {
  assert.throws(() => validarFotoDePerfil('https://exemplo.com/foto.jpg'), ErroDeValidacao);
  assert.throws(() => validarFotoDePerfil('só um texto'), ErroDeValidacao);
  assert.throws(() => validarFotoDePerfil(''), ErroDeValidacao);
});

test('recusa o que não é texto nem null', () => {
  assert.throws(() => validarFotoDePerfil(undefined), ErroDeValidacao);
  assert.throws(() => validarFotoDePerfil(42), ErroDeValidacao);
});

test('recusa foto acima do teto, e aceita logo abaixo dele', () => {
  assert.throws(() => validarFotoDePerfil(fotaDe(TAMANHO_MAXIMO_DA_FOTO + 3000)), ErroDeValidacao);

  const cabendo = fotaDe(TAMANHO_MAXIMO_DA_FOTO - 3000);
  assert.equal(validarFotoDePerfil(cabendo), cabendo);
});

test('bytesDoBase64 desconta o enchimento do fim', () => {
  // "AAAA" → 3 bytes; um '=' tira 1; dois '=' tiram 2.
  assert.equal(bytesDoBase64('AAAA'), 3);
  assert.equal(bytesDoBase64('AAA='), 2);
  assert.equal(bytesDoBase64('AA=='), 1);
});
