/**
 * Transforma operações (compras e vendas) na posição atual de cada ativo.
 *
 * Como os outros motores do app, não conhece banco nem HTTP: recebe uma lista
 * e devolve outra. É o que permite testar a regra do preço médio — que é a
 * parte fácil de errar — sem subir nada.
 *
 * ## O método do preço médio
 *
 * É como o Brasil calcula custo de ativo, e a regra é esta:
 *
 * - **Comprar** soma quantidade e custo, e a média se recalcula sozinha.
 * - **Vender** tira a quantidade vendida e o custo proporcional a ela, mas
 *   NÃO mexe no preço médio. Vender metade da posição não torna a outra
 *   metade mais cara nem mais barata — ela custou o que custou.
 * - O lucro da venda (chamado "realizado") é o que se recebeu menos o custo
 *   médio do que saiu. Esse dinheiro já está no bolso; é diferente do lucro
 *   "no papel" de quem ainda segura o ativo.
 */
import type { ClasseDeAtivo, TipoDeOperacao } from './generated/prisma/enums.ts';

/** Duas casas, como se fala de dinheiro. */
function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Oito casas: quantidade de cripto é fracionária. */
function arredondarQuantidade(valor: number): number {
  return Math.round(valor * 1e8) / 1e8;
}

export interface OperacaoParaConsolidar {
  ativo: string;
  classe: ClasseDeAtivo;
  tipo: TipoDeOperacao;
  /** "AAAA-MM-DD" — usado só para colocar as operações em ordem. */
  data: string;
  quantidade: number;
  /** O que saiu do bolso (compra) ou entrou nele (venda). */
  valor: number;
}

export interface PosicaoConsolidada {
  ativo: string;
  classe: ClasseDeAtivo;
  /** O que ainda está em carteira. Zero quando tudo foi vendido. */
  quantidade: number;
  /** Quanto custou a quantidade que resta. */
  custoTotal: number;
  /** Custo por unidade do que resta. Zero em posição zerada. */
  precoMedio: number;
  /** Resultado das vendas já feitas — dinheiro que já entrou. */
  lucroRealizado: number;
  /** Quanto já saiu da carteira, somando todas as vendas. */
  quantidadeVendida: number;
}

/**
 * Consolida as operações em uma posição por ativo.
 *
 * Posições zeradas (tudo vendido) continuam na lista: o lucro realizado delas
 * é história que interessa, e sumir com o ativo esconderia o resultado.
 */
export function consolidarPorAtivo(
  operacoes: OperacaoParaConsolidar[]
): PosicaoConsolidada[] {
  // A ordem importa: o preço médio na hora de uma venda depende das compras
  // que vieram ANTES dela.
  const ordenadas = [...operacoes].sort((a, b) => a.data.localeCompare(b.data));

  const porAtivo = new Map<string, PosicaoConsolidada>();

  for (const op of ordenadas) {
    const atual = porAtivo.get(op.ativo) ?? {
      ativo: op.ativo,
      classe: op.classe,
      quantidade: 0,
      custoTotal: 0,
      precoMedio: 0,
      lucroRealizado: 0,
      quantidadeVendida: 0,
    };

    // A classe da operação mais recente prevalece: é a reclassificação mais
    // provável de estar certa.
    atual.classe = op.classe;

    if (op.tipo === 'COMPRA') {
      atual.quantidade += op.quantidade;
      atual.custoTotal += op.valor;
    } else {
      const precoMedio = atual.quantidade === 0 ? 0 : atual.custoTotal / atual.quantidade;

      // Vender mais do que se tem não deveria acontecer (a rota recusa), mas
      // se acontecer é melhor zerar a posição do que deixá-la negativa.
      const vendida = Math.min(op.quantidade, atual.quantidade);
      const custoDaVenda = vendida * precoMedio;

      atual.lucroRealizado += op.valor - custoDaVenda;
      atual.custoTotal -= custoDaVenda;
      atual.quantidade -= vendida;
      atual.quantidadeVendida += vendida;
    }

    porAtivo.set(op.ativo, atual);
  }

  return [...porAtivo.values()].map((p) => {
    const quantidade = arredondarQuantidade(p.quantidade);
    const custoTotal = arredondarCentavos(p.custoTotal);

    return {
      ...p,
      quantidade,
      custoTotal,
      precoMedio: quantidade === 0 ? 0 : arredondarCentavos(custoTotal / quantidade),
      lucroRealizado: arredondarCentavos(p.lucroRealizado),
      quantidadeVendida: arredondarQuantidade(p.quantidadeVendida),
    };
  });
}

// --- Resumo por classe ------------------------------------------------------

export interface ResumoDeClasse {
  classe: ClasseDeAtivo;
  /** Custo do que ainda está em carteira. */
  investido: number;
  /** Quanto vale hoje. Só das posições que têm cotação. */
  valorAtual: number;
  /** Valor atual menos investido. */
  lucro: number;
  /** O lucro como fração do investido (0.15 = +15%). */
  variacao: number | null;
  /** Quantos ativos diferentes há na classe. */
  ativos: number;
}

/**
 * Agrupa as posições por tipo de ativo — quanto há em ações, em FIIs, em
 * cripto — com o investido ao lado do valor de hoje.
 *
 * Posições zeradas ficam de fora: não há o que somar numa carteira que não
 * tem mais o ativo.
 */
export function resumirPorClasse(
  posicoes: { classe: ClasseDeAtivo; quantidade: number; custoTotal: number; valorAtual: number | null }[]
): ResumoDeClasse[] {
  const porClasse = new Map<ClasseDeAtivo, ResumoDeClasse>();

  for (const p of posicoes) {
    if (p.quantidade === 0) continue;

    const atual = porClasse.get(p.classe) ?? {
      classe: p.classe,
      investido: 0,
      valorAtual: 0,
      lucro: 0,
      variacao: null,
      ativos: 0,
    };

    atual.investido += p.custoTotal;
    atual.ativos += 1;

    // Sem cotação, o ativo entra no investido mas não no valor atual — o que
    // faria a classe parecer em prejuízo. Então ele fica fora dos dois.
    if (p.valorAtual !== null) {
      atual.valorAtual += p.valorAtual;
    } else {
      atual.investido -= p.custoTotal;
      atual.ativos -= 1;
    }

    porClasse.set(p.classe, atual);
  }

  return [...porClasse.values()]
    .filter((c) => c.ativos > 0)
    .map((c) => {
      const investido = arredondarCentavos(c.investido);
      const valorAtual = arredondarCentavos(c.valorAtual);
      const lucro = arredondarCentavos(valorAtual - investido);

      return {
        ...c,
        investido,
        valorAtual,
        lucro,
        variacao: investido === 0 ? null : lucro / investido,
      };
    })
    // Maior posição primeiro: é a que decide a carteira.
    .sort((a, b) => b.valorAtual - a.valorAtual);
}
