import test from 'node:test';
import assert from 'node:assert/strict';
import { textoDoCodigo, textoDoCodigoDeSenha } from './email.ts';
import { VALIDADE_EM_MINUTOS } from './codigoPorEmail.ts';

test('o e-mail leva o código nas duas versões, texto puro e HTML', () => {
  const { texto, html } = textoDoCodigo('Henrique', '481502');

  assert.ok(texto.includes('481502'));
  assert.ok(html.includes('481502'));
  assert.ok(texto.includes('Henrique'));
});

test('o e-mail avisa por quanto tempo o código vale', () => {
  const { texto } = textoDoCodigo('Henrique', '481502');
  assert.ok(texto.includes(String(VALIDADE_EM_MINUTOS)));
});

test('nome com HTML dentro não vira marcação na mensagem', () => {
  // O nome vem do campo do Perfil, digitado pela própria pessoa. Sem escapar,
  // isto entraria como marcação de verdade dentro do e-mail.
  const { html } = textoDoCodigo('<script>alert(1)</script>', '481502');

  assert.ok(!html.includes('<script>'), 'a tag não pode sobreviver inteira');
  assert.ok(html.includes('&lt;script&gt;'), 'ela vira texto visível');
});

// --- E-mail de recuperação de senha -----------------------------------------

test('o e-mail de senha leva o código e avisa que ele só serve uma vez', () => {
  const { texto, html } = textoDoCodigoDeSenha('Henrique', '481502', false);

  assert.ok(texto.includes('481502'));
  assert.ok(html.includes('481502'));
  assert.ok(texto.includes('uma vez'));
});

test('conta sem senha recebe "criar uma senha"; conta com senha, "redefinir"', () => {
  // Quem abriu a conta pelo Google nunca escolheu senha: falar em recuperar o
  // que nunca existiu confundiria.
  assert.ok(textoDoCodigoDeSenha('Ana', '481502', true).texto.includes('criar uma senha'));
  assert.ok(textoDoCodigoDeSenha('Ana', '481502', false).texto.includes('redefinir sua senha'));
});

test('o e-mail de senha diz que ignorar basta se não foi você quem pediu', () => {
  // A frase mais importante da mensagem: sem ela, quem recebe sem ter pedido
  // acha que a conta foi invadida.
  const { texto } = textoDoCodigoDeSenha('Ana', '481502', false);
  assert.ok(texto.includes('ignorar'));
  assert.ok(texto.includes('continua valendo'));
});

test('nome com HTML dentro também é escapado no e-mail de senha', () => {
  const { html } = textoDoCodigoDeSenha('<script>alert(1)</script>', '481502', false);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
