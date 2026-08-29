/**
 * Tudo que fala com o backend passa por aqui.
 * Concentrar isto num arquivo evita espalhar `fetch` e endereços pelas telas.
 */

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// Nome da "gaveta" onde o navegador guarda o token.
const CHAVE_TOKEN = 'assfinanceiro.token';

export interface Usuario {
  id: number;
  nome: string;
  login: string;
}

/** Erro vindo da API, carregando o código HTTP junto da mensagem. */
export class ErroDaApi extends Error {
  status: number;

  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = 'ErroDaApi';
    this.status = status;
  }
}

// --- Token ------------------------------------------------------------------

export function lerToken(): string | null {
  return localStorage.getItem(CHAVE_TOKEN);
}

export function guardarToken(token: string): void {
  localStorage.setItem(CHAVE_TOKEN, token);
}

export function apagarToken(): void {
  localStorage.removeItem(CHAVE_TOKEN);
}

// --- Chamadas ---------------------------------------------------------------

/**
 * Faz a requisição, anexando o token quando existir, e transforma respostas
 * de erro em ErroDaApi — assim as telas só precisam usar try/catch.
 */
async function chamar<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const token = lerToken();

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opcoes.headers,
      },
    });
  } catch {
    // Nem chegou a receber resposta: backend desligado, sem rede, etc.
    throw new ErroDaApi(`Não consegui falar com o servidor (${API_URL}).`, 0);
  }

  const corpo: unknown = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const mensagem =
      corpo && typeof corpo === 'object' && 'erro' in corpo && typeof corpo.erro === 'string'
        ? corpo.erro
        : `Erro ${resposta.status} ao chamar o servidor.`;
    throw new ErroDaApi(mensagem, resposta.status);
  }

  return corpo as T;
}

export async function fazerLogin(
  login: string,
  senha: string
): Promise<{ token: string; usuario: Usuario }> {
  return chamar('/api/login', {
    method: 'POST',
    body: JSON.stringify({ login, senha }),
  });
}

/** Usa o token guardado para descobrir quem está logado. */
export async function buscarUsuarioLogado(): Promise<Usuario> {
  const resposta = await chamar<{ usuario: Usuario }>('/api/eu');
  return resposta.usuario;
}

// --- Transações -------------------------------------------------------------

export type TipoTransacao = 'GASTO' | 'GANHO';

/** PENDENTE = "A pagar"/"A receber". CONCLUIDA = o dinheiro já se moveu. */
export type StatusTransacao = 'PENDENTE' | 'CONCLUIDA';

/** Gasto que repete igual todo mês (FIXO) ou que varia (VARIAVEL). */
export type ClassificacaoGasto = 'FIXO' | 'VARIAVEL';

export interface Transacao {
  id: number;
  /** Sempre no formato "AAAA-MM-DD", sem hora e sem fuso. */
  data: string;
  /** O que foi: "Netflix", "Cabelo". A categoria diz de que grupo é. */
  descricao: string;
  valor: number;
  categoria: string;
  tipo: TipoTransacao;
  status: StatusTransacao;
  formaDePagamento: string | null;
  classificacao: ClassificacaoGasto | null;
  /** Nulos quando a compra foi à vista. */
  parcelaAtual: number | null;
  parcelasTotais: number | null;
  /** Liga entre si as parcelas da mesma compra. */
  grupoDeParcelas: string | null;
}

export interface NovaTransacao {
  data: string;
  descricao: string;
  /** Com parcelamento, é o valor de CADA parcela — não o total da compra. */
  valor: number;
  categoria: string;
  tipo: TipoTransacao;
  status: StatusTransacao;
  formaDePagamento?: string;
  classificacao?: ClassificacaoGasto | '';
  /** 1 (ou ausente) = à vista. Acima disso, o backend cria uma por mês. */
  parcelas?: number;
}

export interface FiltroTransacoes {
  /** Formato "AAAA-MM". */
  mes?: string;
  tipo?: TipoTransacao | '';
  status?: StatusTransacao | '';
}

export async function listarTransacoes(filtro: FiltroTransacoes = {}): Promise<Transacao[]> {
  const parametros = new URLSearchParams();
  if (filtro.mes) parametros.set('mes', filtro.mes);
  if (filtro.tipo) parametros.set('tipo', filtro.tipo);
  if (filtro.status) parametros.set('status', filtro.status);

  const consulta = parametros.toString();
  const resposta = await chamar<{ transacoes: Transacao[] }>(
    `/api/transacoes${consulta ? `?${consulta}` : ''}`
  );
  return resposta.transacoes;
}

/**
 * Cria um lançamento. Devolve uma LISTA porque um lançamento parcelado vira
 * várias transações de uma vez — uma por mês.
 */
export async function criarTransacao(nova: NovaTransacao): Promise<Transacao[]> {
  const resposta = await chamar<{ transacoes: Transacao[] }>('/api/transacoes', {
    method: 'POST',
    body: JSON.stringify(nova),
  });
  return resposta.transacoes;
}

