/**
 * Rotas de lançamentos (transações).
 *
 * IMPORTANTE: este router é montado atrás do middleware `exigirLogin`, então
 * `req.usuarioId` sempre existe aqui. Toda consulta filtra por ele — é isso
 * que impede um usuário de ver os dados do outro.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { ClassificacaoGasto, StatusTransacao, TipoTransacao } from '../generated/prisma/enums.ts';
import {
  ErroDeValidacao,
  intervaloDoMes,
  validarCategoria,
  validarClassificacao,
  validarData,
  validarDescricao,
  validarFormaDePagamento,
  validarId,
  validarIds,
  validarParcelas,
  validarStatus,
  validarTipo,
  validarValor,
  validarVencimento,
} from '../validacao.ts';
import { responderErro } from '../respostas.ts';
import { datasDasParcelas } from '../parcelas.ts';
import { dentroDoMes, maisRecentePrimeiro } from '../mesDoLancamento.ts';
import { CampoComSugestao, registrarSugestao } from '../sugestoes.ts';

export const rotasDeTransacoes = Router();

/** Lançamento inexistente, ou de outro usuário: vira 404. */
class TransacaoNaoEncontrada extends Error {}

/**
 * Confere que o lançamento existe E pertence a quem está pedindo, devolvendo o
 * grupo de parcelas dele.
 *
 * Sem esta checagem, um `update` filtrando só pelo id deixaria uma pessoa
 * alterar o lançamento da outra apenas adivinhando o número. Responder 404 (e
 * não 403) para o lançamento alheio é de propósito: assim nem dá para
 * descobrir quais ids existem.
 */
async function exigirTransacaoDoUsuario(
  id: number,
  usuarioId: number
): Promise<{ grupoDeParcelas: string | null }> {
  const transacao = await prisma.transacao.findFirst({
    where: { id, usuarioId },
    select: { grupoDeParcelas: true },
  });

  if (!transacao) {
    throw new TransacaoNaoEncontrada();
  }

  return transacao;
}

// --- Formato de saída -------------------------------------------------------

interface TransacaoDoBanco {
  id: number;
  data: Date;
  vencimento: Date | null;
  descricao: string;
  valor: { toNumber(): number };
  categoria: string;
  tipo: TipoTransacao;
  status: StatusTransacao;
  formaDePagamento: string | null;
  classificacao: ClassificacaoGasto | null;
  parcelaAtual: number | null;
  parcelasTotais: number | null;
  grupoDeParcelas: string | null;
  ehSobraDoMesAnterior: boolean;
}

/**
 * Converte o formato do banco para o formato da API:
 * - `data` vira texto "AAAA-MM-DD" (sem hora, sem fuso)
 * - `valor` vira número (no banco é um objeto Decimal)
 */
function paraResposta(t: TransacaoDoBanco) {
  return {
    id: t.id,
    data: t.data.toISOString().slice(0, 10),
    vencimento: t.vencimento ? t.vencimento.toISOString().slice(0, 10) : null,
    descricao: t.descricao,
    valor: t.valor.toNumber(),
    categoria: t.categoria,
    tipo: t.tipo,
    status: t.status,
    formaDePagamento: t.formaDePagamento,
    classificacao: t.classificacao,
    parcelaAtual: t.parcelaAtual,
    parcelasTotais: t.parcelasTotais,
    grupoDeParcelas: t.grupoDeParcelas,
    ehSobraDoMesAnterior: t.ehSobraDoMesAnterior,
  };
}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/transacoes
 * Filtros opcionais: ?mes=2026-08  &tipo=GASTO  &status=PENDENTE
 */
