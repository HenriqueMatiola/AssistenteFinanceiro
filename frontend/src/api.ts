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

export interface Transacao {
  id: number;
  /** Sempre no formato "AAAA-MM-DD", sem hora e sem fuso. */
  data: string;
  valor: number;
  categoria: string;
  tipo: TipoTransacao;
}

export interface NovaTransacao {
  data: string;
  valor: number;
  categoria: string;
  tipo: TipoTransacao;
}

export interface FiltroTransacoes {
  /** Formato "AAAA-MM". */
  mes?: string;
  tipo?: TipoTransacao | '';
}

export async function listarTransacoes(filtro: FiltroTransacoes = {}): Promise<Transacao[]> {
  const parametros = new URLSearchParams();
  if (filtro.mes) parametros.set('mes', filtro.mes);
  if (filtro.tipo) parametros.set('tipo', filtro.tipo);

  const consulta = parametros.toString();
  const resposta = await chamar<{ transacoes: Transacao[] }>(
    `/api/transacoes${consulta ? `?${consulta}` : ''}`
  );
  return resposta.transacoes;
}

export async function criarTransacao(nova: NovaTransacao): Promise<Transacao> {
  const resposta = await chamar<{ transacao: Transacao }>('/api/transacoes', {
    method: 'POST',
    body: JSON.stringify(nova),
  });
  return resposta.transacao;
}

// --- Resumo do mês (Dashboard) ----------------------------------------------

export interface ResumoDoMes {
  /** Formato "AAAA-MM". */
  mes: string;
  entradas: number;
  saidas: number;
  /** Entradas menos saídas. Negativo quando se gastou mais do que entrou. */
  saldo: number;
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

export async function buscarResumo(mes: string): Promise<ResumoDoMes> {
  return chamar(`/api/resumo?mes=${encodeURIComponent(mes)}`);
}

export async function buscarGastosPorCategoria(mes: string): Promise<GastosPorCategoria> {
  return chamar(`/api/resumo/categorias?mes=${encodeURIComponent(mes)}`);
}
