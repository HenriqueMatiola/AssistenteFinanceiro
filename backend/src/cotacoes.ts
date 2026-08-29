/**
 * Busca o preço atual dos ativos, sempre convertido para reais.
 *
 * Nenhuma cotação é gravada no banco: preço guardado envelhece em minutos e
 * passaria a mentir sobre o patrimônio. O que existe aqui é um cache curto em
 * memória, só para uma tela aberta e fechada três vezes não virar três rajadas
 * de requisições.
 *
 * A fonte fica atrás de uma interface porque APIs de cotação gratuitas mudam e
 * saem do ar. Trocar de provedor deve ser reescrever UM arquivo, não caçar
 * `fetch` espalhado pelas rotas.
 */

/** Moeda em que o valor pago é sempre informado, e em que a tela exibe tudo. */
export const MOEDA_DA_CARTEIRA = 'BRL';

export interface Cotacao {
  /** Preço de uma unidade, JÁ convertido para reais. */
  preco: number;

  /** Em que moeda o ativo é cotado na origem ("BRL", "USD"). */
  moedaOriginal: string;

  /** O preço como veio da fonte, antes da conversão. */
  precoOriginal: number;

  /**
   * Taxa usada para converter, ou null quando o ativo já cotava em reais.
   * Vai para a tela: um número convertido sem dizer por quanto é um número
   * que não dá para conferir.
   */
  cambio: number | null;
}

export interface FonteDeCotacao {
  /**
   * Preços dos códigos pedidos, em reais. Um código que a fonte não conhece
   * simplesmente não aparece no resultado — quem chama trata a ausência.
   */
  buscar(codigos: string[]): Promise<Map<string, Cotacao>>;
}

// --- Cache ------------------------------------------------------------------

/**
 * Meio minuto. Tempo suficiente para absorver recarregar a página várias
 * vezes, e curto o bastante para o número na tela ainda ser "agora".
 */
const VALIDADE_DO_CACHE_MS = 30_000;

interface PrecoBruto {
  preco: number;
  moeda: string;
}

const cache = new Map<string, { valor: PrecoBruto; expiraEm: number }>();

// --- Yahoo Finance ----------------------------------------------------------

/**
 * O endpoint público de gráficos do Yahoo. Não é uma API oficial documentada —
 * é a que o site deles usa —, então pode mudar sem aviso. A escolha foi
 * deliberada: cobre B3 (`PETR4.SA`), FIIs (`HGLG11.SA`), cripto (`BTC-USD`) e
 * mercado externo sem exigir cadastro nem chave.
 */
const URL_YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/** Quanto esperar por ativo antes de desistir. A tela não pode ficar pendurada. */
const TEMPO_LIMITE_MS = 6000;

/**
 * Código do par de câmbio no Yahoo: "USD" vira "USDBRL=X", que devolve quantos
 * reais vale um dólar.
 */
function codigoDoCambio(moeda: string): string {
  return `${moeda}${MOEDA_DA_CARTEIRA}=X`;
}

/** O formato que nos interessa da resposta do Yahoo. */
interface RespostaYahoo {
  chart?: {
    result?: {
      meta?: {
        regularMarketPrice?: number;
        currency?: string;
      };
    }[];
  };
}

export class FonteYahoo implements FonteDeCotacao {
  async buscar(codigos: string[]): Promise<Map<string, Cotacao>> {
    const brutos = await this.buscarBrutos(codigos);

    // O Yahoo não tem pares de cripto em reais (BTC-BRL dá 404), só BTC-USD.
    // Sem converter, comparar um preço em dólar com um valor pago em reais
    // daria um "lucro" que é só a diferença de moeda.
    const moedasEstrangeiras = [
      ...new Set(
        [...brutos.values()].map((b) => b.moeda).filter((m) => m !== MOEDA_DA_CARTEIRA)
      ),
    ];

    const taxas = await this.buscarBrutos(moedasEstrangeiras.map(codigoDoCambio));

    const resultado = new Map<string, Cotacao>();

    for (const [codigo, bruto] of brutos) {
      if (bruto.moeda === MOEDA_DA_CARTEIRA) {
        resultado.set(codigo, {
          preco: bruto.preco,
          moedaOriginal: bruto.moeda,
          precoOriginal: bruto.preco,
          cambio: null,
        });
        continue;
      }

      const taxa = taxas.get(codigoDoCambio(bruto.moeda));

      // Sem a taxa, é melhor omitir o ativo do que exibir um preço em dólar
      // ao lado de um valor pago em reais como se fossem comparáveis.
      if (!taxa) continue;

      resultado.set(codigo, {
        // Seis casas, e não duas: uma cripto barata pode valer R$ 0,000012, e
        // arredondar a centavos zeraria o preço dela. O corte só tira o ruído
        // que a multiplicação em ponto flutuante deixa no fim do número.
        preco: Math.round(bruto.preco * taxa.preco * 1e6) / 1e6,
        moedaOriginal: bruto.moeda,
        precoOriginal: bruto.preco,
        cambio: taxa.preco,
      });
    }

    return resultado;
  }

  /** Preços crus, como a fonte devolve, com cache. */
  private async buscarBrutos(codigos: string[]): Promise<Map<string, PrecoBruto>> {
    const resultado = new Map<string, PrecoBruto>();
    const aBuscar: string[] = [];
    const agora = Date.now();

    for (const codigo of codigos) {
      const guardado = cache.get(codigo);
      if (guardado && guardado.expiraEm > agora) {
        resultado.set(codigo, guardado.valor);
      } else {
        aBuscar.push(codigo);
      }
    }

    // Os restantes vão em paralelo: são poucos, e em série a tela esperaria a
    // soma de todos os tempos.
    await Promise.all(
      aBuscar.map(async (codigo) => {
        const valor = await this.buscarUm(codigo);
        if (valor) {
          resultado.set(codigo, valor);
          cache.set(codigo, { valor, expiraEm: Date.now() + VALIDADE_DO_CACHE_MS });
        }
      })
    );

    return resultado;
  }

  /** Devolve null para qualquer falha: um ativo sem preço não derruba a tela. */
  private async buscarUm(codigo: string): Promise<PrecoBruto | null> {
    try {
      const resposta = await fetch(`${URL_YAHOO}${encodeURIComponent(codigo)}`, {
        // Sem um User-Agent de navegador o Yahoo responde 403.
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });

      if (!resposta.ok) {
        return null;
      }

      const corpo = (await resposta.json()) as RespostaYahoo;
      const meta = corpo.chart?.result?.[0]?.meta;
      const preco = meta?.regularMarketPrice;

      if (typeof preco !== 'number' || !Number.isFinite(preco)) {
        return null;
      }

      return { preco, moeda: meta?.currency ?? MOEDA_DA_CARTEIRA };
    } catch {
      // Rede fora, tempo esgotado, JSON inesperado: tudo vira "sem cotação",
      // que a tela sabe exibir.
      return null;
    }
  }
}

/** A fonte que o app usa. Trocar de provedor é trocar esta linha. */
export const fonteDeCotacao: FonteDeCotacao = new FonteYahoo();
