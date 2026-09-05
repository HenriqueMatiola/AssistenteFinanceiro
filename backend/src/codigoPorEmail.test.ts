import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gerarCodigo,
  validarCodigoDigitado,
  expiracaoAPartirDe,
  segundosParaPoderReenviar,
  problemaComOCodigo,
  hashDoCodigo,
  codigoConfere,
  VALIDADE_EM_MINUTOS,
  MAXIMO_DE_TENTATIVAS,
  INTERVALO_ENTRE_ENVIOS_EM_SEGUNDOS,
} from './codigoPorEmail.ts';
import { ErroDeValidacao } from './validacao.ts';

// Uma hora qualquer, fixa: teste que depende do relógio de verdade falha
// sozinho um dia.
const AGORA = new Date('2026-09-01T12:00:00.000Z');

function daquiA(segundos: number): Date {
  return new Date(AGORA.getTime() + segundos * 1000);
}

// --- Sorteio do código ------------------------------------------------------

test('o código sorteado tem sempre 6 dígitos, zeros à esquerda incluídos', () => {
  // Cem sorteios: o suficiente para pegar um "000042" que tivesse perdido os
  // zeros, sem deixar o teste lento.
  for (let i = 0; i < 100; i++) {
    assert.match(gerarCodigo(), /^\d{6}$/);
  }
});

test('dois códigos seguidos não são iguais — o sorteio não é uma constante', () => {
  const sorteados = new Set(Array.from({ length: 50 }, gerarCodigo));
  assert.ok(sorteados.size > 40, `sorteios repetidos demais: ${sorteados.size} de 50`);
});

// --- O que a pessoa digita --------------------------------------------------

test('código digitado com espaços ou traço passa — quem copia do e-mail traz sujeira junto', () => {
  assert.equal(validarCodigoDigitado(' 123 456 '), '123456');
  assert.equal(validarCodigoDigitado('123-456'), '123456');
});

test('código digitado recusa tamanho errado, letra e valor que não é texto', () => {
  assert.throws(() => validarCodigoDigitado('12345'), ErroDeValidacao);
  assert.throws(() => validarCodigoDigitado('1234567'), ErroDeValidacao);
  assert.throws(() => validarCodigoDigitado('12345a'), ErroDeValidacao);
  assert.throws(() => validarCodigoDigitado(123456), ErroDeValidacao);
  assert.throws(() => validarCodigoDigitado(undefined), ErroDeValidacao);
});

test('código todo de zeros é válido — é um sorteio possível como qualquer outro', () => {
  assert.equal(validarCodigoDigitado('000000'), '000000');
});

// --- Expiração --------------------------------------------------------------

test('a expiração cai VALIDADE_EM_MINUTOS depois de agora', () => {
  const expira = expiracaoAPartirDe(AGORA);
  assert.equal(expira.getTime() - AGORA.getTime(), VALIDADE_EM_MINUTOS * 60_000);
});

// --- Intervalo entre reenvios -----------------------------------------------

test('sem envio anterior, pode mandar na hora', () => {
  assert.equal(segundosParaPoderReenviar(null, AGORA), 0);
});

test('logo depois de enviar, ainda falta esperar o intervalo inteiro', () => {
  assert.equal(
    segundosParaPoderReenviar(AGORA, AGORA),
    INTERVALO_ENTRE_ENVIOS_EM_SEGUNDOS
  );
});

test('passado o intervalo, a espera é zero e nunca negativa', () => {
  const enviadoEm = AGORA;
  const bemDepois = daquiA(INTERVALO_ENTRE_ENVIOS_EM_SEGUNDOS + 300);
  assert.equal(segundosParaPoderReenviar(enviadoEm, bemDepois), 0);
});

test('a espera arredonda para cima — não dizemos "0 segundos" a quem ainda espera', () => {
  const enviadoEm = AGORA;
  // Falta meio segundo para liberar.
  const quaseLa = daquiA(INTERVALO_ENTRE_ENVIOS_EM_SEGUNDOS - 0.5);
  assert.equal(segundosParaPoderReenviar(enviadoEm, quaseLa), 1);
});

// --- O código ainda pode ser conferido? -------------------------------------

const CODIGO_BOM = {
  hash: 'hash-qualquer',
  expiraEm: daquiA(60),
  tentativas: 0,
};

test('código dentro da validade e sem tentativas gastas pode ser conferido', () => {
  assert.equal(problemaComOCodigo(CODIGO_BOM, AGORA), null);
});

test('sem código guardado, não há o que conferir', () => {
  assert.equal(
    problemaComOCodigo({ hash: null, expiraEm: null, tentativas: 0 }, AGORA),
    'sem-codigo'
  );
  // Meia-linha (hash sem data, ou o contrário) também não vale.
  assert.equal(
    problemaComOCodigo({ hash: 'x', expiraEm: null, tentativas: 0 }, AGORA),
    'sem-codigo'
  );
});

test('código expirado é recusado antes de comparar os dígitos', () => {
  assert.equal(
    problemaComOCodigo({ ...CODIGO_BOM, expiraEm: daquiA(-1) }, AGORA),
    'expirado'
  );
});

test('o instante exato da expiração já está fora — o limite não é inclusivo', () => {
  assert.equal(problemaComOCodigo({ ...CODIGO_BOM, expiraEm: AGORA }, AGORA), 'expirado');
});

test('código queimado por tentativas erradas não é mais conferido', () => {
  assert.equal(
    problemaComOCodigo({ ...CODIGO_BOM, tentativas: MAXIMO_DE_TENTATIVAS }, AGORA),
    'tentativas-esgotadas'
  );
});

test('a última tentativa permitida ainda passa pela porteira', () => {
  assert.equal(
    problemaComOCodigo({ ...CODIGO_BOM, tentativas: MAXIMO_DE_TENTATIVAS - 1 }, AGORA),
    null
  );
});

test('expirado ganha de tentativas esgotadas — o motivo mais antigo é o que vale', () => {
  assert.equal(
    problemaComOCodigo(
      { hash: 'x', expiraEm: daquiA(-1), tentativas: MAXIMO_DE_TENTATIVAS },
      AGORA
    ),
    'expirado'
  );
});

// --- Hash -------------------------------------------------------------------

test('o hash não é o código, e o código certo confere contra ele', async () => {
  const codigo = '481502';
  const hash = await hashDoCodigo(codigo);

  assert.notEqual(hash, codigo);
  assert.ok(!hash.includes(codigo), 'o hash não pode carregar os dígitos dentro');
  assert.equal(await codigoConfere(codigo, hash), true);
});

test('código errado não confere, nem quando erra por um dígito', async () => {
  const hash = await hashDoCodigo('481502');
  assert.equal(await codigoConfere('481503', hash), false);
});
