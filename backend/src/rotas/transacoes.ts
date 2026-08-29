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
  validarParcelas,
  validarStatus,
  validarTipo,
  validarValor,
} from '../validacao.ts';
import { responderErro } from '../respostas.ts';
import { datasDasParcelas } from '../parcelas.ts';

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
      data?: { gte: Date; lt: Date };
    } = { usuarioId: idDoUsuarioLogado(req) };

    const { mes, tipo, status } = req.query;

    if (typeof tipo === 'string' && tipo !== '') {
      filtro.tipo = validarTipo(tipo);
    }

    if (typeof status === 'string' && status !== '') {
      filtro.status = validarStatus(status);
    }

    if (typeof mes === 'string' && mes !== '') {
      filtro.data = intervaloDoMes(mes);
    }

    const transacoes = await prisma.transacao.findMany({
      where: filtro,
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
    });

    res.json({ transacoes: transacoes.map(paraResposta) });
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

    if (quantidadeDeParcelas === 1) {
      const transacao = await prisma.transacao.create({
        data: { ...comuns, data: dataInicial, status: statusPedido },
      });

      res.status(201).json({ transacoes: [paraResposta(transacao)] });
      return;
    }

    // Um id só, compartilhado, para depois dar para apagar a compra inteira
    // sem caçar parcela por parcela.
    const grupoDeParcelas = randomUUID();

    const parcelas = datasDasParcelas(dataInicial, quantidadeDeParcelas).map((data, indice) => ({
      ...comuns,
      data,
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
      orderBy: { data: 'asc' },
    });

    res.status(201).json({ transacoes: criadas.map(paraResposta) });
  } catch (erro) {
    responderErro(res, erro, 'criar a transação');
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
