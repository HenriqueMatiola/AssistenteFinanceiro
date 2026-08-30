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
  /** Nulo nas contas criadas antes de o cadastro pedir e-mail. */
  email: string | null;
  /** Data URI da foto de perfil. Nulo quando ainda não há foto. */
  foto: string | null;
  /**
   * Falso em quem entra só pelo Google: a conta nunca escolheu senha. A tela
   * de Perfil usa isto para não oferecer um "trocar senha" sem o que trocar.
   */
  temSenha: boolean;
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

  /*
   * 401 significa que o token expirou (ele vale 7 dias) ou foi invalidado.
   * Sem este tratamento, todas as telas passariam a mostrar "Erro 401" e a
   * única saída seria clicar em Sair — um beco sem saída para quem não sabe
   * o que é um token. Aqui a sessão é descartada e o app volta ao login.
   */
  if (resposta.status === 401 && lerToken()) {
    apagarToken();
    window.location.reload();
  }

  if (!resposta.ok) {
    const mensagem =
      corpo && typeof corpo === 'object' && 'erro' in corpo && typeof corpo.erro === 'string'
        ? corpo.erro
        : `Erro ${resposta.status} ao chamar o servidor.`;
    throw new ErroDaApi(mensagem, resposta.status);
  }

  return corpo as T;
}

export interface Sessao {
  token: string;
  usuario: Usuario;
}

/** `identificador` é o nome de usuário OU o e-mail — o backend aceita os dois. */
export async function fazerLogin(identificador: string, senha: string): Promise<Sessao> {
  return chamar('/api/login', {
    method: 'POST',
    body: JSON.stringify({ login: identificador, senha }),
  });
}

/**
 * Entra com o Google — e cria a conta na primeira vez, sem passo separado.
 *
 * `credencial` é o token assinado que o botão do Google devolve. Ele vai
 * inteiro para o backend, que confere a assinatura com o próprio Google: o
 * que chega aqui no navegador não vale como prova de nada.
 */
export async function entrarComGoogle(credencial: string): Promise<Sessao> {
  return chamar('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credencial }),
  });
}

/**
 * Cria a conta e já devolve a sessão pronta: quem se cadastrou entra direto,
 * em vez de digitar as mesmas credenciais de novo na tela ao lado.
 */