/** Marca como pago/recebido, ou volta para pendente. */
export async function alterarStatusTransacao(
  id: number,
  status: StatusTransacao
): Promise<Transacao> {
  const resposta = await chamar<{ transacao: Transacao }>(`/api/transacoes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return resposta.transacao;
}

/**
 * Exclui um lançamento. Com `todasAsParcelas`, apaga a compra parcelada
 * inteira em vez de só a parcela apontada.
 */
export async function excluirTransacao(id: number, todasAsParcelas = false): Promise<number> {
  const resposta = await chamar<{ apagados: number }>(
    `/api/transacoes/${id}${todasAsParcelas ? '?todasAsParcelas=true' : ''}`,
    { method: 'DELETE' }
  );
  return resposta.apagados;
}

// --- Resumo do mês (Dashboard) ----------------------------------------------

export interface TotaisPorStatus {
  entradas: number;
  saidas: number;
}

/** Uma recorrência que ainda não virou lançamento no mês consultado. */
export interface RecorrenciaPrevista {
  id: number;
  descricao: string;
  categoria: string;
  tipo: TipoTransacao;
  formaDePagamento: string | null;
  classificacao: ClassificacaoGasto | null;
  diaDoMes: number;
  valor: number;
  /** Em que dia ela cai neste mês, "AAAA-MM-DD" — já encolhido em mês curto. */
  data: string;
}

export interface ResumoDoMes {
  /** Formato "AAAA-MM". */
  mes: string;
  /** Resultado acumulado de tudo que veio antes deste mês. */
  sobraDoMesAnterior: number;
  /** Lançamentos do mês MAIS as recorrências ainda não lançadas. */
  entradas: number;
  saidas: number;
  /** Entradas menos saídas do mês. Negativo quando se gastou mais do que entrou. */
  saldo: number;
  /** Sobra do mês anterior mais o saldo do mês: o que de fato resta. */
  disponivel: number;

  /** O que já se moveu de verdade. */
  realizado: TotaisPorStatus;
  /** Lançado, mas ainda "a pagar" / "a receber". */
  pendente: TotaisPorStatus;
  /** Recorrências que ainda nem viraram lançamento. Vazio em meses passados. */
  previsto: TotaisPorStatus;

  /** Quais recorrências compõem o `previsto`. */
  recorrenciasPrevistas: RecorrenciaPrevista[];
}

export interface GastoPorCategoria {
  categoria: string;
  total: number;
}

export interface GastosPorCategoria {
  mes: string;
  /** Já vem ordenado do maior para o menor pelo backend. */
  categorias: GastoPorCategoria[];
  total: number;
}

export interface GastoPorForma {
  /** "Cartão Nubank", "Pix"… ou "Não informado". */
  forma: string;
  total: number;
  /** Quanto desse total ainda não foi pago. */
  pendente: number;
}

export interface GastosPorFormaDePagamento {
  mes: string;
  /** Já vem ordenado da maior fatura para a menor. */
  formas: GastoPorForma[];
  total: number;
}

export async function buscarResumo(mes: string): Promise<ResumoDoMes> {
  return chamar(`/api/resumo?mes=${encodeURIComponent(mes)}`);
}

export async function buscarGastosPorCategoria(mes: string): Promise<GastosPorCategoria> {
  return chamar(`/api/resumo/categorias?mes=${encodeURIComponent(mes)}`);
}

export async function buscarGastosPorFormaDePagamento(
  mes: string
): Promise<GastosPorFormaDePagamento> {
  return chamar(`/api/resumo/formas-de-pagamento?mes=${encodeURIComponent(mes)}`);
}

// --- Recorrências -----------------------------------------------------------

export interface Recorrencia {
  id: number;
  descricao: string;
  valor: number;
  categoria: string;
  tipo: TipoTransacao;
  formaDePagamento: string | null;
  classificacao: ClassificacaoGasto | null;
  /** 1 a 31. Em mês mais curto, a projeção mostra o último dia. */
  diaDoMes: number;
  /** Desligada não conta na projeção, mas continua na lista. */
  ativa: boolean;
}

export interface NovaRecorrencia {
  descricao: string;
  valor: number;
  categoria: string;
  tipo: TipoTransacao;
  formaDePagamento?: string;
  classificacao?: ClassificacaoGasto | '';
  diaDoMes: number;
}

/**
 * As recorrências que ainda não viraram lançamento no mês — o que a tela de
 * Lançamentos mostra junto dos lançamentos de verdade.
 */
export async function listarPrevistas(mes: string): Promise<RecorrenciaPrevista[]> {
  const resposta = await chamar<{ previstas: RecorrenciaPrevista[] }>(
    `/api/recorrencias/previstas?mes=${encodeURIComponent(mes)}`
  );
  return resposta.previstas;
}

export async function listarRecorrencias(): Promise<Recorrencia[]> {
  const resposta = await chamar<{ recorrencias: Recorrencia[] }>('/api/recorrencias');
  return resposta.recorrencias;
}

export async function criarRecorrencia(nova: NovaRecorrencia): Promise<Recorrencia> {
  const resposta = await chamar<{ recorrencia: Recorrencia }>('/api/recorrencias', {
    method: 'POST',
    body: JSON.stringify(nova),
  });
  return resposta.recorrencia;
}

/** Liga ou desliga a recorrência sem apagá-la. */
export async function alternarRecorrencia(id: number, ativa: boolean): Promise<Recorrencia> {
  const resposta = await chamar<{ recorrencia: Recorrencia }>(`/api/recorrencias/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ativa }),
  });
  return resposta.recorrencia;
}

