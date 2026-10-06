/**
 * Transforma uma lista de valores nas fatias de uma rosca do Dashboard.
 *
 * Serve aos dois gráficos da tela — gastos por categoria e por forma de
 * pagamento —, que têm a mesma forma de pergunta: "quanto cada um pesa no
 * total do mês?". As regras aqui existem para o gráfico continuar legível
 * quando os dados crescem.
 */

/**
 * Acima disto as fatias vizinhas borram uma na outra e a rosca vira confete.
 * Os itens que sobram viram uma fatia só — perder o detalhe dos menores custa
 * menos que perder a leitura do todo.
 */
const MAXIMO_DE_FATIAS = 6;

/** Quantas cores de série existem em `index.css`. */
const CORES_DISPONIVEIS = 6;

/** O que entra: um rótulo, um valor, e o que dele ainda não aconteceu. */
export interface ItemParaFatiar {
  rotulo: string;
  valor: number;
  /**
   * Quanto deste valor ainda está pendente. Hoje só as formas de pagamento
   * usam: é o que falta fechar da fatura. Ausente quer dizer "não se aplica",
   * e é diferente de zero, que quer dizer "está tudo pago".
   */
  pendente?: number;
}

export interface FatiaDoGrafico {
  /** O que aparece no rótulo: o nome, ou "Outras (3)". */
  rotulo: string;
  valor: number;
  /** Fração do total, de 0 a 1. Quem arredonda para exibir é a tela. */
  fracao: number;
  /**
   * Qual `--serie-N` pintar, de 1 a 6. É `null` no agrupado, que usa cinza:
   * ele não é um item disputando identidade com os outros, é um resto.
   */
  cor: number | null;
  /** A soma dos pendentes. Zero quando não há, ou quando não se aplica. */
  pendente: number;
}

/**
 * Um número estável a partir do rótulo.
 *
 * É o que faz "Moradia" receber a mesma cor em janeiro e em agosto. A
 * alternativa óbvia — pintar pela posição no ranking — repintaria tudo a cada
 * mês em que um item passasse outro, e aí a cor deixaria de dizer "isto é
 * Moradia" para dizer apenas "isto é o maior", que o tamanho da fatia já diz
 * melhor.
 *
 * Multiplicar por 31 antes de somar é o embaralhamento clássico de hash de
 * texto: sem ele, "Lazer" e "Lerza" cairiam na mesma cor.
 */
function digitalDoRotulo(nome: string): number {
  let soma = 0;

  for (const letra of nome.toLowerCase()) {
    soma = (soma * 31 + letra.codePointAt(0)!) % 100_000;
  }

  return soma;
}

/**
 * Distribui as cores pelos rótulos, sem repetir dentro do mesmo gráfico.
 *
 * Cada rótulo tenta primeiro a cor do próprio nome; se ela já estiver tomada,
 * anda para a próxima livre. A varredura acontece em ordem ALFABÉTICA, e não
 * por valor, de propósito: assim o desempate não depende de quem gastou mais
 * neste mês, e a cor de cada item para de balançar.
 */
function distribuirCores(rotulos: string[], quantidadeDeCores: number): Map<string, number> {
  const escolhidas = new Map<string, number>();
  const tomadas = new Set<number>();

  for (const rotulo of [...rotulos].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
    const preferida = digitalDoRotulo(rotulo) % quantidadeDeCores;

    let cor = preferida;
    while (tomadas.has(cor)) {
      cor = (cor + 1) % quantidadeDeCores;
    }

    tomadas.add(cor);
    // As variáveis do CSS começam em 1, e o resto da divisão em 0.
    escolhidas.set(rotulo, cor + 1);
  }

  return escolhidas;
}

/**
 * Monta as fatias a partir da lista já ordenada do maior para o menor, que é
 * como o backend devolve nos dois casos.
 *
 * Devolve lista vazia quando não há valor nenhum — inclusive quando há
 * lançamentos somando zero, caso em que dividir pelo total estouraria.
 */
export function montarFatias(itens: ItemParaFatiar[]): FatiaDoGrafico[] {
  const total = itens.reduce((soma, item) => soma + item.valor, 0);

  if (total <= 0) return [];

  const cabemInteiras = itens.length <= MAXIMO_DE_FATIAS;

  // Com agrupamento, uma das seis vagas é do resto: sobram cinco para os
  // itens de verdade.
  const quantosAparecem = cabemInteiras ? itens.length : MAXIMO_DE_FATIAS - 1;
  const aparecem = itens.slice(0, quantosAparecem);
  const agrupados = itens.slice(quantosAparecem);

  const cores = distribuirCores(
    aparecem.map((item) => item.rotulo),
    Math.min(CORES_DISPONIVEIS, Math.max(aparecem.length, 1))
  );

  const fatias: FatiaDoGrafico[] = aparecem.map((item) => ({
    rotulo: item.rotulo,
    valor: item.valor,
    fracao: item.valor / total,
    cor: cores.get(item.rotulo) ?? 1,
    pendente: item.pendente ?? 0,
  }));

  if (agrupados.length > 0) {
    const somaDoResto = agrupados.reduce((soma, item) => soma + item.valor, 0);

    fatias.push({
      // A contagem vai no rótulo porque "Outras" sozinho esconde se são duas
      // ou onze. E o plural evita confundir com a categoria "Outros", que o
      // próprio app sugere e pode estar entre as maiores.
      rotulo: `Outras (${agrupados.length})`,
      valor: somaDoResto,
      fracao: somaDoResto / total,
      cor: null,
      // O que falta pagar não some junto com o detalhe: as faturas pequenas
      // agrupadas continuam somando no aviso de pendente.
      pendente: agrupados.reduce((soma, item) => soma + (item.pendente ?? 0), 0),
    });
  }

  return fatias;
}
