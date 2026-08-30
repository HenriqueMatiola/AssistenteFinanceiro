import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatosDeLogin } from './google.ts';
import { validarNomeDeUsuario } from './credenciais.ts';

/*
 * `verificarCredencialDoGoogle` não é testado aqui: ele só faz sentido contra
 * um token assinado de verdade, e um teste que simulasse a resposta do Google
 * estaria testando o simulador. O que dá para testar sozinho é o login que
 * inventamos a partir do e-mail — e ele precisa passar pela MESMA validação
 * que o cadastro comum, senão nasce uma conta que o app recusaria.
 */

test('o login sai do começo do e-mail', () => {
  assert.equal(candidatosDeLogin('maria.souza@gmail.com')[0], 'maria.souza');
});

test('maiúscula vira minúscula, como no cadastro comum', () => {
  assert.equal(candidatosDeLogin('Maria.Souza@Gmail.com')[0], 'maria.souza');
});

test('caractere fora do formato vira ponto, e não some', () => {
  // `mariafinancas` não se parece com quem se cadastrou; `maria.financas` sim.
  assert.equal(candidatosDeLogin('maria+financas@gmail.com')[0], 'maria.financas');
});

test('acento vira ponto — o formato do login não aceita acento', () => {
  assert.equal(candidatosDeLogin('joão@gmail.com')[0], 'jo.o');
});

test('pontuação sobrando nas pontas e repetida no meio é limpa', () => {
  assert.equal(candidatosDeLogin('_maria__souza_@gmail.com')[0], 'maria.souza');
});

test('e-mail curto demais cai num login genérico em vez de um inválido', () => {
  assert.equal(candidatosDeLogin('ab@gmail.com')[0], 'usuario');
});

test('e-mail só de símbolos também cai no genérico', () => {
  assert.equal(candidatosDeLogin('+++@gmail.com')[0], 'usuario');
});

test('e-mail comprido é cortado no limite do login', () => {
  assert.equal(candidatosDeLogin(`${'a'.repeat(40)}@gmail.com`)[0]?.length, 20);
});

test('todo candidato passa na validação do cadastro comum', () => {
  const emails = [
    'maria.souza@gmail.com',
    'Maria+Financas@gmail.com',
    'joão@gmail.com',
    'ab@gmail.com',
    '+++@gmail.com',
    `${'a'.repeat(40)}@gmail.com`,
  ];

  for (const email of emails) {
    for (const candidato of candidatosDeLogin(email)) {
      assert.equal(validarNomeDeUsuario(candidato), candidato, `recusado: ${candidato}`);
    }
  }
});

test('os candidatos são todos diferentes entre si', () => {
  const candidatos = candidatosDeLogin('maria.souza@gmail.com');
  assert.equal(new Set(candidatos).size, candidatos.length);
});
