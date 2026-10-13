/**
 * Rotas da aba "A receber e a pagar": dinheiro parado entre você e alguém.
 *
 * O que separa um acerto de um lançamento a pagar é a DATA. Um lançamento
 * pendente tem dia certo, e por isso entra no balanço do mês. Aqui não se sabe
 * quando — "o João me deve 200" não pertence a mês nenhum —, e é justamente
 * para essas contas soltas que a aba existe.
 *
 * Por isso nada aqui conversa com `transacoes` nem com o Dashboard. Emprestar
 * dinheiro não é gasto: é dinheiro que mudou de lugar e volta. Se o mesmo
 * pagamento contasse nos dois lugares, ele sairia duas vezes do balanço.
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
  validarData,
  validarDescricaoOpcional,
  validarId,
  validarPessoa,
  validarTipoDeAcerto,
  validarValor,
} from '../validacao.ts';
import { cabeNoSaldo, consolidarAcerto, totaisEmAberto } from '../acertos.ts';
import { CampoComSugestao, registrarSugestao } from '../sugestoes.ts';
import type { TipoDeAcerto } from '../generated/prisma/enums.ts';

export const rotasDeAcertos = Router();

/** Acerto inexistente, ou de outro usuário: vira 404. */
class AcertoNaoEncontrado extends Error {}

/** Baixa inexistente, ou de outro acerto: vira 404. */
class BaixaNaoEncontrada extends Error {}

// --- Formato de saída -------------------------------------------------------

interface BaixaDoBanco {
  id: number;
  data: Date;
  valor: { toNumber(): number };
}

interface AcertoDoBanco {
  id: number;
  tipo: TipoDeAcerto;
  pessoa: string;
  valor: { toNumber(): number };
  descricao: string | null;
  criadoEm: Date;
  baixas: BaixaDoBanco[];
}

/**
 * O Decimal vira número e a Date vira "AAAA-MM-DD", como no resto da API.
 *
 * O saldo é calculado na saída, e não guardado numa coluna: número derivado
 * que se grava é número que um dia discorda da origem dele. Aqui a origem são
 * o valor e as baixas, e não há como discordarem de si mesmos.
 */
function paraResposta(a: AcertoDoBanco) {
  const baixas = a.baixas.map((b) => ({
    id: b.id,
    data: b.data.toISOString().slice(0, 10),
    valor: b.valor.toNumber(),
  }));

  const { pago, saldo, quitado } = consolidarAcerto(
    a.valor.toNumber(),
    baixas.map((b) => b.valor)
  );

  return {
    id: a.id,
    tipo: a.tipo,
    pessoa: a.pessoa,
    valor: a.valor.toNumber(),
    descricao: a.descricao,
    criadoEm: a.criadoEm.toISOString().slice(0, 10),
    pago,
    saldo,
    quitado,
    baixas,
  };
}

/** O histórico vem do mais recente para o mais antigo, que é como se lê. */
const BAIXAS_EM_ORDEM = {
  orderBy: [{ data: 'desc' as const }, { id: 'desc' as const }],
};

/**
 * Busca o acerto conferindo que ele é de quem está pedindo.
 *
 * Sem esta checagem, um `update` filtrando só pelo id deixaria uma pessoa
 * mexer no acerto da outra apenas adivinhando o número. Responder 404 (e não
 * 403) para o acerto alheio é de propósito: assim nem dá para descobrir quais
 * ids existem.
 */
async function buscarAcertoDoUsuario(id: number, usuarioId: number) {
  const acerto = await prisma.acerto.findFirst({
    where: { id, usuarioId },
    include: { baixas: BAIXAS_EM_ORDEM },
  });

  if (!acerto) {
    throw new AcertoNaoEncontrado();
  }

  return acerto;
}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/acertos
 *
 * Tudo de uma vez: os totais do topo e a lista inteira, com o histórico de
 * cada acerto junto. São poucas linhas por pessoa — dezenas, não milhares —,
 * então paginar aqui só criaria um problema que não existe.
 */
rotasDeAcertos.get('/', async (req, res) => {
  try {
    const acertos = await prisma.acerto.findMany({
      where: { usuarioId: idDoUsuarioLogado(req) },
      include: { baixas: BAIXAS_EM_ORDEM },
      // Os mais recentes primeiro. Quem separa em aberto de quitado é a tela:
      // o histórico continua valendo depois de tudo pago.
      orderBy: { criadoEm: 'desc' },
    });

    const resposta = acertos.map(paraResposta);

    res.json({
      totais: totaisEmAberto(
        resposta.map((a) => ({
          tipo: a.tipo,
          valor: a.valor,
          baixas: a.baixas.map((b) => b.valor),
        }))
      ),
      acertos: resposta,
    });
  } catch (erro) {
    responderErro(res, erro, 'listar os acertos');
  }
});

/**
 * POST /api/acertos
 * Cria o acerto. Sem data de vencimento de propósito: é o que a aba assume.
 */
