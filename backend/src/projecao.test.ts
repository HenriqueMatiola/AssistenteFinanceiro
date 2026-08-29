/**
 * Testes do motor de projeção.
 *
 * Rode com:  npm test
 *
 * Nenhum destes testes precisa de banco, de servidor ou de internet — é
 * exatamente por isso que o motor foi escrito separado das rotas. Um teste que
 * depende do Docker estar de pé é um teste que ninguém roda.
 *
 * Usamos o `node:test`, que já vem dentro do Node — sem Jest, sem Vitest, sem
 * dependência nova para manter.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  dataPrevista,
  projetar,
  proximoMes,
  sequenciaDeMeses,
  type LancamentosDoMes,
} from './projecao.ts';

/** Atalho: a maioria dos testes não tem lançamento futuro nenhum. */
const SEM_LANCAMENTOS = new Map<string, LancamentosDoMes>();

describe('projetar', () => {
  // Este é o cenário que o plano da Etapa 4 pede por escrito.
  it('soma uma recorrência com um lançamento pontual futuro', () => {
    const meses = ['2026-09', '2026-10'];

    const recorrencias = [
      { valor: 3000, tipo: 'GANHO' as const }, // salário
      { valor: 1200, tipo: 'GASTO' as const }, // aluguel
    ];

    // Uma parcela de compra já lançada, com data de outubro.
    const lancamentos = new Map<string, LancamentosDoMes>([
      ['2026-10', { entradas: 0, saidas: 500 }],
    ]);

    const [setembro, outubro] = projetar(meses, recorrencias, lancamentos);

    // Setembro só tem as recorrências: 3000 − 1200.
    assert.equal(setembro?.entradas, 3000);
    assert.equal(setembro?.saidas, 1200);
    assert.equal(setembro?.saldo, 1800);

    // Outubro tem as recorrências MAIS a parcela: 3000 − (1200 + 500).
    assert.equal(outubro?.entradas, 3000);
    assert.equal(outubro?.saidas, 1700);
    assert.equal(outubro?.saldo, 1300);
  });

  it('repete a recorrência em todos os meses pedidos', () => {
    const meses = sequenciaDeMeses('2026-09', 6);
    const projecao = projetar(meses, [{ valor: 100, tipo: 'GASTO' }], SEM_LANCAMENTOS);

    assert.equal(projecao.length, 6);
    // A recorrência não "acaba": ela pesa igual do primeiro ao último mês.
    assert.ok(projecao.every((mes) => mes.saldo === -100));
  });

  it('acumula o saldo mês a mês', () => {
    const projecao = projetar(
      ['2026-09', '2026-10', '2026-11'],
      [{ valor: 250, tipo: 'GANHO' }],
      SEM_LANCAMENTOS
    );

    // O saldo do mês é sempre o mesmo; o acumulado é que cresce.
    assert.deepEqual(
      projecao.map((mes) => mes.saldoAcumulado),
      [250, 500, 750]
    );
  });

  it('separa o que veio de recorrência do que veio de lançamento', () => {
    const lancamentos = new Map<string, LancamentosDoMes>([
      ['2026-09', { entradas: 700, saidas: 500 }],
    ]);

    const [setembro] = projetar(['2026-09'], [{ valor: 1200, tipo: 'GASTO' }], lancamentos);

    assert.deepEqual(setembro?.deRecorrencias, { entradas: 0, saidas: 1200 });
    assert.deepEqual(setembro?.deLancamentos, { entradas: 700, saidas: 500 });
  });

  it('devolve zeros quando não há recorrência nem lançamento', () => {
    const [mes] = projetar(['2026-09'], [], SEM_LANCAMENTOS);

    assert.equal(mes?.entradas, 0);
    assert.equal(mes?.saidas, 0);
    assert.equal(mes?.saldo, 0);
  });

  it('não deixa o ponto flutuante estragar os centavos', () => {
    // Somados como `number`, 0.1 + 0.2 dariam 0.30000000000000004.
    // O motor soma em centavos inteiros justamente para isso não acontecer.
    const [mes] = projetar(
      ['2026-09'],
      [
        { valor: 0.1, tipo: 'GASTO' },
        { valor: 0.2, tipo: 'GASTO' },
      ],
      SEM_LANCAMENTOS
    );

    assert.equal(mes?.saidas, 0.3);
    assert.equal(mes?.saldo, -0.3);
  });

  it('projeta 12 meses de conta quebrada sem acumular erro', () => {
    const meses = sequenciaDeMeses('2026-09', 12);
    const projecao = projetar(meses, [{ valor: 99.99, tipo: 'GASTO' }], SEM_LANCAMENTOS);

    // 99,99 × 12 = 1199,88 — exato, sem sobra de centavo.
    assert.equal(projecao.at(-1)?.saldoAcumulado, -1199.88);
  });
});

describe('sequenciaDeMeses', () => {
  it('inclui o mês inicial e vira o ano', () => {
    assert.deepEqual(sequenciaDeMeses('2026-11', 4), ['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('proximoMes', () => {
  it('vira o ano em dezembro', () => {
    assert.equal(proximoMes('2026-12'), '2027-01');
  });

  it('anda um mês dentro do mesmo ano', () => {
    assert.equal(proximoMes('2026-09'), '2026-10');
  });
});

describe('dataPrevista', () => {
  it('usa o dia escolhido quando o mês tem esse dia', () => {
    assert.equal(dataPrevista('2026-09', 5), '2026-09-05');
  });

  it('encolhe para o último dia num mês mais curto', () => {
    // Setembro tem 30 dias: a conta do dia 31 vence no dia 30.
    assert.equal(dataPrevista('2026-09', 31), '2026-09-30');
    // Fevereiro de ano não bissexto.
    assert.equal(dataPrevista('2027-02', 31), '2027-02-28');
    // 2028 é bissexto: aí cabe o dia 29.
    assert.equal(dataPrevista('2028-02', 31), '2028-02-29');
  });
});
