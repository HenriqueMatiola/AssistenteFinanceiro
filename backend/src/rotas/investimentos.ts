/**
 * Rotas de investimentos.
 *
 * O banco guarda OPERAÇÕES (compras e vendas). A posição de cada ativo é
 * calculada a partir delas a cada consulta, e a cotação é buscada ao vivo:
 * nada de preço fica gravado, porque preço guardado envelhece em minutos e
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
import { ErroDeValidacao, intervaloDoMes, validarData, validarId, validarValor } from '../validacao.ts';
import { calcularPosicao, somarCarteira } from '../investimentos.ts';
import { consolidarPorAtivo, resumirPorClasse } from '../carteira.ts';
import { fonteDeCotacao } from '../cotacoes.ts';
import { ClasseDeAtivo, TipoDeOperacao } from '../generated/prisma/enums.ts';

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

function validarTipoDeOperacao(bruto: unknown): TipoDeOperacao {
  if (bruto !== TipoDeOperacao.COMPRA && bruto !== TipoDeOperacao.VENDA) {
    throw new ErroDeValidacao('Tipo inválido. Use COMPRA ou VENDA.');
  }
  return bruto;
}

/**
 * Em que cesta o ativo entra no resumo. Quando não informada, é deduzida do
 * próprio código: na B3, papéis terminados em 11 são fundos, o resto com
 * sufixo .SA são ações, e pares contra o dólar são cripto.
 */
function validarClasse(bruto: unknown, ativo: string): ClasseDeAtivo {
  if (bruto === undefined || bruto === null || bruto === '') {
    if (ativo.endsWith('11.SA')) return ClasseDeAtivo.FII;
    if (ativo.endsWith('.SA')) return ClasseDeAtivo.ACAO;
    if (ativo.endsWith('-USD')) return ClasseDeAtivo.CRIPTO;
    return ClasseDeAtivo.OUTRO;
  }

  const classes = Object.values(ClasseDeAtivo) as string[];

  if (typeof bruto !== 'string' || !classes.includes(bruto)) {
    throw new ErroDeValidacao(`Classe inválida. Use uma de: ${classes.join(', ')}.`);
  }

  return bruto as ClasseDeAtivo;
}

/**
 * Quantidade com até 8 casas — cripto se compra em fração.
 * Devolve texto para chegar ao DECIMAL do Postgres sem passar por nenhuma
 * conversão que possa perder casas.
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

/** Operação inexistente, ou de outro usuário: vira 404. */
class OperacaoNaoEncontrada extends Error {}

// --- Montagem da carteira ---------------------------------------------------

interface OperacaoDoBanco {
  id: number;
  ativo: string;
  classe: ClasseDeAtivo;
  tipo: TipoDeOperacao;
  data: Date;
  quantidade: { toNumber(): number };
  valor: { toNumber(): number };
}

function paraResposta(o: OperacaoDoBanco) {
  return {
    id: o.id,
    ativo: o.ativo,
    classe: o.classe,
    tipo: o.tipo,
    data: o.data.toISOString().slice(0, 10),
    quantidade: o.quantidade.toNumber(),
    valor: o.valor.toNumber(),
  };
}

// --- Rotas ------------------------------------------------------------------

/**
 * GET /api/investimentos
 *
 * A carteira: uma linha por ativo, com quantidade em mãos, preço médio pago,
 * cotação ao vivo e resultado. Junto vão o total geral e a quebra por tipo de
 * ativo (ações, FIIs, cripto).
 */
rotasDeInvestimentos.get('/', async (req, res) => {
  try {
    const operacoes = await prisma.operacao.findMany({
      where: { usuarioId: idDoUsuarioLogado(req) },
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
    });

    // Consolida ANTES de buscar preço: assim uma cotação é pedida por ativo,
    // e não por operação — dez compras de PETR4 são uma requisição só.
    const posicoes = consolidarPorAtivo(
      operacoes.map((o) => ({
        ativo: o.ativo,
        classe: o.classe,
        tipo: o.tipo,
        data: o.data.toISOString().slice(0, 10),
        quantidade: o.quantidade.toNumber(),
        valor: o.valor.toNumber(),
      }))
    );

    // Ativo já vendido por inteiro não precisa de cotação: não há posição para
    // avaliar, só o lucro que já foi realizado.
    const codigos = posicoes.filter((p) => p.quantidade > 0).map((p) => p.ativo);
    const cotacoes = await fonteDeCotacao.buscar(codigos);

    const ativos = posicoes.map((p) => {
      const cotacao = cotacoes.get(p.ativo) ?? null;
      const calculo = calcularPosicao(
        { quantidade: p.quantidade, valorPago: p.custoTotal },
        p.quantidade > 0 ? (cotacao?.preco ?? null) : null
      );

      return {
        ativo: p.ativo,
        classe: p.classe,
        quantidade: p.quantidade,
        quantidadeVendida: p.quantidadeVendida,
        /** Custo do que ainda está em carteira. */
        investido: p.custoTotal,
        precoMedio: p.precoMedio,
        /** Resultado das vendas já feitas — dinheiro que já entrou. */
        lucroRealizado: p.lucroRealizado,

        /** Já em reais: ativos cotados em outra moeda vêm convertidos. */
        cotacao: cotacao?.preco ?? null,
        moedaOriginal: cotacao?.moedaOriginal ?? null,
        precoOriginal: cotacao?.precoOriginal ?? null,
        cambio: cotacao?.cambio ?? null,

        valorAtual: calculo.valorAtual,
        /** Lucro "no papel": o que se ganharia vendendo tudo agora. */
        lucro: calculo.lucro,
        variacao: calculo.variacao,
      };
    });

    const emCarteira = ativos.filter((a) => a.quantidade > 0);

    res.json({
      ativos,
      porClasse: resumirPorClasse(
        ativos.map((a) => ({
          classe: a.classe,
          quantidade: a.quantidade,
          custoTotal: a.investido,
          valorAtual: a.valorAtual,
        }))
      ),
      total: {
        ...somarCarteira(
          emCarteira.map((a) => ({ valorPago: a.investido, valorAtual: a.valorAtual }))
        ),
        /** Somado de todas as vendas, mesmo de ativos que não estão mais na carteira. */
        lucroRealizado:
          Math.round(ativos.reduce((soma, a) => soma + a.lucroRealizado, 0) * 100) / 100,
      },
      cotacaoIndisponivel: codigos.length > 0 && cotacoes.size < codigos.length,
    });
  } catch (erro) {
    responderErro(res, erro, 'montar a carteira');
  }
});