rotasDeTransacoes.get('/', async (req, res) => {
  try {
    const filtro: {
      usuarioId: number;
      tipo?: TipoTransacao;
      status?: StatusTransacao;
      OR?: ReturnType<typeof dentroDoMes>['OR'];
    } = { usuarioId: idDoUsuarioLogado(req) };

    const { mes, tipo, status } = req.query;

    if (typeof tipo === 'string' && tipo !== '') {
      filtro.tipo = validarTipo(tipo);
    }

    if (typeof status === 'string' && status !== '') {
      filtro.status = validarStatus(status);
    }

    if (typeof mes === 'string' && mes !== '') {
      // O mês de um lançamento é o do VENCIMENTO quando ele existe: uma compra
      // de outubro paga em novembro aparece na lista de novembro, que é quando
      // o dinheiro sai. Sem vencimento, vale a data — e por isso tudo que foi
      // lançado antes deste campo existir continua no mês de sempre.
      filtro.OR = dentroDoMes(intervaloDoMes(mes)).OR;
    }

    const transacoes = await prisma.transacao.findMany({ where: filtro });

    // A ordenação sai do banco e vem para cá pelo mesmo motivo: ordenar por
    // "vencimento, ou a data quando ele for nulo" exigiria SQL escrito à mão.
    res.json({ transacoes: maisRecentePrimeiro(transacoes).map(paraResposta) });
  } catch (erro) {
    responderErro(res, erro, 'listar as transações');
  }
});

/**
 * POST /api/transacoes — cria um lançamento para o usuário logado.
 *
 * Com `parcelas: 12`, cria as 12 de uma vez, uma por mês. O `valor` informado
 * é o de CADA parcela (o número que cai na fatura), não o total da compra —
 * assim não sobra centavo de uma divisão que não fecha.
 *
 * Devolve sempre uma lista, mesmo quando é um lançamento só: quem chama não
 * precisa tratar dois formatos de resposta diferentes.
 */
rotasDeTransacoes.post('/', async (req, res) => {
  try {
    const corpo = req.body as Record<string, unknown>;

    const usuarioId = idDoUsuarioLogado(req);
    const dataInicial = validarData(corpo['data']);
    const vencimentoInicial = validarVencimento(corpo['vencimento'], dataInicial);
    const ehSobraDoMesAnterior = corpo['ehSobraDoMesAnterior'] === true;

    // Uma sobra do mês passado é um valor único, não uma compra a prazo.
    const quantidadeDeParcelas = ehSobraDoMesAnterior
      ? 1
      : validarParcelas(corpo['parcelas']);

    const statusPedido = corpo['status'] === undefined
      ? StatusTransacao.CONCLUIDA
      : validarStatus(corpo['status']);

    // Campos que todas as parcelas compartilham.
    const comuns = {
      // O dono vem SEMPRE do token, nunca do corpo da requisição — senão
      // qualquer um poderia lançar transações na conta de outra pessoa.
      usuarioId,
      descricao: validarDescricao(corpo['descricao']),
      valor: validarValor(corpo['valor']),
      categoria: validarCategoria(corpo['categoria']),
      tipo: validarTipo(corpo['tipo']),
      formaDePagamento: validarFormaDePagamento(corpo['formaDePagamento']),
      classificacao: validarClassificacao(corpo['classificacao']),
      ehSobraDoMesAnterior,
    };

    /*
     * A categoria e a forma digitadas passam a ser oferecidas da próxima vez.
     *
     * Acontece aqui, e não numa rota própria de "salvar sugestão": guardar
     * seria mais um passo para fazer o que lançar já diz. A sobra fica de
     * fora — a categoria dela é escolhida pelo app, não pela pessoa, e poluiria
     * a lista com um nome que ninguém digitou.
     */
    if (!ehSobraDoMesAnterior) {
      await registrarSugestao(usuarioId, CampoComSugestao.CATEGORIA, comuns.categoria);
      await registrarSugestao(
        usuarioId,
        CampoComSugestao.FORMA_DE_PAGAMENTO,
        comuns.formaDePagamento
      );
    }

    if (quantidadeDeParcelas === 1) {
      const transacao = await prisma.transacao.create({
        data: { ...comuns, data: dataInicial, vencimento: vencimentoInicial, status: statusPedido },
      });

      res.status(201).json({ transacoes: [paraResposta(transacao)] });
      return;
    }

    // Um id só, compartilhado, para depois dar para apagar a compra inteira
    // sem caçar parcela por parcela.
    const grupoDeParcelas = randomUUID();

    /*
     * O que anda de mês em mês é a data que MANDA no balanço.
     *
     * Com vencimento informado, quem anda é ele, e a data da compra fica a
     * mesma em todas as parcelas — a compra aconteceu num dia só, e é isso que
     * a tela passa a mostrar.
     *
     * Sem vencimento, quem anda é a própria data, como as parcelas sempre
     * funcionaram. Mexer nisso jogaria de mês tudo que já está lançado.
     */
    const datas = datasDasParcelas(vencimentoInicial ?? dataInicial, quantidadeDeParcelas);

    const parcelas = datas.map((dataDaParcela, indice) => ({
      ...comuns,
      data: vencimentoInicial ? dataInicial : dataDaParcela,
      vencimento: vencimentoInicial ? dataDaParcela : null,
      // Só a primeira parcela pode já estar paga; as outras ainda nem
      // venceram, então nascem pendentes independentemente do que foi pedido.
      status: indice === 0 ? statusPedido : StatusTransacao.PENDENTE,
      parcelaAtual: indice + 1,
      parcelasTotais: quantidadeDeParcelas,
      grupoDeParcelas,
    }));

    // createMany insere tudo numa ida só ao banco, mas não devolve as linhas
    // criadas — por isso a busca logo em seguida, pelo grupo.
    await prisma.transacao.createMany({ data: parcelas });

    const criadas = await prisma.transacao.findMany({
      where: { grupoDeParcelas, usuarioId },
      // Pela ordem das parcelas: com vencimento, a data é a mesma em todas.
      orderBy: { parcelaAtual: 'asc' },
    });

    res.status(201).json({ transacoes: criadas.map(paraResposta) });
  } catch (erro) {
    responderErro(res, erro, 'criar a transação');
  }
});