export async function excluirRecorrencia(id: number): Promise<void> {
  await chamar(`/api/recorrencias/${id}`, { method: 'DELETE' });
}

/**
 * Transforma a previsão de um mês num lançamento de verdade, guardando de qual
 * recorrência ele nasceu. É esse vínculo que faz a previsão parar de contar no
 * balanço, em vez de a conta aparecer duas vezes.
 *
 * `valor` é opcional: contas de consumo variam todo mês.
 */
export async function lancarRecorrencia(
  id: number,
  mes: string,
  valor?: number
): Promise<Transacao> {
  const resposta = await chamar<{ transacao: Transacao }>(`/api/recorrencias/${id}/lancar`, {
    method: 'POST',
    body: JSON.stringify(valor === undefined ? { mes } : { mes, valor }),
  });
  return resposta.transacao;
}

// --- Projeção ---------------------------------------------------------------

/** Uma recorrência já posicionada num mês da projeção. */
export interface ItemProjetado {
  id: number;
  descricao: string;
  categoria: string;
  valor: number;
  tipo: TipoTransacao;
  /** Data prevista "AAAA-MM-DD", já ajustada em meses mais curtos. */
  data: string;
}

export interface OrigemDoTotal {
  entradas: number;
  saidas: number;
}

export interface MesProjetado {
  /** Formato "AAAA-MM". */
  mes: string;
  entradas: number;
  saidas: number;
  saldo: number;
  /** De onde veio cada parte do total — útil para conferir um mês estranho. */
  deRecorrencias: OrigemDoTotal;
  deLancamentos: OrigemDoTotal;
  /** Saldo deste mês somado ao de todos os meses anteriores da projeção. */
  saldoAcumulado: number;
  itens: ItemProjetado[];
}

export interface Projecao {
  inicio: string;
  meses: MesProjetado[];
}

/**
 * Busca a projeção. Sem parâmetros, o backend devolve os 6 meses a partir do
 * mês que vem — o mês corrente é assunto do Dashboard.
 */
export async function buscarProjecao(inicio?: string, meses?: number): Promise<Projecao> {
  const parametros = new URLSearchParams();
  if (inicio) parametros.set('inicio', inicio);
  if (meses) parametros.set('meses', String(meses));

  const consulta = parametros.toString();
  return chamar(`/api/projecao${consulta ? `?${consulta}` : ''}`);
}

// --- Investimentos ----------------------------------------------------------

export interface Investimento {
  id: number;
  /** Código na fonte de cotação: PETR4.SA, BTC-USD. */
  ativo: string;
  apelido: string | null;
  /** "AAAA-MM-DD". */
  dataDaCompra: string;
  quantidade: number;
  /** O total desembolsado na compra, em reais. */
  valorPago: number;

  /** Preço de uma unidade, já convertido para reais. Null se a fonte falhou. */
  cotacao: number | null;
  /** Moeda em que o ativo é cotado na origem. */
  moedaOriginal: string | null;
  /** O preço antes da conversão. */
  precoOriginal: number | null;
  /** Taxa usada na conversão; null quando o ativo já cotava em reais. */
  cambio: number | null;

  /** Valor pago dividido pela quantidade. */
  precoMedio: number;
  /** Quanto a posição vale agora. Null sem cotação. */
  valorAtual: number | null;
  /** Valor atual menos valor pago. Negativo é prejuízo. */
  lucro: number | null;
  /** O lucro como fração do que foi pago (0.15 = +15%). */
  variacao: number | null;
}

export interface TotalDaCarteira {
  valorPago: number;
  valorAtual: number;
  lucro: number;
  variacao: number | null;
  /** Quantas posições ficaram sem cotação — elas não entram no total. */
  semCotacao: number;
}

export interface Carteira {
  investimentos: Investimento[];
  total: TotalDaCarteira;
  /** True quando algum ativo não teve preço — os números estão incompletos. */
  cotacaoIndisponivel: boolean;
}

export interface NovoInvestimento {
  ativo: string;
  apelido?: string;
  dataDaCompra: string;
  quantidade: number;
  valorPago: number;
}

/** A carteira com cotação buscada ao vivo. Nada de preço fica guardado. */
export async function buscarCarteira(): Promise<Carteira> {
  return chamar('/api/investimentos');
}

export async function criarInvestimento(novo: NovoInvestimento): Promise<void> {
  await chamar('/api/investimentos', {
    method: 'POST',
    body: JSON.stringify(novo),
  });
}

export async function excluirInvestimento(id: number): Promise<void> {
  await chamar(`/api/investimentos/${id}`, { method: 'DELETE' });
}
