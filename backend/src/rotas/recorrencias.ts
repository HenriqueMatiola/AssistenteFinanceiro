/**
 * Rotas de recorrências: as contas que se repetem todo mês.
 *
 * Uma recorrência NÃO vira lançamento sozinha — ela não aparece no Dashboard
 * nem na lista de Lançamentos. Ela existe só para a Projeção conseguir estimar
 * os meses que ainda não chegaram. Quando o aluguel de fato for pago, ele é
 * lançado normalmente na aba Lançamentos.
 *
 * Montado atrás de `exigirLogin`, então toda consulta filtra por
 * `idDoUsuarioLogado(req)` — é isso que separa os dados de cada um.
 */
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { responderErro } from '../respostas.ts';
import {
  ErroDeValidacao,
  validarCategoria,
  validarClassificacao,
  validarDescricao,
  validarDiaDoMes,
  validarFormaDePagamento,
  validarId,
  validarTipo,
  validarValor,
} from '../validacao.ts';
import type { ClassificacaoGasto, TipoTransacao } from '../generated/prisma/enums.ts';

export const rotasDeRecorrencias = Router();

// --- Formato de saída -------------------------------------------------------

interface RecorrenciaDoBanco {
  id: number;
  descricao: string;
  valor: { toNumber(): number };
  categoria: string;
  tipo: TipoTransacao;
  formaDePagamento: string | null;
  classificacao: ClassificacaoGasto | null;
  diaDoMes: number;
  ativa: boolean;
}

/** No banco o valor é um objeto Decimal; na API ele vira número. */
function paraResposta(r: RecorrenciaDoBanco) {
  return {
    id: r.id,
    descricao: r.descricao,
    valor: r.valor.toNumber(),
    categoria: r.categoria,
    tipo: r.tipo,
    formaDePagamento: r.formaDePagamento,
    classificacao: r.classificacao,
    diaDoMes: r.diaDoMes,
    ativa: r.ativa,
  };
}

/**
 * Confere que a recorrência existe E pertence a quem está pedindo.
 *
 * Sem esta checagem, um `update` filtrando só pelo id deixaria uma pessoa
 * alterar a recorrência da outra apenas adivinhando o número. Responder 404
 * (e não 403) para a recorrência de outro usuário é de propósito: assim nem
 * dá para descobrir quais ids existem.
 */
async function exigirRecorrenciaDoUsuario(id: number, usuarioId: number): Promise<void> {
  const existe = await prisma.recorrencia.findFirst({
    where: { id, usuarioId },
    select: { id: true },
  });

  if (!existe) {
    throw new RecorrenciaNaoEncontrada();
  }
}

/** Recorrência inexistente, ou de outro usuário: vira 404. */
class RecorrenciaNaoEncontrada extends Error {}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/recorrencias
 * Todas as do usuário, ativas e desligadas — quem esconde as desligadas é a
 * projeção, não a lista.
 */
rotasDeRecorrencias.get('/', async (req, res) => {
  try {
    const recorrencias = await prisma.recorrencia.findMany({
      where: { usuarioId: idDoUsuarioLogado(req) },
      // Ativas primeiro, depois na ordem do dia em que caem no mês.
      orderBy: [{ ativa: 'desc' }, { diaDoMes: 'asc' }, { id: 'asc' }],
    });

    res.json({ recorrencias: recorrencias.map(paraResposta) });
  } catch (erro) {
    responderErro(res, erro, 'listar as recorrências');
  }
});

/** POST /api/recorrencias — cria uma recorrência para o usuário logado. */
rotasDeRecorrencias.post('/', async (req, res) => {
  try {
    const corpo = req.body as Record<string, unknown>;

    const recorrencia = await prisma.recorrencia.create({
      data: {
        // O dono vem do token, nunca do corpo da requisição.
        usuarioId: idDoUsuarioLogado(req),
        descricao: validarDescricao(corpo['descricao']),
        valor: validarValor(corpo['valor']),
        categoria: validarCategoria(corpo['categoria']),
        tipo: validarTipo(corpo['tipo']),
        formaDePagamento: validarFormaDePagamento(corpo['formaDePagamento']),
        classificacao: validarClassificacao(corpo['classificacao']),
        diaDoMes: validarDiaDoMes(corpo['diaDoMes']),
      },
    });

    res.status(201).json({ recorrencia: paraResposta(recorrencia) });
  } catch (erro) {
    responderErro(res, erro, 'criar a recorrência');
  }
});

/**
 * PATCH /api/recorrencias/:id  { "ativa": false }
 * Liga ou desliga a recorrência. Desligar é o jeito de tirar uma assinatura
 * cancelada da projeção sem perder o registro de que ela existiu.
 */
rotasDeRecorrencias.patch('/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const ativa = (req.body as Record<string, unknown>)['ativa'];

    if (typeof ativa !== 'boolean') {
      throw new ErroDeValidacao('Informe `ativa` como true ou false.');
    }

    await exigirRecorrenciaDoUsuario(id, idDoUsuarioLogado(req));

    const recorrencia = await prisma.recorrencia.update({
      where: { id },
      data: { ativa },
    });

    res.json({ recorrencia: paraResposta(recorrencia) });
  } catch (erro) {
    if (erro instanceof RecorrenciaNaoEncontrada) {
      res.status(404).json({ erro: 'Recorrência não encontrada.' });
      return;
    }
    responderErro(res, erro, 'atualizar a recorrência');
  }
});

/**
 * DELETE /api/recorrencias/:id
 * Apaga de vez. Para só parar de contar na projeção, prefira o PATCH — apagar
 * some com a descrição também.
 */
rotasDeRecorrencias.delete('/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);

    await exigirRecorrenciaDoUsuario(id, idDoUsuarioLogado(req));
    await prisma.recorrencia.delete({ where: { id } });

    // 204: deu certo e não há nada para devolver.
    res.status(204).end();
  } catch (erro) {
    if (erro instanceof RecorrenciaNaoEncontrada) {
      res.status(404).json({ erro: 'Recorrência não encontrada.' });
      return;
    }
    responderErro(res, erro, 'excluir a recorrência');
  }
});
