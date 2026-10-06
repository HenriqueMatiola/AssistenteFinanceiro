import test from 'node:test';
import assert from 'node:assert/strict';
import { dataEfetiva, dentroDoMes, antesDoMes, maisRecentePrimeiro } from './mesDoLancamento.ts';
import { intervaloDoMes } from './validacao.ts';

const COMPRA = new Date('2026-10-05T00:00:00.000Z');
const PAGAMENTO = new Date('2026-11-10T00:00:00.000Z');

// --- Qual data manda --------------------------------------------------------

test('sem vencimento, quem manda é a data do lançamento', () => {
  assert.equal(dataEfetiva({ data: COMPRA, vencimento: null }).toISOString(), COMPRA.toISOString());
});

test('com vencimento, quem manda é o vencimento', () => {
  // O caso que motivou o campo: comprei em outubro, pago em novembro, e o
  // dinheiro só sai do bolso em novembro.
  assert.equal(
    dataEfetiva({ data: COMPRA, vencimento: PAGAMENTO }).toISOString(),
    PAGAMENTO.toISOString()
  );
});

// --- Os filtros -------------------------------------------------------------
//
// Testam a FORMA do objeto que vai para o Prisma. É um teste humilde, mas pega
// a regressão que mais machucaria aqui: trocar `lt` por `lte`, ou esquecer o
// ramo do vencimento nulo e fazer sumir do balanço tudo que não tem vencimento.

test('o filtro do mês cobre os dois casos, e só eles', () => {
  const intervalo = intervaloDoMes('2026-11');
  const { OR } = dentroDoMes(intervalo);

  assert.equal(OR.length, 2);
  assert.deepEqual(OR[0], { vencimento: null, data: intervalo });
  assert.deepEqual(OR[1], { vencimento: intervalo });
});

test('o filtro de meses anteriores usa `lt` sobre o começo do mês', () => {
  const intervalo = intervaloDoMes('2026-11');
  const { OR } = antesDoMes(intervalo);

  assert.deepEqual(OR[0], { vencimento: null, data: { lt: intervalo.gte } });
  assert.deepEqual(OR[1], { vencimento: { lt: intervalo.gte } });
});

test('os dois ramos do filtro são excludentes', () => {
  // Um lançamento ou tem vencimento ou não tem, então nenhuma linha entra pelas
  // duas portas e nada é contado em dobro.
  const [semVencimento, comVencimento] = dentroDoMes(intervaloDoMes('2026-11')).OR;

  assert.equal(semVencimento?.vencimento, null);
  assert.notEqual(comVencimento?.vencimento, null);
});

// --- Ordenação --------------------------------------------------------------

test('ordena pela data que manda, misturando os dois tipos', () => {
  const lista = [
    { id: 1, data: new Date('2026-11-20T00:00:00Z'), vencimento: null },
    { id: 2, data: new Date('2026-10-05T00:00:00Z'), vencimento: new Date('2026-11-25T00:00:00Z') },
    { id: 3, data: new Date('2026-11-02T00:00:00Z'), vencimento: null },
  ];

  // O #2 vem primeiro mesmo sendo a compra mais antiga: ele VENCE depois.
  assert.deepEqual(maisRecentePrimeiro(lista).map((l) => l.id), [2, 1, 3]);
});

test('no mesmo dia, o lançado por último aparece em cima', () => {
  const mesmoDia = new Date('2026-11-10T00:00:00Z');
  const lista = [
    { id: 7, data: mesmoDia, vencimento: null },
    { id: 9, data: mesmoDia, vencimento: null },
  ];

  assert.deepEqual(maisRecentePrimeiro(lista).map((l) => l.id), [9, 7]);
});

test('ordenar não mexe na lista original', () => {
  const lista = [
    { id: 1, data: new Date('2026-10-01T00:00:00Z'), vencimento: null },
    { id: 2, data: new Date('2026-11-01T00:00:00Z'), vencimento: null },
  ];

  maisRecentePrimeiro(lista);
  assert.deepEqual(lista.map((l) => l.id), [1, 2]);
});
