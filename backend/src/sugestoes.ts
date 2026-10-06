/**
 * A memória dos campos de texto livre: categoria, forma de pagamento, pessoa.
 *
 * O app não traz lista pronta. Ela nasce vazia e cresce conforme a pessoa
 * lança — porque as categorias de cada um são outras, e uma lista de fábrica
 * só enche o campo de opções que ninguém escolheu.
 *
 * Quem alimenta são as próprias rotas de criar: lançou um gasto em "Padaria",
 * "Padaria" passa a ser oferecido. Não há botão de "salvar sugestão", e é de
 * propósito — guardar seria mais um passo para fazer a mesma coisa.
 */
import { prisma } from './prisma.ts';
import { CampoComSugestao } from './generated/prisma/enums.ts';

export { CampoComSugestao };

/**
 * Guarda o valor, se ele ainda não estiver na lista.
 *
 * A comparação ignora maiúsculas: quem digitou "Mercado" uma vez e "mercado"
 * na outra tem UMA opção na lista, não duas quase iguais. Fica valendo a
 * primeira grafia — mudar para a última faria a lista dançar sob os olhos de
 * quem só quis lançar uma despesa.
 *
 * Nunca estoura: alimentar a lista é um efeito colateral simpático de criar um
 * lançamento, e não pode derrubar a criação se der errado. No pior caso a
 * opção não é memorizada, e a pessoa digita de novo na próxima.
 */
export async function registrarSugestao(
  usuarioId: number,
  campo: CampoComSugestao,
  valor: string | null | undefined
): Promise<void> {
  const limpo = typeof valor === 'string' ? valor.trim() : '';

  if (!limpo) return;

  try {
    const jaExiste = await prisma.sugestao.findFirst({
      where: { usuarioId, campo, valor: { equals: limpo, mode: 'insensitive' } },
      select: { id: true },
    });

    if (jaExiste) return;

    await prisma.sugestao.create({ data: { usuarioId, campo, valor: limpo } });
  } catch (erro) {
    // Inclui a corrida entre dois lançamentos simultâneos com a mesma opção:
    // o índice único barra o segundo, e barrar é exatamente o certo.
    console.error('Não consegui memorizar a sugestão:', erro);
  }
}

/** As listas de um usuário, prontas para a tela. */
export async function listarSugestoes(usuarioId: number) {
  const linhas = await prisma.sugestao.findMany({
    where: { usuarioId },
    select: { id: true, campo: true, valor: true },
  });

  const vazio: Record<CampoComSugestao, { id: number; valor: string }[]> = {
    CATEGORIA: [],
    FORMA_DE_PAGAMENTO: [],
    PESSOA: [],
  };

  for (const linha of linhas) {
    vazio[linha.campo].push({ id: linha.id, valor: linha.valor });
  }

  // Em ordem alfabética, e não por uso: a lista é curta e sempre visível, e
  // uma ordem que muda sozinha faz a pessoa procurar duas vezes o mesmo item.
  for (const campo of Object.keys(vazio) as CampoComSugestao[]) {
    vazio[campo].sort((a, b) => a.valor.localeCompare(b.valor, 'pt-BR'));
  }

  return vazio;
}
