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
  validarData,
  validarDiaDoMes,
  validarFormaDePagamento,
  validarId,
  validarIds,
  mesAtualUTC,
  validarMes,
  validarStatus,
  validarTipo,
  validarValor,
  intervaloDoMes,
} from '../validacao.ts';
import {
  StatusTransacao,
  type ClassificacaoGasto,
  type TipoTransacao,
} from '../generated/prisma/enums.ts';
import { dataPrevista } from '../projecao.ts';
import { previsaoDoMes } from '../previsaoDoMes.ts';
import { dentroDoMes } from '../mesDoLancamento.ts';
import { CampoComSugestao, registrarSugestao } from '../sugestoes.ts';

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
 * GET /api/recorrencias/previstas?mes=2026-08
 *
 * As recorrências que ainda não viraram lançamento no mês — o que a tela de
 * Lançamentos mostra junto dos lançamentos de verdade, para dar para marcar
 * cada conta como paga.
 *
 * Declarada ANTES de qualquer rota `/:id` de propósito: o Express casa na
 * ordem, e "previstas" seria engolido como se fosse um id.
 */
rotasDeRecorrencias.get('/previstas', async (req, res) => {
  try {
    const mes = validarMes(req.query['mes'] ?? mesAtualUTC());

    const previstas = await previsaoDoMes(
      idDoUsuarioLogado(req),
      mes,
      intervaloDoMes(mes)
    );

    res.json({ mes, previstas });
  } catch (erro) {
    responderErro(res, erro, 'listar as contas previstas');
  }
});

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

    const usuarioId = idDoUsuarioLogado(req);

    const recorrencia = await prisma.recorrencia.create({
      data: {
        // O dono vem do token, nunca do corpo da requisição.
        usuarioId,
        descricao: validarDescricao(corpo['descricao']),
        valor: validarValor(corpo['valor']),
        categoria: validarCategoria(corpo['categoria']),
        tipo: validarTipo(corpo['tipo']),
        formaDePagamento: validarFormaDePagamento(corpo['formaDePagamento']),
        classificacao: validarClassificacao(corpo['classificacao']),
        diaDoMes: validarDiaDoMes(corpo['diaDoMes']),
      },
    });

    // A lista de opções é a mesma dos lançamentos: uma categoria criada aqui
    // aparece lá, e vice-versa. São o mesmo campo, em telas diferentes.
    await registrarSugestao(usuarioId, CampoComSugestao.CATEGORIA, recorrencia.categoria);
    await registrarSugestao(
      usuarioId,
      CampoComSugestao.FORMA_DE_PAGAMENTO,
      recorrencia.formaDePagamento
    );

    res.status(201).json({ recorrencia: paraResposta(recorrencia) });
  } catch (erro) {
    responderErro(res, erro, 'criar a recorrência');
  }
});

/**
 * PATCH /api/recorrencias  { "ids": [1, 2], "ativa": false }
 * Liga ou desliga várias de uma vez, num `updateMany` só. Ids de outra conta
 * não dão erro: o filtro por `usuarioId` não os alcança e eles ficam fora da
 * contagem — mesmo desenho das ações em lote de Lançamentos.
 */
rotasDeRecorrencias.patch('/', async (req, res) => {
  try {
    const corpo = req.body as Record<string, unknown>;
    const ids = validarIds(corpo['ids']);
    const ativa = corpo['ativa'];

    if (typeof ativa !== 'boolean') {
      throw new ErroDeValidacao('Informe `ativa` como true ou false.');
    }

    const { count } = await prisma.recorrencia.updateMany({
      where: { id: { in: ids }, usuarioId: idDoUsuarioLogado(req) },
      data: { ativa },
    });

    res.json({ alteradas: count });
  } catch (erro) {
    responderErro(res, erro, 'atualizar as recorrências');
  }
});

/**
 * DELETE /api/recorrencias  { "ids": [1, 2] }
 * Apaga várias de vez. Os lançamentos que nasceram delas continuam: o vínculo
 * vira nulo (`onDelete: SetNull` no schema), e o dinheiro gasto não "desacontece".
 */
rotasDeRecorrencias.delete('/', async (req, res) => {
  try {
    const ids = validarIds((req.body as Record<string, unknown>)['ids']);

    const { count } = await prisma.recorrencia.deleteMany({
      where: { id: { in: ids }, usuarioId: idDoUsuarioLogado(req) },
    });

    res.json({ apagadas: count });
  } catch (erro) {
    responderErro(res, erro, 'excluir as recorrências');
  }
});