/**
 * PATCH /api/transacoes  { "ids": [1, 2, 3], "status": "CONCLUIDA" }
 * Marca vários como pagos (ou reabre vários) de uma vez.
 *
 * Um `updateMany` só, e não um laço de PATCH por id: é uma ida ao banco, e ou
 * todos mudam ou nenhum muda. Ids de outra conta não dão erro — o filtro por
 * `usuarioId` simplesmente não os alcança, e eles ficam fora da contagem.
 */
rotasDeTransacoes.patch('/', async (req, res) => {
  try {
    const corpo = req.body as Record<string, unknown>;
    const ids = validarIds(corpo['ids']);
    const status = validarStatus(corpo['status']);

    const { count } = await prisma.transacao.updateMany({
      where: { id: { in: ids }, usuarioId: idDoUsuarioLogado(req) },
      data: { status },
    });

    res.json({ alterados: count });
  } catch (erro) {
    responderErro(res, erro, 'atualizar os lançamentos');
  }
});

/**
 * DELETE /api/transacoes  { "ids": [1, 2, 3] }
 * Apaga exatamente as linhas pedidas. Numa compra parcelada, apaga só as
 * parcelas selecionadas — quem quer a compra inteira usa o Excluir da linha,
 * que pergunta.
 */
rotasDeTransacoes.delete('/', async (req, res) => {
  try {
    const ids = validarIds((req.body as Record<string, unknown>)['ids']);

    const { count } = await prisma.transacao.deleteMany({
      where: { id: { in: ids }, usuarioId: idDoUsuarioLogado(req) },
    });

    res.json({ apagados: count });
  } catch (erro) {
    responderErro(res, erro, 'excluir os lançamentos');
  }
});

