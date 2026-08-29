/**
 * Contas de uma posição em ativos: preço médio, valor atual, lucro e variação.
 *
 * Como o motor de projeção, este arquivo não conhece banco, HTTP nem a API de
 * cotação — recebe números e devolve números. É o que permite testar a conta
 * sem depender de o mercado estar aberto ou de a internet estar de pé.
 */

/** Duas casas, como se fala de dinheiro. */
function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export interface Posicao {
  /** Quanto se tem do ativo. Fracionário para cripto. */
  quantidade: number;
  /** O total desembolsado na compra, taxas incluídas. */
  valorPago: number;
}

export interface PosicaoCalculada {
  /**
   * Quanto custou cada unidade, em média — o valor pago dividido pela
   * quantidade. É o número que se compara com a cotação da tela do corretor.
   */
  precoMedio: number;

  /**
   * Quanto a posição vale agora. `null` quando a cotação não veio: sem preço
   * não há valor atual, e inventar um zero diria que o ativo virou pó.
   */
  valorAtual: number | null;

  /** Valor atual menos o valor pago. Negativo é prejuízo. `null` sem cotação. */
  lucro: number | null;

  /**
   * O lucro como fração do que foi pago (0.15 = +15%).
   * `null` sem cotação — e também quando nada foi pago, porque dividir por
   * zero não produz percentual nenhum.
   */
  variacao: number | null;
}

/**
 * @param posicao  Quantidade e valor pago.
 * @param cotacao  Preço atual de UMA unidade, ou null se a fonte não respondeu.
 */
export function calcularPosicao(posicao: Posicao, cotacao: number | null): PosicaoCalculada {
  const { quantidade, valorPago } = posicao;

  // Quantidade zero não é uma posição — evita divisão por zero no preço médio.
  const precoMedio = quantidade === 0 ? 0 : arredondarCentavos(valorPago / quantidade);

  if (cotacao === null) {
    return { precoMedio, valorAtual: null, lucro: null, variacao: null };
  }

  const valorAtual = arredondarCentavos(cotacao * quantidade);
  const lucro = arredondarCentavos(valorAtual - valorPago);

  return {
    precoMedio,
    valorAtual,
    lucro,
    // Sem nada pago não há percentual: qualquer lucro seria "infinito".
    variacao: valorPago === 0 ? null : lucro / valorPago,
  };
}

/** Soma de várias posições, para o total da carteira. */
export interface TotalDaCarteira {
  valorPago: number;
  /** Só das posições que têm cotação. */
  valorAtual: number;
  lucro: number;
  variacao: number | null;
  /** Quantas posições ficaram sem cotação — o total não as inclui. */
  semCotacao: number;
}

export function somarCarteira(
  posicoes: { valorPago: number; valorAtual: number | null }[]
): TotalDaCarteira {
  let valorPago = 0;
  let valorAtual = 0;
  let semCotacao = 0;

  for (const p of posicoes) {
    if (p.valorAtual === null) {
      // Uma posição sem cotação fica fora dos DOIS lados da conta. Somar o
      // valor pago dela sem o valor atual correspondente inventaria um
      // prejuízo do tamanho da posição.
      semCotacao += 1;
      continue;
    }
    valorPago += p.valorPago;
    valorAtual += p.valorAtual;
  }

  const lucro = arredondarCentavos(valorAtual - valorPago);

  return {
    valorPago: arredondarCentavos(valorPago),
    valorAtual: arredondarCentavos(valorAtual),
    lucro,
    variacao: valorPago === 0 ? null : lucro / valorPago,
    semCotacao,
  };
}
