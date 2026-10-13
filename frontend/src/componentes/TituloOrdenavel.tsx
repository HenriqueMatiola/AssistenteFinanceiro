import { CaretDown, CaretUp, CaretUpDown } from '@phosphor-icons/react';

/*
 * Ordenação de tabela pelo título da coluna, compartilhada por Lançamentos e
 * Recorrências. Cada tela diz quais são as suas colunas (o tipo `C`) e como
 * ler o valor de cada uma; o resto — o ciclo dos cliques, a comparação, o
 * desenho do título — é igual em todas.
 */

export type SentidoDaOrdenacao = 'crescente' | 'decrescente';

/**
 * `null` é a ordem que a tela já tinha antes de qualquer clique. O clique no
 * título percorre crescente → decrescente → `null`.
 */
export type Ordenacao<C extends string> = { coluna: C; sentido: SentidoDaOrdenacao } | null;

/** Coluna nova começa crescente; a mesma coluna vira decrescente e depois sai. */
export function proximaOrdenacao<C extends string>(atual: Ordenacao<C>, coluna: C): Ordenacao<C> {
  if (atual?.coluna !== coluna) return { coluna, sentido: 'crescente' };
  if (atual.sentido === 'crescente') return { coluna, sentido: 'decrescente' };
  return null;
}

/**
 * Devolve uma cópia ordenada; com `ordenacao` nula, devolve a própria lista.
 *
 * - Número compara como número; o resto como texto em português, ignorando
 *   maiúscula e acento ("Água" fica no A).
 * - Vazio (nulo ou "") vai para o FIM nos dois sentidos — linhas com "—" no
 *   topo só atrapalhariam quem procura um valor.
 * - O `sort` do JavaScript é estável: no empate, as linhas mantêm a ordem que
 *   a lista já tinha. Por isso a ordem de chegada serve de desempate.
 */
export function ordenarPor<T, C extends string>(
  itens: T[],
  ordenacao: Ordenacao<C>,
  valorDaColuna: (item: T, coluna: C) => string | number | null
): T[] {
  if (!ordenacao) return itens;

  const { coluna, sentido } = ordenacao;
  const fator = sentido === 'crescente' ? 1 : -1;
  const vazio = (v: string | number | null) => v === null || v === '';

  return [...itens].sort((a, b) => {
    const va = valorDaColuna(a, coluna);
    const vb = valorDaColuna(b, coluna);

    if (vazio(va) || vazio(vb)) return Number(vazio(va)) - Number(vazio(vb));

    const comparacao =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });

    return comparacao * fator;
  });
}

interface Props<C extends string> {
  coluna: C;
  rotulo: string;
  ordenacao: Ordenacao<C>;
  aoClicar: (coluna: C) => void;
  alinhadoDireita?: boolean;
}

/**
 * Título de coluna que ordena a tabela. O clique fica num `<button>` dentro do
 * `<th>`, e não no `<th>` em si, para funcionar também pelo teclado (Tab +
 * Enter). `aria-sort` é o que conta ao leitor de tela qual coluna manda.
 */
function TituloOrdenavel<C extends string>({
  coluna,
  rotulo,
  ordenacao,
  aoClicar,
  alinhadoDireita,
}: Props<C>) {
  const sentido = ordenacao?.coluna === coluna ? ordenacao.sentido : null;

  return (
    <th
      className={alinhadoDireita ? 'alinhado-direita' : undefined}
      aria-sort={
        sentido === 'crescente' ? 'ascending' : sentido === 'decrescente' ? 'descending' : undefined
      }
    >
      <button
        type="button"
        className={sentido ? 'titulo-ordenavel titulo-ordenavel--ativo' : 'titulo-ordenavel'}
        onClick={() => aoClicar(coluna)}
      >
        {rotulo}
        {sentido === 'crescente' ? (
          <CaretUp weight="bold" aria-hidden="true" />
        ) : sentido === 'decrescente' ? (
          <CaretDown weight="bold" aria-hidden="true" />
        ) : (
          <CaretUpDown weight="bold" aria-hidden="true" className="titulo-ordenavel__neutro" />
        )}
      </button>
    </th>
  );
}

export default TituloOrdenavel;