/**
 * PUT /api/recorrencias/:id — regrava a recorrência com o que veio da tela.
 *
 * Mesmas validações da criação. `ativa` fica de fora: ligar e desligar têm
 * botão próprio, e editar o valor não deveria religar uma conta cancelada.
 *
 * Os lançamentos que já nasceram desta recorrência NÃO mudam — são fatos de
 * meses passados. A mudança vale para as previsões e para a Projeção.
 */
rotasDeRecorrencias.put('/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const usuarioId = idDoUsuarioLogado(req);
    const corpo = req.body as Record<string, unknown>;

    await exigirRecorrenciaDoUsuario(id, usuarioId);

    const recorrencia = await prisma.recorrencia.update({
      where: { id },
      data: {
        descricao: validarDescricao(corpo['descricao']),
        valor: validarValor(corpo['valor']),
        categoria: validarCategoria(corpo['categoria']),
        tipo: validarTipo(corpo['tipo']),
        formaDePagamento: validarFormaDePagamento(corpo['formaDePagamento']),
        classificacao: validarClassificacao(corpo['classificacao']),
        diaDoMes: validarDiaDoMes(corpo['diaDoMes']),
      },
    });

    await registrarSugestao(usuarioId, CampoComSugestao.CATEGORIA, recorrencia.categoria);
    await registrarSugestao(
      usuarioId,
      CampoComSugestao.FORMA_DE_PAGAMENTO,
      recorrencia.formaDePagamento
    );

    res.json({ recorrencia: paraResposta(recorrencia) });
  } catch (erro) {
    if (erro instanceof RecorrenciaNaoEncontrada) {
      res.status(404).json({ erro: 'Recorrência não encontrada.' });
      return;
    }
    responderErro(res, erro, 'editar a recorrência');
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

/**
 * POST /api/recorrencias/:id/lancar   { "mes": "2026-08", "valor": 128.40 }
 *
 * Transforma a previsão daquele mês num lançamento de verdade, guardando de
 * qual recorrência ele nasceu. É esse vínculo que faz a previsão parar de
 * contar no balanço — sem ele, a conta apareceria duas vezes.
 *
 * `valor` e `data` são opcionais: contas de consumo (luz, água) variam todo
 * mês, e obrigar o valor cadastrado tornaria o lançamento uma mentira.
 */
rotasDeRecorrencias.post('/:id/lancar', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const usuarioId = idDoUsuarioLogado(req);
    const corpo = req.body as Record<string, unknown>;
    const mes = validarMes(corpo['mes']);

    const recorrencia = await prisma.recorrencia.findFirst({ where: { id, usuarioId } });

    if (!recorrencia) {
      throw new RecorrenciaNaoEncontrada();
    }

    // Lançar duas vezes o mesmo mês criaria a cobrança em dobro que o vínculo
    // existe justamente para evitar.
    const jaExiste = await prisma.transacao.findFirst({
      where: { usuarioId, recorrenciaId: id, ...dentroDoMes(intervaloDoMes(mes)) },
      select: { id: true },
    });

    if (jaExiste) {
      res.status(409).json({
        erro: `"${recorrencia.descricao}" já foi lançada neste mês.`,
      });
      return;
    }

    const transacao = await prisma.transacao.create({
      data: {
        usuarioId,
        recorrenciaId: id,
        // Sem data informada, cai no dia da recorrência — encolhido quando o
        // mês não tem aquele dia (31 em fevereiro).
        data: validarData(corpo['data'] ?? dataPrevista(mes, recorrencia.diaDoMes)),
        descricao: recorrencia.descricao,
        valor:
          corpo['valor'] === undefined
            ? recorrencia.valor
            : validarValor(corpo['valor']),
        categoria: recorrencia.categoria,
        tipo: recorrencia.tipo,
        formaDePagamento: recorrencia.formaDePagamento,
        classificacao: recorrencia.classificacao,
        // O gesto de lançar uma conta prevista é quase sempre "já paguei".
        status:
          corpo['status'] === undefined
            ? StatusTransacao.CONCLUIDA
            : validarStatus(corpo['status']),
      },
    });

    res.status(201).json({
      transacao: {
        id: transacao.id,
        data: transacao.data.toISOString().slice(0, 10),
        descricao: transacao.descricao,
        valor: transacao.valor.toNumber(),
        categoria: transacao.categoria,
        tipo: transacao.tipo,
        status: transacao.status,
        formaDePagamento: transacao.formaDePagamento,
        classificacao: transacao.classificacao,
        parcelaAtual: transacao.parcelaAtual,
        parcelasTotais: transacao.parcelasTotais,
        grupoDeParcelas: transacao.grupoDeParcelas,
      },
    });
  } catch (erro) {
    if (erro instanceof RecorrenciaNaoEncontrada) {
      res.status(404).json({ erro: 'Recorrência não encontrada.' });
      return;
    }
    responderErro(res, erro, 'lançar a recorrência');
  }
});