/**
 * PUT /api/transacoes/:id — regrava um lançamento com o que veio da tela.
 *
 * Valida campo por campo como a criação, para a edição não virar uma porta
 * dos fundos para dados que o POST recusaria. O parcelamento NÃO se edita:
 * parcela atual, total e grupo ficam como estavam. Mudar o valor de uma
 * parcela muda só ela — as outras são lançamentos à parte.
 */
rotasDeTransacoes.put('/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const usuarioId = idDoUsuarioLogado(req);
    const corpo = req.body as Record<string, unknown>;

    await exigirTransacaoDoUsuario(id, usuarioId);

    const data = validarData(corpo['data']);
    const ehSobraDoMesAnterior = corpo['ehSobraDoMesAnterior'] === true;

    const campos = {
      data,
      vencimento: validarVencimento(corpo['vencimento'], data),
      descricao: validarDescricao(corpo['descricao']),
      valor: validarValor(corpo['valor']),
      categoria: validarCategoria(corpo['categoria']),
      tipo: validarTipo(corpo['tipo']),
      status: validarStatus(corpo['status']),
      formaDePagamento: validarFormaDePagamento(corpo['formaDePagamento']),
      classificacao: validarClassificacao(corpo['classificacao']),
      ehSobraDoMesAnterior,
    };

    // Uma categoria corrigida na edição também passa a ser oferecida.
    if (!ehSobraDoMesAnterior) {
      await registrarSugestao(usuarioId, CampoComSugestao.CATEGORIA, campos.categoria);
      await registrarSugestao(
        usuarioId,
        CampoComSugestao.FORMA_DE_PAGAMENTO,
        campos.formaDePagamento
      );
    }

    const transacao = await prisma.transacao.update({ where: { id }, data: campos });

    res.json({ transacao: paraResposta(transacao) });
  } catch (erro) {
    if (erro instanceof TransacaoNaoEncontrada) {
      res.status(404).json({ erro: 'Lançamento não encontrado.' });
      return;
    }
    responderErro(res, erro, 'editar o lançamento');
  }
});

/**
 * PATCH /api/transacoes/:id  { "status": "CONCLUIDA" }
 * Marca como pago/recebido (ou volta para pendente).
 */
rotasDeTransacoes.patch('/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const status = validarStatus((req.body as Record<string, unknown>)['status']);

    await exigirTransacaoDoUsuario(id, idDoUsuarioLogado(req));

    const transacao = await prisma.transacao.update({
      where: { id },
      data: { status },
    });

    res.json({ transacao: paraResposta(transacao) });
  } catch (erro) {
    if (erro instanceof TransacaoNaoEncontrada) {
      res.status(404).json({ erro: 'Lançamento não encontrado.' });
      return;
    }
    responderErro(res, erro, 'atualizar o lançamento');
  }
});

/**
 * DELETE /api/transacoes/:id
 * Com `?todasAsParcelas=true`, apaga a compra parcelada inteira — cancelar uma
 * assinatura de 12x apagando 12 linhas à mão seria tortura.
 */
rotasDeTransacoes.delete('/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const usuarioId = idDoUsuarioLogado(req);

    const { grupoDeParcelas } = await exigirTransacaoDoUsuario(id, usuarioId);
    const apagarGrupo = req.query['todasAsParcelas'] === 'true' && grupoDeParcelas !== null;

    // O filtro por usuarioId fica aqui também, e não só na checagem acima:
    // é a garantia de que um deleteMany por grupo nunca alcança outra conta.
    const { count } = await prisma.transacao.deleteMany({
      where: apagarGrupo ? { grupoDeParcelas, usuarioId } : { id, usuarioId },
    });

    res.json({ apagados: count });
  } catch (erro) {
    if (erro instanceof TransacaoNaoEncontrada) {
      res.status(404).json({ erro: 'Lançamento não encontrado.' });
      return;
    }
    responderErro(res, erro, 'excluir o lançamento');
  }
});