export async function criarConta(dados: {
  login: string;
  email: string;
  senha: string;
}): Promise<Sessao> {
  return chamar('/api/cadastro', {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

/** Usa o token guardado para descobrir quem está logado. */
export async function buscarUsuarioLogado(): Promise<Usuario> {
  const resposta = await chamar<{ usuario: Usuario }>('/api/eu');
  return resposta.usuario;
}

// --- Perfil -----------------------------------------------------------------

/**
 * Muda o que veio, e só isso: mandar apenas `{ nome }` não apaga o e-mail.
 * `foto: null` tira a foto e devolve as iniciais.
 */
export interface MudancasNoPerfil {
  nome?: string;
  email?: string;
  foto?: string | null;
}

export async function atualizarPerfil(mudancas: MudancasNoPerfil): Promise<Usuario> {
  const resposta = await chamar<{ usuario: Usuario }>('/api/perfil', {
    method: 'PATCH',
    body: JSON.stringify(mudancas),
  });
  return resposta.usuario;
}

/** A senha atual é exigida mesmo com sessão aberta — veja a rota. */
export async function trocarSenha(senhaAtual: string, novaSenha: string): Promise<void> {
  await chamar('/api/perfil/senha', {
    method: 'PATCH',
    body: JSON.stringify({ senhaAtual, novaSenha }),
  });
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
  /** Dinheiro que veio do mês passado, e não receita nova do mês. */
  ehSobraDoMesAnterior: boolean;
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
  /** Marca o lançamento como o saldo que veio do mês passado. */
  ehSobraDoMesAnterior?: boolean;
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

export type TipoDeOperacao = 'COMPRA' | 'VENDA';

/** Em que cesta o ativo entra no resumo da carteira. */
export type ClasseDeAtivo = 'ACAO' | 'FII' | 'CRIPTO' | 'ETF' | 'OUTRO';

/** Uma compra ou venda registrada. */
export interface Operacao {
  id: number;
  ativo: string;
  classe: ClasseDeAtivo;
  tipo: TipoDeOperacao;
  /** "AAAA-MM-DD". */
  data: string;
  quantidade: number;
  /** O que saiu do bolso (compra) ou entrou nele (venda). */
  valor: number;
}

/** A posição atual num ativo, somando todas as operações dele. */
export interface AtivoNaCarteira {
  ativo: string;
  classe: ClasseDeAtivo;
  /** O que ainda está em carteira. Zero quando tudo foi vendido. */
  quantidade: number;
  /** Quanto já saiu, somando as vendas. */
  quantidadeVendida: number;
  /** Custo do que ainda está em carteira. */
  investido: number;
  /** Custo por unidade do que resta. */
  precoMedio: number;
  /** Resultado das vendas já feitas — dinheiro que já entrou. */
  lucroRealizado: number;

  /** Preço de uma unidade, já convertido para reais. Null se a fonte falhou. */
  cotacao: number | null;
  moedaOriginal: string | null;
  precoOriginal: number | null;
  /** Taxa usada na conversão; null quando o ativo já cotava em reais. */
  cambio: number | null;

  valorAtual: number | null;
  /** Lucro "no papel": o que se ganharia vendendo tudo agora. */
  lucro: number | null;
  variacao: number | null;
}

export interface ResumoDeClasse {
  classe: ClasseDeAtivo;
  investido: number;
  valorAtual: number;
  lucro: number;
  variacao: number | null;
  ativos: number;
}

export interface TotalDaCarteira {
  valorPago: number;
  valorAtual: number;
  lucro: number;
  variacao: number | null;
  /** Quantas posições ficaram sem cotação — elas não entram no total. */
  semCotacao: number;
  /** Somado de todas as vendas, inclusive de ativos que já saíram. */
  lucroRealizado: number;
}

export interface Carteira {
  ativos: AtivoNaCarteira[];
  porClasse: ResumoDeClasse[];
  total: TotalDaCarteira;
  /** True quando algum ativo não teve preço — os números estão incompletos. */
  cotacaoIndisponivel: boolean;
}

export interface NovaOperacao {
  ativo: string;
  classe?: ClasseDeAtivo | '';
  tipo: TipoDeOperacao;
  data: string;
  quantidade: number;
  valor: number;
}

export interface FiltroDeOperacoes {
  /** Formato "AAAA-MM". */
  mes?: string;
  tipo?: TipoDeOperacao | '';
}

/** A carteira com cotação buscada ao vivo. Nada de preço fica guardado. */
export async function buscarCarteira(): Promise<Carteira> {
  return chamar('/api/investimentos');
}

/** O histórico de compras e vendas. */
export async function listarOperacoes(filtro: FiltroDeOperacoes = {}): Promise<Operacao[]> {
  const parametros = new URLSearchParams();
  if (filtro.mes) parametros.set('mes', filtro.mes);
  if (filtro.tipo) parametros.set('tipo', filtro.tipo);

  const consulta = parametros.toString();
  const resposta = await chamar<{ operacoes: Operacao[] }>(
    `/api/investimentos/operacoes${consulta ? `?${consulta}` : ''}`
  );
  return resposta.operacoes;
}

export async function registrarOperacao(nova: NovaOperacao): Promise<void> {
  await chamar('/api/investimentos', {
    method: 'POST',
    body: JSON.stringify(nova),
  });
}

export async function excluirOperacao(id: number): Promise<void> {
  await chamar(`/api/investimentos/${id}`, { method: 'DELETE' });
}