rotasDeAcertos.post('/', async (req, res) => {
  try {
    const corpo = req.body as {
      tipo?: unknown;
      pessoa?: unknown;
      valor?: unknown;
      descricao?: unknown;
    };

    const usuarioId = idDoUsuarioLogado(req);

    const acerto = await prisma.acerto.create({
      data: {
        usuarioId,
        tipo: validarTipoDeAcerto(corpo.tipo),
        pessoa: validarPessoa(corpo.pessoa),
        valor: validarValor(corpo.valor),
        descricao: validarDescricaoOpcional(corpo.descricao),
      },
      include: { baixas: BAIXAS_EM_ORDEM },
    });

    // O nome passa a ser oferecido no campo "Quem" da próxima vez. Antes a
    // lista saía dos acertos existentes, o que impedia esquecer alguém: agora
    // dá para apagar o nome sem apagar o acerto.
    await registrarSugestao(usuarioId, CampoComSugestao.PESSOA, acerto.pessoa);

    res.status(201).json({ acerto: paraResposta(acerto) });
  } catch (erro) {
    responderErro(res, erro, 'criar o acerto');
  }
});

/**
 * PATCH /api/acertos/:id
 *
 * Corrige quem, quanto e para quê. Existe porque a alternativa seria apagar e
 * recriar — e quem já registrou três pagamentos perderia o histórico só para
 * consertar um dígito.
 *
 * O valor não pode cair abaixo do que já foi pago: isso deixaria o acerto
 * devendo menos que nada, e saldo negativo não quer dizer coisa alguma aqui.
 */
rotasDeAcertos.patch('/:id', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const id = validarId(req.params.id);
    const atual = await buscarAcertoDoUsuario(id, usuarioId);

    const corpo = req.body as {
      tipo?: unknown;
      pessoa?: unknown;
      valor?: unknown;
      descricao?: unknown;
    };
    const dados: {
      tipo?: TipoDeAcerto;
      pessoa?: string;
      valor?: string;
      descricao?: string | null;
    } = {};

    // O tipo também se corrige: cadastrar "a pagar" o que era "a receber"
    // é um clique errado no seletor, e não motivo para perder o histórico.
    if ('tipo' in corpo) dados.tipo = validarTipoDeAcerto(corpo.tipo);
    if ('pessoa' in corpo) dados.pessoa = validarPessoa(corpo.pessoa);
    if ('descricao' in corpo) dados.descricao = validarDescricaoOpcional(corpo.descricao);

    if ('valor' in corpo) {
      const novoValor = validarValor(corpo.valor);

      const { pago } = consolidarAcerto(
        atual.valor.toNumber(),
        atual.baixas.map((b) => b.valor.toNumber())
      );

      if (Number(novoValor) < pago) {
        throw new ErroDeValidacao(
          `Este acerto já teve ${pago.toFixed(2)} pago. Apague um pagamento antes de reduzir o valor.`
        );
      }

      dados.valor = novoValor;
    }

    if (Object.keys(dados).length === 0) {
      throw new ErroDeValidacao('Nada para atualizar.');
    }

    const acerto = await prisma.acerto.update({
      where: { id },
      data: dados,
      include: { baixas: BAIXAS_EM_ORDEM },
    });

    // Um nome corrigido aqui também passa a ser oferecido no campo "Quem".
    if (dados.pessoa) {
      await registrarSugestao(usuarioId, CampoComSugestao.PESSOA, dados.pessoa);
    }

    res.json({ acerto: paraResposta(acerto) });
  } catch (erro) {
    if (erro instanceof AcertoNaoEncontrado) {
      res.status(404).json({ erro: 'Acerto não encontrado.' });
      return;
    }

    responderErro(res, erro, 'atualizar o acerto');
  }
});

/** DELETE /api/acertos/:id — leva o histórico junto (o cascade do banco cuida). */
rotasDeAcertos.delete('/:id', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const id = validarId(req.params.id);

    await buscarAcertoDoUsuario(id, usuarioId);
    await prisma.acerto.delete({ where: { id } });

    res.status(204).end();
  } catch (erro) {
    if (erro instanceof AcertoNaoEncontrado) {
      res.status(404).json({ erro: 'Acerto não encontrado.' });
      return;
    }

    responderErro(res, erro, 'apagar o acerto');
  }
});

/**
 * POST /api/acertos/:id/baixas
 *
 * Registra um pagamento ou recebimento parcial: "paguei 50 ao João em 03/09".
 *
 * A baixa não pode passar do que falta. Sem isso, um zero digitado a mais
 * ("500" em vez de "50") deixaria o acerto com saldo negativo e o total do
 * topo errado — e o erro só apareceria dias depois, quando ninguém mais lembra
 * o que digitou.
 */
