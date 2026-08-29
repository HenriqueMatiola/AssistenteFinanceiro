/**
 * Rotas de investimentos.
 *
 * A listagem busca a cotação de cada ativo AO VIVO e calcula lucro/prejuízo na
 * hora. Nada de preço é gravado: um valor guardado envelhece em minutos e
 * passaria a mentir sobre o patrimônio.
 *
 * Se a fonte de cotação não responder, o ativo aparece assim mesmo — com o que
 * foi pago e um aviso de que o preço não veio. Uma API de terceiro fora do ar
 * não pode esconder o que você comprou.
 *
 * Montado atrás de `exigirLogin`, então toda consulta filtra pelo usuário.
 */
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { responderErro } from '../respostas.ts';
import { ErroDeValidacao, validarData, validarId, validarValor } from '../validacao.ts';
import { calcularPosicao, somarCarteira } from '../investimentos.ts';
import { fonteDeCotacao } from '../cotacoes.ts';

export const rotasDeInvestimentos = Router();

// --- Validação --------------------------------------------------------------

/**
 * Código do ativo na fonte de cotação. Guardamos em maiúsculas para "petr4.sa"
 * e "PETR4.SA" não virarem duas posições diferentes do mesmo papel.
 */
function validarAtivo(bruto: unknown): string {
  if (typeof bruto !== 'string' || !bruto.trim()) {
    throw new ErroDeValidacao('Informe o código do ativo (ex: PETR4.SA).');
  }

  const ativo = bruto.trim().toUpperCase();

  if (ativo.length > 20) {
    throw new ErroDeValidacao('Código de ativo longo demais.');
  }

  return ativo;
}

function validarApelido(bruto: unknown): string | null {
  if (typeof bruto !== 'string' || !bruto.trim()) {
    return null;
  }

  const apelido = bruto.trim();

  if (apelido.length > 60) {
    throw new ErroDeValidacao('Apelido longo demais (máximo 60 caracteres).');
  }

  return apelido;
}

/**
 * Quantidade com até 8 casas — cripto se compra em fração.
 * Devolve texto, e não número, para chegar ao DECIMAL do Postgres sem passar
 * por nenhuma conversão que possa perder casas.
 */
function validarQuantidade(bruto: unknown): string {
  const numero = typeof bruto === 'string' ? Number(bruto.replace(',', '.')) : bruto;

  if (typeof numero !== 'number' || !Number.isFinite(numero)) {
    throw new ErroDeValidacao('Quantidade inválida.');
  }
  if (numero <= 0) {
    throw new ErroDeValidacao('A quantidade precisa ser maior que zero.');
  }
  // A coluna é DECIMAL(18,8): 10 dígitos antes do ponto.
  if (numero >= 10_000_000_000) {
    throw new ErroDeValidacao('Quantidade alta demais.');
  }

  return numero.toFixed(8);
}

/** Investimento inexistente, ou de outro usuário: vira 404. */
class InvestimentoNaoEncontrado extends Error {}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/investimentos
 * A carteira com cotação ao vivo, lucro/prejuízo por ativo e o total.
 */
rotasDeInvestimentos.get('/', async (req, res) => {
  try {
    const investimentos = await prisma.investimento.findMany({
      where: { usuarioId: idDoUsuarioLogado(req) },
      orderBy: [{ dataDaCompra: 'desc' }, { id: 'desc' }],
    });

    // Uma busca só para a carteira inteira, sem repetir códigos: dois aportes
    // no mesmo papel não viram duas requisições.
    const codigos = [...new Set(investimentos.map((i) => i.ativo))];
    const cotacoes = await fonteDeCotacao.buscar(codigos);

    const posicoes = investimentos.map((i) => {
      const quantidade = i.quantidade.toNumber();
      const valorPago = i.valorPago.toNumber();
      const cotacao = cotacoes.get(i.ativo) ?? null;

      const calculo = calcularPosicao({ quantidade, valorPago }, cotacao?.preco ?? null);

      return {
        id: i.id,
        ativo: i.ativo,
        apelido: i.apelido,
        dataDaCompra: i.dataDaCompra.toISOString().slice(0, 10),
        quantidade,
        valorPago,
        /** Já em reais: ativos cotados em outra moeda vêm convertidos. */
        cotacao: cotacao?.preco ?? null,
        moedaOriginal: cotacao?.moedaOriginal ?? null,
        precoOriginal: cotacao?.precoOriginal ?? null,
        /** Taxa usada na conversão, ou null se o ativo já cotava em reais. */
        cambio: cotacao?.cambio ?? null,
        ...calculo,
      };
    });

    res.json({
      investimentos: posicoes,
      total: somarCarteira(posicoes),
      /** Quando true, a tela avisa que os números estão incompletos. */
      cotacaoIndisponivel: codigos.length > 0 && cotacoes.size < codigos.length,
    });
  } catch (erro) {
    responderErro(res, erro, 'listar os investimentos');
  }
});

/** POST /api/investimentos — registra uma compra. */
rotasDeInvestimentos.post('/', async (req, res) => {
  try {
    const corpo = req.body as Record<string, unknown>;

    const investimento = await prisma.investimento.create({
      data: {
        // O dono vem do token, nunca do corpo da requisição.
        usuarioId: idDoUsuarioLogado(req),
        ativo: validarAtivo(corpo['ativo']),
        apelido: validarApelido(corpo['apelido']),
        dataDaCompra: validarData(corpo['dataDaCompra']),
        quantidade: validarQuantidade(corpo['quantidade']),
        valorPago: validarValor(corpo['valorPago']),
      },
    });

    res.status(201).json({
      investimento: {
        id: investimento.id,
        ativo: investimento.ativo,
        apelido: investimento.apelido,
        dataDaCompra: investimento.dataDaCompra.toISOString().slice(0, 10),
        quantidade: investimento.quantidade.toNumber(),
        valorPago: investimento.valorPago.toNumber(),
      },
    });
  } catch (erro) {
    responderErro(res, erro, 'registrar o investimento');
  }
});

/** DELETE /api/investimentos/:id */
rotasDeInvestimentos.delete('/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const usuarioId = idDoUsuarioLogado(req);

    // O filtro por usuarioId no próprio delete é o que impede alguém de apagar
    // a posição de outra pessoa adivinhando o número.
    const { count } = await prisma.investimento.deleteMany({ where: { id, usuarioId } });

    if (count === 0) {
      throw new InvestimentoNaoEncontrado();
    }

    res.status(204).end();
  } catch (erro) {
    if (erro instanceof InvestimentoNaoEncontrado) {
      res.status(404).json({ erro: 'Investimento não encontrado.' });
      return;
    }
    responderErro(res, erro, 'excluir o investimento');
  }
});
