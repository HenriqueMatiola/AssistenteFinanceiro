/**
 * A conta da aba "A receber e a pagar".
 *
 * Um acerto é dinheiro que mudou de lugar entre você e alguém — emprestado,
 * adiantado, rateado — e que ainda vai voltar. Ele nasce com um valor e vai
 * sendo abatido por BAIXAS: "paguei 50 ao João em 03/09".
 *
 * Como os outros motores do app, este não conhece banco nem HTTP: recebe
 * números e devolve números. É o que permite testar a parte fácil de errar —
 * somar dinheiro — sem subir nada.
 *
 * ## Por que centavos inteiros
 *
 * Em JavaScript, `0.1 + 0.2` dá 0.30000000000000004: `number` é binário e não
 * representa centavos exatamente. Somar dez baixas de R$ 33,33 em reais deixa
 * sujeira que aparece na tela como "R$ 0,00000001 restante" num acerto que
 * está quitado. Em centavos inteiros a conta é exata, e a volta para reais
 * acontece uma vez só, no fim.
 */
import type { TipoDeAcerto } from './generated/prisma/enums.ts';

function paraCentavos(reais: number): number {
  return Math.round(reais * 100);
}

function paraReais(centavos: number): number {
  return centavos / 100;
}

/** Um acerto já resolvido: quanto andou, quanto falta, e se acabou. */
export interface AcertoConsolidado {
  /** Soma de tudo que já foi pago ou recebido neste acerto. */
  pago: number;
  /** Quanto ainda falta. Nunca negativo — ver `cabeNoSaldo`. */
  saldo: number;
  /** Se não falta mais nada. */
  quitado: boolean;
}

/**
 * Desconta as baixas do valor original.
 *
 * O valor original nunca muda de lugar: o que se sabe a qualquer momento é
 * "quanto era" menos "quanto já andou". Guardar um saldo à parte no banco
 * criaria dois números para manter em dia, e um dia eles discordariam.
 */
export function consolidarAcerto(valor: number, baixas: number[]): AcertoConsolidado {
  const totalCentavos = paraCentavos(valor);
  const pagoCentavos = baixas.reduce((soma, baixa) => soma + paraCentavos(baixa), 0);

  // O `max` não é para corrigir conta errada: `cabeNoSaldo` impede que uma
  // baixa passe do saldo, e reduzir o valor de um acerto abaixo do que já foi
  // pago também é recusado. Ele está aqui para que um dado estranho vindo do
  // banco (mexido à mão, por exemplo) vire "quitado" em vez de um saldo
  // negativo, que não quer dizer nada nesta tela.
  const saldoCentavos = Math.max(0, totalCentavos - pagoCentavos);

  return {
    pago: paraReais(pagoCentavos),
    saldo: paraReais(saldoCentavos),
    quitado: saldoCentavos === 0,
  };
}

/**
 * Se uma baixa deste tamanho cabe no que ainda falta.
 *
 * Existe para a comparação acontecer em centavos: em reais, um saldo de 0,30
 * recusaria uma baixa de 0,30 formada por 0,1 + 0,2. Também recusa zero e
 * negativo — "recebi R$ 0,00" não é um fato que valha uma linha no histórico.
 */
export function cabeNoSaldo(valorDaBaixa: number, saldo: number): boolean {
  const baixa = paraCentavos(valorDaBaixa);
  return baixa > 0 && baixa <= paraCentavos(saldo);
}

/** O que o topo da aba precisa saber de cada acerto para somar. */
export interface AcertoParaSomar {
  tipo: TipoDeAcerto;
  valor: number;
  baixas: number[];
}

/** Os três números fixados no topo da aba. */
export interface TotaisEmAberto {
  /** Quanto os outros ainda te devem. */
  aReceber: number;
  /** Quanto você ainda deve. */
  aPagar: number;
  /**
   * `aReceber − aPagar`. Positivo quer dizer que, no fim das contas, sobra
   * dinheiro para você. É o número que responde "no saldo, estou credor ou
   * devedor?" sem obrigar ninguém a fazer a subtração de cabeça.
   */
  liquido: number;
}

/**
 * Soma os SALDOS, e não os valores originais: um acerto já quitado não é mais
 * dinheiro a receber nem a pagar. Ele continua na lista, como histórico, mas
 * some dos totais no instante em que a última baixa entra.
 */
export function totaisEmAberto(acertos: AcertoParaSomar[]): TotaisEmAberto {
  let receberCentavos = 0;
  let pagarCentavos = 0;

  for (const acerto of acertos) {
    const { saldo } = consolidarAcerto(acerto.valor, acerto.baixas);
    const centavos = paraCentavos(saldo);

    if (acerto.tipo === 'RECEBER') {
      receberCentavos += centavos;
    } else {
      pagarCentavos += centavos;
    }
  }

  return {
    aReceber: paraReais(receberCentavos),
    aPagar: paraReais(pagarCentavos),
    liquido: paraReais(receberCentavos - pagarCentavos),
  };
}