rotasDeAcertos.post('/:id/baixas', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const id = validarId(req.params.id);
    const acerto = await buscarAcertoDoUsuario(id, usuarioId);

    const corpo = req.body as { data?: unknown; valor?: unknown };

    // A data vem antes do valor de propósito: se as duas estiverem erradas, a
    // primeira mensagem que a pessoa lê é sobre o primeiro campo do formulário.
    const data = validarData(corpo.data);
    const valor = Number(validarValor(corpo.valor));

    const { saldo } = consolidarAcerto(
      acerto.valor.toNumber(),
      acerto.baixas.map((b) => b.valor.toNumber())
    );

    if (!cabeNoSaldo(valor, saldo)) {
      throw new ErroDeValidacao(
        saldo === 0
          ? 'Este acerto já está quitado.'
          : `Falta ${saldo.toFixed(2)} neste acerto — o valor não pode passar disso.`
      );
    }

    await prisma.baixa.create({
      data: { acertoId: id, data, valor: valor.toFixed(2) },
    });

    // Devolve o acerto inteiro, e não só a baixa criada: a tela precisa do
    // saldo novo e do histórico atualizado de qualquer jeito, e assim ela não
    // recalcula nada por conta própria — nem corre o risco de divergir daqui.
    const atualizado = await buscarAcertoDoUsuario(id, usuarioId);

    res.status(201).json({ acerto: paraResposta(atualizado) });
  } catch (erro) {
    if (erro instanceof AcertoNaoEncontrado) {
      res.status(404).json({ erro: 'Acerto não encontrado.' });
      return;
    }

    responderErro(res, erro, 'registrar o pagamento');
  }
});

/**
 * PATCH /api/acertos/:id/baixas/:baixaId   { "data": "2026-09-03", "valor": 50 }
 *
 * Corrige um pagamento já registrado — a data ou o valor. Antes, o único
 * conserto era apagar e registrar de novo.
 *
 * O teto é o mesmo de registrar: o pagamento não pode passar do que falta.
 * Só que o "que falta" é contado SEM este pagamento — senão, num acerto de 100
 * com uma baixa de 100, corrigir para 90 seria recusado (saldo zero).
 */
rotasDeAcertos.patch('/:id/baixas/:baixaId', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const id = validarId(req.params.id);
    const baixaId = validarId(req.params.baixaId);

    const acerto = await buscarAcertoDoUsuario(id, usuarioId);

    // A baixa precisa ser DESTE acerto — mesmo motivo da rota de apagar.
    if (!acerto.baixas.some((b) => b.id === baixaId)) {
      throw new BaixaNaoEncontrada();
    }

    const corpo = req.body as { data?: unknown; valor?: unknown };
    const data = validarData(corpo.data);
    const valor = Number(validarValor(corpo.valor));

    const { saldo: saldoSemEsta } = consolidarAcerto(
      acerto.valor.toNumber(),
      acerto.baixas.filter((b) => b.id !== baixaId).map((b) => b.valor.toNumber())
    );

    if (!cabeNoSaldo(valor, saldoSemEsta)) {
      throw new ErroDeValidacao(
        `Contando os outros pagamentos, falta ${saldoSemEsta.toFixed(2)} neste acerto — ` +
          'o valor não pode passar disso.'
      );
    }

    await prisma.baixa.update({
      where: { id: baixaId },
      data: { data, valor: valor.toFixed(2) },
    });

    const atualizado = await buscarAcertoDoUsuario(id, usuarioId);

    res.json({ acerto: paraResposta(atualizado) });
  } catch (erro) {
    if (erro instanceof AcertoNaoEncontrado) {
      res.status(404).json({ erro: 'Acerto não encontrado.' });
      return;
    }

    if (erro instanceof BaixaNaoEncontrada) {
      res.status(404).json({ erro: 'Pagamento não encontrado neste acerto.' });
      return;
    }

    responderErro(res, erro, 'corrigir o pagamento');
  }
});

/**
 * DELETE /api/acertos/:id/baixas/:baixaId
 *
 * Desfaz um pagamento. É o conserto de quem digitou o valor errado — sem isto,
 * a única saída seria apagar o acerto inteiro e perder o resto do histórico.
 */
rotasDeAcertos.delete('/:id/baixas/:baixaId', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const id = validarId(req.params.id);
    const baixaId = validarId(req.params.baixaId);

    const acerto = await buscarAcertoDoUsuario(id, usuarioId);

    // A baixa precisa ser DESTE acerto. O dono já foi conferido acima, mas sem
    // esta segunda checagem daria para apagar a baixa de um acerto passando o
    // id dela na URL de outro.
    if (!acerto.baixas.some((b) => b.id === baixaId)) {
      throw new BaixaNaoEncontrada();
    }

    await prisma.baixa.delete({ where: { id: baixaId } });

    const atualizado = await buscarAcertoDoUsuario(id, usuarioId);

    res.json({ acerto: paraResposta(atualizado) });
  } catch (erro) {
    if (erro instanceof AcertoNaoEncontrado) {
      res.status(404).json({ erro: 'Acerto não encontrado.' });
      return;
    }

    if (erro instanceof BaixaNaoEncontrada) {
      res.status(404).json({ erro: 'Pagamento não encontrado neste acerto.' });
      return;
    }

    responderErro(res, erro, 'apagar o pagamento');
  }
});