/**
 * GET /api/investimentos/operacoes?mes=2026-08&tipo=COMPRA
 * O histórico do que foi comprado e vendido. Sem filtro, devolve tudo.
 */
rotasDeInvestimentos.get('/operacoes', async (req, res) => {
  try {
    const filtro: {
      usuarioId: number;
      tipo?: TipoDeOperacao;
      data?: { gte: Date; lt: Date };
    } = { usuarioId: idDoUsuarioLogado(req) };

    const { mes, tipo } = req.query;

    if (typeof tipo === 'string' && tipo !== '') {
      filtro.tipo = validarTipoDeOperacao(tipo);
    }
    if (typeof mes === 'string' && mes !== '') {
      filtro.data = intervaloDoMes(mes);
    }

    const operacoes = await prisma.operacao.findMany({
      where: filtro,
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
    });

    res.json({ operacoes: operacoes.map(paraResposta) });
  } catch (erro) {
    responderErro(res, erro, 'listar as operações');
  }
});

/** POST /api/investimentos — registra uma compra ou uma venda. */
rotasDeInvestimentos.post('/', async (req, res) => {
  try {
    const corpo = req.body as Record<string, unknown>;
    const usuarioId = idDoUsuarioLogado(req);

    const ativo = validarAtivo(corpo['ativo']);
    const tipo = validarTipoDeOperacao(corpo['tipo'] ?? TipoDeOperacao.COMPRA);
    const quantidade = validarQuantidade(corpo['quantidade']);

    // Vender o que não se tem produziria uma posição negativa, que não existe
    // no mundo real. Recusar aqui é mais honesto que "consertar" depois.
    if (tipo === TipoDeOperacao.VENDA) {
      const anteriores = await prisma.operacao.findMany({
        where: { usuarioId, ativo },
        orderBy: [{ data: 'asc' }, { id: 'asc' }],
      });

      const [posicao] = consolidarPorAtivo(
        anteriores.map((o) => ({
          ativo: o.ativo,
          classe: o.classe,
          tipo: o.tipo,
          data: o.data.toISOString().slice(0, 10),
          quantidade: o.quantidade.toNumber(),
          valor: o.valor.toNumber(),
        }))
      );

      const emMaos = posicao?.quantidade ?? 0;

      if (Number(quantidade) > emMaos) {
        throw new ErroDeValidacao(
          emMaos === 0
            ? `Você não tem ${ativo} em carteira para vender.`
            : `Você tem ${emMaos} de ${ativo}; não dá para vender ${Number(quantidade)}.`
        );
      }
    }

    const operacao = await prisma.operacao.create({
      data: {
        // O dono vem do token, nunca do corpo da requisição.
        usuarioId,
        ativo,
        classe: validarClasse(corpo['classe'], ativo),
        tipo,
        data: validarData(corpo['data']),
        quantidade,
        valor: validarValor(corpo['valor']),
      },
    });

    res.status(201).json({ operacao: paraResposta(operacao) });
  } catch (erro) {
    responderErro(res, erro, 'registrar a operação');
  }
});

/** DELETE /api/investimentos/:id — apaga uma operação do histórico. */
rotasDeInvestimentos.delete('/:id', async (req, res) => {
  try {
    const id = validarId(req.params.id);
    const usuarioId = idDoUsuarioLogado(req);

    // O filtro por usuarioId no próprio delete é o que impede alguém de apagar
    // a operação de outra pessoa adivinhando o número.
    const { count } = await prisma.operacao.deleteMany({ where: { id, usuarioId } });

    if (count === 0) {
      throw new OperacaoNaoEncontrada();
    }

    res.status(204).end();
  } catch (erro) {
    if (erro instanceof OperacaoNaoEncontrada) {
      res.status(404).json({ erro: 'Operação não encontrada.' });
      return;
    }
    responderErro(res, erro, 'excluir a operação');
  }
});
