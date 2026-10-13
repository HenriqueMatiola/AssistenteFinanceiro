import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowCounterClockwise,
  Check,
  CheckCircle,
  ClockCountdown,
  Minus,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import {
  alterarStatusDeVarias,
  alterarStatusTransacao,
  criarTransacao,
  editarTransacao,
  excluirTransacao,
  excluirVarias,
  lancarRecorrencia,
  listarPrevistas,
  listarTransacoes,
  type ClassificacaoGasto,
  type RecorrenciaPrevista,
  type StatusTransacao,
  type TipoTransacao,
  type Transacao,
} from '../api.ts';
import {
  formatarEntradaMonetaria,
  formatarData,
  formatarDinheiro,
  formatarMes,
  numeroDaEntradaMonetaria,
  hojeISO,
  rotuloDaAcaoDeStatus,
  rotuloDaParcela,
  rotuloDoStatus,
} from '../formato.ts';
import SelectPersonalizado from '../componentes/SelectPersonalizado.tsx';
import CampoComSugestoes from '../componentes/CampoComSugestoes.tsx';
import SeletorDeData from '../componentes/SeletorDeData.tsx';
import { useSugestoes } from '../useSugestoes.ts';
import TituloOrdenavel, {
  ordenarPor,
  proximaOrdenacao,
  type Ordenacao,
} from '../componentes/TituloOrdenavel.tsx';
import AvisoTemporario, { useAvisoTemporario } from '../componentes/AvisoTemporario.tsx';

// Ganhos entram apenas por estes três caminhos, e por isso continuam numa
// lista FECHADA (um select, não um campo de digitar): sem ela, os relatórios
// fragmentariam "depósito" em meia dúzia de grafias.
//
// Categoria e forma de PAGAMENTO são o oposto — campo livre, sem lista de
// fábrica. O que cada pessoa usa aparece ali conforme ela lança.
const FORMAS_DE_RECEBIMENTO = ['Pix', 'Dinheiro', 'Depósito em conta'] as const;

/**
 * A lista mistura duas coisas: lançamentos de verdade e contas previstas pelas
 * recorrências, que ainda não foram lançadas. Elas aparecem juntas porque, na
 * hora de fechar o mês, o que importa é a conta — não de onde ela veio.
 */
type ItemDaLista =
  | { chave: string; data: string; especie: 'lancamento'; transacao: Transacao }
  | { chave: string; data: string; especie: 'previsao'; previsao: RecorrenciaPrevista };

/**
 * O que o formulário está registrando. "SOBRA" não é um tipo de transação no
 * banco — é um GANHO com a marca de sobra —, mas na tela ele é uma escolha
 * irmã de gasto e ganho, porque para quem lança é outra coisa que se faz.
 */
type TipoDoFormulario = TipoTransacao | 'SOBRA';

/** Descrição e categoria de uma sobra, para não pedi-las a quem lança. */
const DESCRICAO_DA_SOBRA = 'Sobra do mês anterior';
const CATEGORIA_DA_SOBRA = 'Sobra';

/** As colunas que se ordenam clicando no título. Ações fica de fora. */
type ColunaOrdenavel =
  | 'compra'
  | 'vencimento'
  | 'descricao'
  | 'categoria'
  | 'pagamento'
  | 'valor'
  | 'situacao';

/**
 * O que cada linha tem naquela coluna, já pronto para comparar.
 *
 * - Previsão não tem data de compra: ela ainda não aconteceu. Usa a data em
 *   que cai, que é a mesma que ela recebe ao ser lançada.
 * - Valor é comparado SEM o sinal: "do menor para o maior" é do lançamento
 *   pequeno ao grande, seja gasto ou ganho. Com sinal, o maior gasto (o mais
 *   negativo) viria primeiro na ordem crescente, que não é o que se espera.
 * - Situação vira número para o pendente vir antes do pago na crescente.
 */
function valorDaColuna(item: ItemDaLista, coluna: ColunaOrdenavel): string | number | null {
  if (item.especie === 'previsao') {
    const p = item.previsao;
    switch (coluna) {
      case 'compra':
      case 'vencimento':
        return p.data;
      case 'descricao':
        return p.descricao;
      case 'categoria':
        return p.categoria;
      case 'pagamento':
        return p.formaDePagamento;
      case 'valor':
        return p.valor;
      case 'situacao':
        return 0;
    }
  }

  const t = item.transacao;
  switch (coluna) {
    case 'compra':
      return t.data;
    case 'vencimento':
      return t.vencimento ?? t.data;
    case 'descricao':
      return t.descricao;
    case 'categoria':
      return t.categoria;
    case 'pagamento':
      return t.formaDePagamento;
    case 'valor':
      return t.valor;
    case 'situacao':
      return t.status === 'PENDENTE' ? 0 : 1;
  }
}

interface Props {
  /** Mês em foco, escolhido na trilha do topo. Formato "AAAA-MM". */
  mes: string;
  /** Usado quando um lançamento cai fora do mês em foco. */
  aoTrocarMes: (mes: string) => void;
}

function Lancamentos({ mes, aoTrocarMes }: Props) {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [previstas, setPrevistas] = useState<RecorrenciaPrevista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);

  // Filtros
  const [tipoFiltrado, setTipoFiltrado] = useState<TipoTransacao | ''>('');
  const [statusFiltrado, setStatusFiltrado] = useState<StatusTransacao | ''>('');

  // Ordenação pelos títulos da tabela. Fica no navegador: reordenar o que já
  // chegou não precisa de outra viagem ao backend.
  // `null` é a ordem de extrato: do vencimento mais recente ao mais antigo.
  const [ordenacao, setOrdenacao] = useState<Ordenacao<ColunaOrdenavel>>(null);

  /*
   * Linhas marcadas para as ações em lote, pela `chave` de cada item ("t12"
   * para lançamento, "p3" para previsão). Chave, e não id, porque um
   * lançamento e uma previsão podem ter o mesmo número.
   */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [processandoLote, setProcessandoLote] = useState(false);
  const caixaDeTodos = useRef<HTMLInputElement>(null);

  /*
   * O lançamento que o formulário lá de cima está editando. Nulo = o
   * formulário está criando um novo, como sempre foi.
   */
  const [emEdicao, setEmEdicao] = useState<Transacao | null>(null);
  const cartaoDoFormulario = useRef<HTMLElement>(null);
  const campoDeDescricao = useRef<HTMLInputElement>(null);

  // Formulário
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hojeISO());
  /**
   * Quando o dinheiro vai sair ou entrar, se não for no dia do lançamento.
   * Vazio quer dizer "no mesmo dia" — o caso comum.
   */
  const [vencimento, setVencimento] = useState("");

  /*
   * As opções já usadas nos campos de categoria e forma de pagamento.
   *
   * A lista nasce vazia e cresce conforme se lança — quem guarda é o backend,
   * ao receber um valor que ainda não conhecia. Daí o `recarregar` logo depois
   * de criar: é o que faz a categoria recém-digitada já aparecer na lista.
   */
  const { sugestoes, excluir: excluirSugestao, recarregar: recarregarSugestoes } = useSugestoes();
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipo, setTipo] = useState<TipoDoFormulario>('GASTO');
  // Nasce pendente: o uso comum é planejar o mês e ir marcando o que saiu.
  const [status, setStatus] = useState<StatusTransacao>('PENDENTE');
  const [formaDePagamento, setFormaDePagamento] = useState('');
  const [classificacao, setClassificacao] = useState<ClassificacaoGasto | ''>('');
  const [parcelas, setParcelas] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);
  const [aviso, setAviso] = useAvisoTemporario();

  // Id da recorrência sendo lançada, para desabilitar só o botão dela.
  const [lancando, setLancando] = useState<number | null>(null);

  // Muda quando queremos recarregar sem que os filtros tenham mudado
  // (por exemplo, logo depois de criar um lançamento).
  const [versaoDaLista, setVersaoDaLista] = useState(0);

  const ehSobra = tipo === 'SOBRA';

  // Uma sobra do mês passado é um valor único e já realizado: parcelar,
  // classificar como fixo/variável ou dizer a forma de pagamento não se
  // aplicam a ela.
  // Na edição também: o parcelamento se decide ao criar a compra, e mudar o
  // número de parcelas depois exigiria criar ou apagar as irmãs.
  const quantidadeDeParcelas = ehSobra || emEdicao ? 1 : Number(parcelas) || 1;
  const ehParcelado = quantidadeDeParcelas > 1;

  // Uma conta prevista é, por definição, uma conta que ainda não aconteceu.
  // Filtrando por "pago/recebido", não há previsão que se qualifique.
  const mostrarPrevisoes = statusFiltrado !== 'CONCLUIDA';

  useEffect(() => {
    // Se os filtros mudarem antes da resposta chegar, esta flag descarta o
    // resultado atrasado — senão uma busca antiga poderia sobrescrever a nova.
    let cancelado = false;

    Promise.all([
      listarTransacoes({ mes, tipo: tipoFiltrado, status: statusFiltrado }),
      mostrarPrevisoes ? listarPrevistas(mes) : Promise.resolve([]),
    ])
      .then(([lista, contasPrevistas]) => {
        if (cancelado) return;
        setTransacoes(lista);
        setPrevistas(contasPrevistas);
        setErroDaLista(null);

        // A seleção guarda só o que continua na tela. Sem isto, trocar de mês
        // e voltar traria linhas marcadas que a pessoa já nem lembrava — e uma
        // exclusão em lote apagaria o que ela não está vendo.
        const chavesNaTela = new Set([
          ...lista.map((t) => `t${t.id}`),
          ...contasPrevistas.map((p) => `p${p.id}`),
        ]);
        setSelecionados((atual) => new Set([...atual].filter((c) => chavesNaTela.has(c))));
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setErroDaLista(e instanceof Error ? e.message : 'Não consegui carregar os lançamentos.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [mes, tipoFiltrado, statusFiltrado, versaoDaLista, mostrarPrevisoes]);

  function trocarTipoFiltrado(novoTipo: TipoTransacao | '') {
    setCarregando(true);
    setTipoFiltrado(novoTipo);
  }

  function trocarStatusFiltrado(novoStatus: StatusTransacao | '') {
    setCarregando(true);
    setStatusFiltrado(novoStatus);
  }

  function alternarOrdenacao(coluna: ColunaOrdenavel) {
    setOrdenacao((atual) => proximaOrdenacao(atual, coluna));
  }

  function mudarTipo(novoTipo: TipoDoFormulario) {
    setTipo(novoTipo);

    if (
      novoTipo === 'GANHO' &&
      !FORMAS_DE_RECEBIMENTO.includes(
        formaDePagamento as (typeof FORMAS_DE_RECEBIMENTO)[number]
      )
    ) {
      setFormaDePagamento('Pix');
    }
  }

  function mudarQuantidadeDeParcelas(diferenca: number) {
    const atual = Number(parcelas) || 1;
    setParcelas(String(Math.min(60, Math.max(1, atual + diferenca))));
  }

  function digitarQuantidadeDeParcelas(texto: string) {
    const digitos = texto.replace(/\D/g, '');
    if (!digitos) {
      setParcelas('');
      return;
    }
    setParcelas(String(Math.min(60, Math.max(1, Number(digitos)))));
  }

  function recarregarLista() {
    setCarregando(true);
    setVersaoDaLista((n) => n + 1);
  }

  /** Volta o formulário a um lançamento novo, do zero. */
  function limparFormulario() {
    setEmEdicao(null);
    setDescricao('');
    setData(hojeISO());
    setVencimento('');
    setValor('');
    setCategoria('');
    setTipo('GASTO');
    setStatus('PENDENTE');
    setFormaDePagamento('');
    setClassificacao('');
    setParcelas('1');
    setErroDoFormulario(null);
  }

  /**
   * Carrega o lançamento clicado no formulário lá de cima e rola até ele.
   * O que estava digitado ali é substituído — é o preço de reaproveitar o
   * mesmo formulário em vez de abrir um segundo só para editar.
   */
  function comecarEdicao(transacao: Transacao) {
    setEmEdicao(transacao);
    setDescricao(transacao.descricao);
    setData(transacao.data);
    setVencimento(transacao.vencimento ?? '');
    // "450.00" → "R$ 450,00": a mesma máscara que a digitação usa.
    setValor(formatarEntradaMonetaria(transacao.valor.toFixed(2)));
    setCategoria(transacao.categoria);
    setTipo(transacao.ehSobraDoMesAnterior ? 'SOBRA' : transacao.tipo);
    setStatus(transacao.status);
    setFormaDePagamento(transacao.formaDePagamento ?? '');
    setClassificacao(transacao.classificacao ?? '');
    setParcelas('1');
    setErroDoFormulario(null);
    setAviso(null);

    cartaoDoFormulario.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // `preventScroll`: o foco não briga com a rolagem suave que já começou.
    campoDeDescricao.current?.focus({ preventScroll: true });
  }

  // --- Seleção e ações em lote ------------------------------------------

  function alternarSelecao(chave: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErroDoFormulario(null);
    setAviso(null);
    setSalvando(true);

    try {
      const valorNumerico = numeroDaEntradaMonetaria(valor);

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        throw new Error('Informe um valor maior que zero.');
      }

      /*
       * Numa sobra, o formulário pede só o valor. O resto vem daqui:
       * - descrição e categoria são fixas, porque só existe uma coisa que
       *   um lançamento desses pode ser;
       * - a data é o dia 1 do mês aberto na trilha, que é o mês a que a
       *   sobra pertence;
       * - ela nasce concluída, porque é dinheiro que já está na conta.
       */
      //
      // Na edição, o "mês da sobra" é o do próprio lançamento, e não o da
      // trilha — editar o valor não pode empurrá-lo para outro mês.
      const dataUsada = ehSobra ? `${(emEdicao ? data : mes).slice(0, 7)}-01` : data;
      // Sobra não tem vencimento: ela é dinheiro que JÁ está na conta.
      const vencimentoUsado = ehSobra ? '' : vencimento;

      const dados = {
        data: dataUsada,
        vencimento: vencimentoUsado || undefined,
        descricao: ehSobra ? DESCRICAO_DA_SOBRA : descricao,
        valor: valorNumerico,
        categoria: ehSobra ? CATEGORIA_DA_SOBRA : categoria,
        tipo: ehSobra ? ('GANHO' as const) : tipo,
        status: ehSobra ? ('CONCLUIDA' as const) : status,
        formaDePagamento: ehSobra ? undefined : formaDePagamento || undefined,
        classificacao: !ehSobra && tipo === 'GASTO' ? classificacao : ('' as const),
        ehSobraDoMesAnterior: ehSobra,
      };

      const criadas = emEdicao
        ? [await editarTransacao(emEdicao.id, dados)]
        : await criarTransacao({ ...dados, parcelas: quantidadeDeParcelas });

      if (emEdicao) {
        setAviso(`"${dados.descricao}" atualizado.`);
        setEmEdicao(null);
      } else if (criadas.length > 1) {
        // Só as parcelas do mês em foco aparecem na lista; sem este aviso,
        // parece que 11 delas se perderam.
        // Nas parcelas com vencimento, a data da compra é a mesma em todas —
        // quem anda de mês em mês é o vencimento. O aviso tem que contar o
        // intervalo que a pessoa reconhece, que é o das cobranças.
        const quando = (t: Transacao | undefined) => t?.vencimento ?? t?.data ?? data;

        setAviso(
          `${criadas.length} parcelas criadas, de ${formatarData(quando(criadas[0]))} ` +
            `a ${formatarData(quando(criadas.at(-1)))}.`
        );
      }

      if (emEdicao) {
        // Data, tipo e forma vieram do lançamento editado; deixá-los no
        // formulário faria o próximo lançamento novo herdar o que era dele.
        limparFormulario();
      } else {
        // Limpa só o que muda de um lançamento para o outro; data, tipo e forma
        // de pagamento costumam se repetir quando se lança vários seguidos.
        setDescricao('');
        setValor('');
        setCategoria('');
        setParcelas('1');
        setVencimento('');
      }
      // A categoria e a forma recém-digitadas acabaram de virar opção no
      // backend; isto é o que as traz para a lista sem recarregar a página.
      recarregarSugestoes();

      /*
       * Se o lançamento caiu fora do mês em foco, mostra o mês dele para que
       * ele não "suma" logo depois de ser criado.
       *
       * Com vencimento, o mês é o DELE: lançar hoje uma conta que vence mês
       * que vem leva a tela para o mês que vem, que é onde ela está.
       */
      const mesDoLancamento = (vencimentoUsado || dataUsada).slice(0, 7);
      if (mesDoLancamento !== mes) {
        setCarregando(true);
        aoTrocarMes(mesDoLancamento);
      } else {
        recarregarLista();
      }
    } catch (e) {
      setErroDoFormulario(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoAlternarStatus(transacao: Transacao) {
    setErroDaLista(null);
    try {
      const novoStatus = transacao.status === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA';
      await alterarStatusTransacao(transacao.id, novoStatus);
      // Se ele está aberto no formulário, a situação de lá também muda —
      // senão salvar a edição desfaria o clique que acabou de acontecer.
      if (emEdicao?.id === transacao.id) setStatus(novoStatus);
      recarregarLista();
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui atualizar.');
    }
  }

  /**
   * Converte a conta prevista num lançamento de verdade, já marcado como pago.
   * O total do mês não muda: a previsão já contava no balanço.
   */
  async function aoLancarPrevisao(previsao: RecorrenciaPrevista) {
    setErroDaLista(null);
    setLancando(previsao.id);

    try {
      await lancarRecorrencia(previsao.id, mes);
      recarregarLista();
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui lançar a conta.');
    } finally {
      setLancando(null);
    }
  }

  async function aoExcluir(transacao: Transacao) {
    const parcelado = transacao.grupoDeParcelas !== null;

    // Numa compra parcelada, apagar só a parcela do mês quase nunca é o que se
    // quer — mas apagar as 12 sem perguntar seria pior.
    let todasAsParcelas = false;

    if (parcelado) {
      const rotulo = rotuloDaParcela(transacao.parcelaAtual, transacao.parcelasTotais);
      todasAsParcelas = window.confirm(
        `"${transacao.descricao}" é a parcela ${rotulo}.\n\n` +
          'OK apaga a compra inteira (todas as parcelas).\n' +
          'Cancelar apaga só esta parcela.'
      );
    } else if (!window.confirm(`Apagar "${transacao.descricao}"?`)) {
      return;
    }

    setErroDaLista(null);
    try {
      const apagados = await excluirTransacao(transacao.id, todasAsParcelas);
      if (apagados > 1) {
        setAviso(`${apagados} parcelas apagadas.`);
      }
      // Editar algo que não existe mais terminaria num 404 ao salvar.
      if (
        emEdicao &&
        (emEdicao.id === transacao.id ||
          (todasAsParcelas && emEdicao.grupoDeParcelas === transacao.grupoDeParcelas))
      ) {
        limparFormulario();
      }
      recarregarLista();
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui excluir.');
    }
  }

  // Junta lançamentos e previsões numa lista só, ordenada por data como
  // qualquer extrato. O filtro de tipo vale para as duas origens; o de
  // situação já foi aplicado ao decidir se buscava previsões.
  const itens: ItemDaLista[] = [
    ...transacoes.map(
      (t): ItemDaLista => ({
        chave: `t${t.id}`,
        // Ordena pela data que MANDA: a compra de outubro paga em novembro
        // aparece junto das outras contas de novembro.
        data: t.vencimento ?? t.data,
        especie: 'lancamento',
        transacao: t,
      })
    ),
    ...previstas
      .filter((p) => !tipoFiltrado || p.tipo === tipoFiltrado)
      .map(
        (p): ItemDaLista => ({
          chave: `p${p.id}`,
          data: p.data,
          especie: 'previsao',
          previsao: p,
        })
      ),
  ].sort((a, b) => b.data.localeCompare(a.data));

  // A ordem por data acima é a base; a do título clicado é aplicada por cima.
  // Empate mantém a ordem por data: duas compras no "Mercado" seguem em ordem de dia.
  const itensOrdenados = ordenarPor(itens, ordenacao, valorDaColuna);

  const quantidadePrevista = itens.filter((i) => i.especie === 'previsao').length;

  /*
   * O que está selecionado, separado pelo que cada ação consegue fazer.
   * Uma seleção misturada é normal: cada botão conta e age só sobre as
   * linhas em que ele faz sentido.
   */
  const itensSelecionados = itens.filter((i) => selecionados.has(i.chave));
  const transacoesSelecionadas = itensSelecionados.flatMap((i) =>
    i.especie === 'lancamento' ? [i.transacao] : []
  );
  const previsoesSelecionadas = itensSelecionados.flatMap((i) =>
    i.especie === 'previsao' ? [i.previsao] : []
  );
  const pendentesSelecionadas = transacoesSelecionadas.filter((t) => t.status === 'PENDENTE');
  const concluidasSelecionadas = transacoesSelecionadas.filter((t) => t.status === 'CONCLUIDA');
  // Previsão entra no "marcar pago" (vira lançamento), mas não no excluir:
  // ela é uma recorrência, e quem a desliga é a aba Recorrências.
  const quantidadeAConcluir = pendentesSelecionadas.length + previsoesSelecionadas.length;

  const todosSelecionados = itens.length > 0 && itensSelecionados.length === itens.length;
  const algunsSelecionados = itensSelecionados.length > 0 && !todosSelecionados;

  // "Parcialmente marcado" não existe como atributo de HTML, só como
  // propriedade do elemento — por isso o ref, em vez de uma prop do JSX.
  useEffect(() => {
    if (caixaDeTodos.current) caixaDeTodos.current.indeterminate = algunsSelecionados;
  }, [algunsSelecionados]);

  function alternarTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set(itens.map((i) => i.chave)));
  }

  /** O rótulo segue o que está marcado: só gastos, só ganhos, ou os dois. */
  const temGanhoAConcluir = [...pendentesSelecionadas, ...previsoesSelecionadas].some(
    (x) => x.tipo === 'GANHO'
  );
  const temGastoAConcluir = [...pendentesSelecionadas, ...previsoesSelecionadas].some(
    (x) => x.tipo === 'GASTO'
  );
  const rotuloDeConcluir =
    temGanhoAConcluir && temGastoAConcluir
      ? 'Marcar pago/recebido'
      : temGanhoAConcluir
        ? 'Marcar recebido'
        : 'Marcar pago';

  /**
   * Roda uma ação em lote: trava os botões, limpa a seleção no fim e
   * recarrega a lista mesmo se der erro no meio — parte pode ter mudado.
   */
  async function emLote(acao: () => Promise<string | null>) {
    setErroDaLista(null);
    setAviso(null);
    setProcessandoLote(true);
    try {
      const mensagem = await acao();
      if (mensagem) setAviso(mensagem);
      setSelecionados(new Set());
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui concluir a ação.');
    } finally {
      setProcessandoLote(false);
      recarregarLista();
    }
  }

  function concluirSelecionados() {
    return emLote(async () => {
      const ids = pendentesSelecionadas.map((t) => t.id);
      if (ids.length > 0) await alterarStatusDeVarias(ids, 'CONCLUIDA');

      // Previsões não têm rota em lote: cada uma vira lançamento pela rota de
      // sempre. Uma depois da outra, para um erro parar a fila no ponto exato.
      for (const p of previsoesSelecionadas) {
        await lancarRecorrencia(p.id, mes);
      }

      if (emEdicao && ids.includes(emEdicao.id)) setStatus('CONCLUIDA');

      const n = quantidadeAConcluir;
      const [singular, plural] =
        rotuloDeConcluir === 'Marcar pago/recebido'
          ? ['pago/recebido', 'pagos/recebidos']
          : rotuloDeConcluir === 'Marcar recebido'
            ? ['recebido', 'recebidos']
            : ['pago', 'pagos'];
      return n === 1
        ? `1 lançamento marcado como ${singular}.`
        : `${n} lançamentos marcados como ${plural}.`;
    });
  }

  function reabrirSelecionados() {
    return emLote(async () => {
      const ids = concluidasSelecionadas.map((t) => t.id);
      const alterados = await alterarStatusDeVarias(ids, 'PENDENTE');
      if (emEdicao && ids.includes(emEdicao.id)) setStatus('PENDENTE');
      return `${alterados} ${alterados === 1 ? 'lançamento reaberto' : 'lançamentos reabertos'}.`;
    });
  }

  function excluirSelecionados() {
    const quantidade = transacoesSelecionadas.length;
    const temParcela = transacoesSelecionadas.some((t) => t.grupoDeParcelas !== null);

    const confirmado = window.confirm(
      `Apagar ${quantidade} ${quantidade === 1 ? 'lançamento' : 'lançamentos'}?` +
        (temParcela
          ? '\n\nDas compras parceladas, só as parcelas marcadas são apagadas — as dos outros meses continuam.'
          : '') +
        (previsoesSelecionadas.length > 0
          ? '\n\nAs contas previstas marcadas ficam: elas vêm das recorrências.'
          : '')
    );
    if (!confirmado) return;

    return emLote(async () => {
      const ids = transacoesSelecionadas.map((t) => t.id);
      const apagados = await excluirVarias(ids);
      if (emEdicao && ids.includes(emEdicao.id)) limparFormulario();
      return `${apagados} ${apagados === 1 ? 'lançamento apagado' : 'lançamentos apagados'}.`;
    });
  }

  /**
   * Clique em qualquer ponto da linha abre a edição — menos nos controles
   * que já têm função própria (caixinha, botões). Sem esta checagem, marcar
   * a caixinha ou clicar em Excluir também abriria o formulário.
   */
  function aoClicarNaLinha(alvo: EventTarget, transacao: Transacao) {
    if ((alvo as HTMLElement).closest('button, input, label, a')) return;
    comecarEdicao(transacao);
  }

  return (
    <>
      <section
        ref={cartaoDoFormulario}
        className={emEdicao ? 'cartao cartao--formulario cartao--em-edicao' : 'cartao cartao--formulario'}
      >
        <h2>{emEdicao ? 'Editar lançamento' : 'Novo lançamento'}</h2>

        {/* Na edição, a parcela avisa que é uma só: as irmãs são lançamentos
            à parte, e mudar o valor desta não mexe nas outras. */}
        {emEdicao?.grupoDeParcelas && (
          <p className="explicacao">
            Esta é a parcela{' '}
            <strong>{rotuloDaParcela(emEdicao.parcelaAtual, emEdicao.parcelasTotais)}</strong>.
            Salvar muda só ela; as outras parcelas da compra continuam como estão.
          </p>
        )}

        <form onSubmit={aoEnviar}>
          {/* Numa sobra, descrição, data e categoria são sempre as mesmas, e
              o app as preenche. Pedi-las seria trabalho sem escolha. */}
          {!ehSobra && (
            <div className="linha-de-campos">
              <label className="campo campo--largo">
                <span>Descrição</span>
                <input
                  ref={campoDeDescricao}
                  type="text"
                  placeholder="Ex: Netflix"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  required
                />
              </label>

              <label className="campo">
                <span>Data</span>
                <SeletorDeData
                  valor={data}
                  aoMudar={setData}
                  rotuloAcessivel="Data do lançamento"
                  obrigatorio
                />
              </label>

              {/*
                Opcional: o caso comum é o dinheiro sair no mesmo dia, e aí o
                campo fica vazio. Quando preenchido, é ELE que decide em que
                mês o lançamento entra no Dashboard — e a trilha de meses pula
                para lá assim que o lançamento é salvo, que é o que mostra para
                onde a despesa foi sem precisar de texto explicando.
              */}
              <label className="campo">
                <span>Vence em</span>
                <SeletorDeData
                  valor={vencimento}
                  aoMudar={setVencimento}
                  rotuloAcessivel="Vencimento do lançamento"
                  minimo={data}
                />
              </label>
            </div>
          )}

          <div className="linha-de-campos">
            <label className="campo">
              <span>{ehParcelado ? 'Valor da parcela' : 'Valor'}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={valor}
                onChange={(e) => setValor(formatarEntradaMonetaria(e.target.value))}
                className="campo__dinheiro"
                required
              />
            </label>

            {!ehSobra && (
              <label className="campo">
                <span>Categoria</span>
                <CampoComSugestoes
                  valor={categoria}
                  aoMudar={setCategoria}
                  sugestoes={sugestoes.CATEGORIA}
                  aoExcluir={excluirSugestao}
                  placeholder="Ex: Lazer"
                  rotuloAcessivel="Categoria do lançamento"
                  obrigatorio
                />
              </label>
            )}

            <label className="campo">
              <span>Tipo</span>
              <SelectPersonalizado<TipoDoFormulario>
                valor={tipo}
                aoMudar={mudarTipo}
                rotuloAcessivel="Tipo do lançamento"
                opcoes={[
                  { valor: 'GASTO', rotulo: 'Gasto' },
                  { valor: 'GANHO', rotulo: 'Ganho' },
                  { valor: 'SOBRA', rotulo: 'Sobra do mês anterior' },
                ]}
              />
            </label>
          </div>

          {ehSobra && (
            <p className="explicacao">
              O dinheiro que você já tinha em conta quando {formatarMes(mes)}{' '}
              começou. Ele aparece na linha <strong>Sobra anterior</strong> do
              balanço e fica fora das entradas, do gráfico de categorias e das
              faturas — não é receita do mês, é o ponto de partida dele. Para
              lançar em outro mês, troque o mês na barra do topo.
            </p>
          )}

          {/* Forma de pagamento, fixo/variável e parcelas não se aplicam a um
              saldo que veio do mês passado, então somem quando ele é marcado. */}
          {!ehSobra && (
            <div className="linha-de-campos">
              <label className="campo">
                <span>Situação</span>
                <SelectPersonalizado<StatusTransacao>
                  valor={status}
                  aoMudar={setStatus}
                  rotuloAcessivel="Situação do lançamento"
                  opcoes={[
                    { valor: 'PENDENTE', rotulo: rotuloDoStatus(tipo, 'PENDENTE') },
                    { valor: 'CONCLUIDA', rotulo: rotuloDoStatus(tipo, 'CONCLUIDA') },
                  ]}
                />
              </label>

              <label className="campo">
                <span>{tipo === 'GANHO' ? 'Forma de recebimento' : 'Forma de pagamento'}</span>
                {tipo === 'GANHO' ? (
                  <SelectPersonalizado<string>
                    valor={formaDePagamento}
                    aoMudar={setFormaDePagamento}
                    rotuloAcessivel="Forma de recebimento"
                    opcoes={FORMAS_DE_RECEBIMENTO.map((forma) => ({
                      valor: forma,
                      rotulo: forma,
                    }))}
                  />
                ) : (
                  <CampoComSugestoes
                    valor={formaDePagamento}
                    aoMudar={setFormaDePagamento}
                    sugestoes={sugestoes.FORMA_DE_PAGAMENTO}
                    aoExcluir={excluirSugestao}
                    placeholder="Ex: Cartão Nubank"
                    rotuloAcessivel="Forma de pagamento"
                  />
                )}
              </label>

              {/* Fixo/variável e parcelamento só fazem sentido para gasto. */}
              {tipo === 'GASTO' && (
                <>
                  <label className="campo">
                    <span>Fixo ou variável</span>
                    <SelectPersonalizado<ClassificacaoGasto | ''>
                      valor={classificacao}
                      aoMudar={setClassificacao}
                      rotuloAcessivel="Classificação do gasto"
                      opcoes={[
                        { valor: '', rotulo: 'Não classificar' },
                        { valor: 'FIXO', rotulo: 'Fixo' },
                        { valor: 'VARIAVEL', rotulo: 'Variável' },
                      ]}
                    />
                  </label>

                  {/* Parcelar é decisão de quem cria a compra: na edição o
                      controle some, e a parcela aberta é editada sozinha. */}
                  {!emEdicao && (
                  <label className="campo">
                    <span>Parcelas</span>
                    <div className="controle-parcelas" role="group" aria-label="Quantidade de parcelas">
                      <button
                        type="button"
                        onClick={() => mudarQuantidadeDeParcelas(-1)}
                        disabled={quantidadeDeParcelas <= 1}
                        aria-label="Diminuir parcelas"
                      >
                        <Minus weight="bold" aria-hidden="true" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={parcelas}
                        onChange={(e) => digitarQuantidadeDeParcelas(e.target.value)}
                        onBlur={() => {
                          if (!parcelas) setParcelas('1');
                        }}
                        aria-label="Número de parcelas"
                      />
                      <span className="controle-parcelas__sufixo">
                        {quantidadeDeParcelas === 1 ? 'parcela' : 'parcelas'}
                      </span>
                      <button
                        type="button"
                        onClick={() => mudarQuantidadeDeParcelas(1)}
                        disabled={quantidadeDeParcelas >= 60}
                        aria-label="Aumentar parcelas"
                      >
                        <Plus weight="bold" aria-hidden="true" />
                      </button>
                    </div>
                  </label>
                  )}
                </>
              )}
            </div>
          )}

          {ehParcelado && (
            <p className="explicacao">
              Serão criados <strong>{quantidadeDeParcelas} lançamentos</strong>, um por mês, de{' '}
              {formatarDinheiro(numeroDaEntradaMonetaria(valor))} cada — total de{' '}
              {formatarDinheiro(numeroDaEntradaMonetaria(valor) * quantidadeDeParcelas)}. A
              Projeção já enxerga todos eles.
            </p>
          )}

          {erroDoFormulario && <p className="mensagem-erro">{erroDoFormulario}</p>}

          <div className="botoes-do-formulario">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : emEdicao ? 'Salvar alterações' : 'Adicionar lançamento'}
            </button>
            {emEdicao && (
              <button
                type="button"
                className="botao--discreto"
                onClick={limparFormulario}
                disabled={salvando}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="cartao">
        <h2>Lançamentos</h2>

        {quantidadePrevista > 0 && (
          <p className="explicacao">
            As linhas marcadas como <span className="etiqueta">Previsto</span> vêm das suas
            recorrências e ainda não foram lançadas. Ao marcá-las como pagas, viram lançamento —
            e o total do mês não muda, porque a previsão já contava no balanço.
          </p>
        )}

        <div className="linha-de-campos linha-de-campos--filtros">
          <label className="campo">
            <span>Tipo</span>
            <SelectPersonalizado<TipoTransacao | ''>
              valor={tipoFiltrado}
              aoMudar={trocarTipoFiltrado}
              rotuloAcessivel="Filtrar por tipo"
              opcoes={[
                { valor: '', rotulo: 'Todos' },
                { valor: 'GASTO', rotulo: 'Só gastos' },
                { valor: 'GANHO', rotulo: 'Só ganhos' },
              ]}
            />
          </label>

          <label className="campo">
            <span>Situação</span>
            <SelectPersonalizado<StatusTransacao | ''>
              valor={statusFiltrado}
              aoMudar={trocarStatusFiltrado}
              rotuloAcessivel="Filtrar por situação"
              opcoes={[
                { valor: '', rotulo: 'Todas' },
                { valor: 'PENDENTE', rotulo: 'A pagar / a receber' },
                { valor: 'CONCLUIDA', rotulo: 'Pago / recebido' },
              ]}
            />
          </label>
        </div>

        <AvisoTemporario texto={aviso} />
        {carregando && <p className="vazio">Carregando…</p>}
        {erroDaLista && <p className="mensagem-erro">{erroDaLista}</p>}

        {!carregando && !erroDaLista && itens.length === 0 && (
          <p className="vazio">Nenhum lançamento neste filtro.</p>
        )}

        {!carregando && !erroDaLista && itens.length > 0 && (
          <div className="barra-de-lote">
            <label className="barra-de-lote__todos">
              <input
                ref={caixaDeTodos}
                type="checkbox"
                checked={todosSelecionados}
                onChange={alternarTodos}
              />
              {itensSelecionados.length === 0
                ? 'Selecionar todos'
                : `${itensSelecionados.length} ${
                    itensSelecionados.length === 1 ? 'selecionado' : 'selecionados'
                  }`}
            </label>

            {/* Cada botão aparece só quando há linha em que ele faz sentido,
                e diz quantas: "Reabrir (2)" numa seleção de 5 avisa que 3
                delas não vão mudar. */}
            {itensSelecionados.length > 0 && (
              <div className="acoes">
                {quantidadeAConcluir > 0 && (
                  <button
                    type="button"
                    className="botao--discreto botao--acao botao--acao-concluir"
                    disabled={processandoLote}
                    onClick={concluirSelecionados}
                  >
                    <Check weight="bold" aria-hidden="true" />
                    {rotuloDeConcluir} ({quantidadeAConcluir})
                  </button>
                )}
                {concluidasSelecionadas.length > 0 && (
                  <button
                    type="button"
                    className="botao--discreto botao--acao botao--acao-reabrir"
                    disabled={processandoLote}
                    onClick={reabrirSelecionados}
                  >
                    <ArrowCounterClockwise weight="bold" aria-hidden="true" />
                    Reabrir ({concluidasSelecionadas.length})
                  </button>
                )}
                {transacoesSelecionadas.length > 0 && (
                  <button
                    type="button"
                    className="botao--discreto botao--perigo botao--acao botao--acao-excluir"
                    disabled={processandoLote}
                    onClick={excluirSelecionados}
                  >
                    <Trash weight="bold" aria-hidden="true" />
                    Excluir ({transacoesSelecionadas.length})
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!carregando && !erroDaLista && itens.length > 0 && (
          <div className="tabela-rolavel">
            <table className="tabela">
              <thead>
                <tr>
                  {/* A caixinha de "todos" mora na barra acima da tabela, que
                      continua visível no celular — aqui o cabeçalho some. */}
                  <th className="celula-selecao" aria-label="Seleção" />
                  {(
                    [
                      ['vencimento', 'Vencimento'],
                      ['compra', 'Compra'],
                      ['descricao', 'Descrição'],
                      ['categoria', 'Categoria'],
                      ['pagamento', 'Pagamento'],
                      ['valor', 'Valor'],
                      ['situacao', 'Situação'],
                    ] as const
                  ).map(([coluna, rotulo]) => (
                    <TituloOrdenavel
                      key={coluna}
                      coluna={coluna}
                      rotulo={rotulo}
                      ordenacao={ordenacao}
                      aoClicar={alternarOrdenacao}
                      alinhadoDireita={coluna === 'valor'}
                    />
                  ))}
                  <th className="alinhado-direita">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itensOrdenados.map((item) => {
                  // --- Conta prevista: ainda não existe como lançamento ---
                  if (item.especie === 'previsao') {
                    const p = item.previsao;

                    return (
                      <tr
                        key={item.chave}
                        className={
                          selecionados.has(item.chave)
                            ? 'linha--prevista linha--selecionada'
                            : 'linha--prevista'
                        }
                      >
                        <td className="celula-selecao" data-rotulo="Selecionar">
                          <input
                            type="checkbox"
                            checked={selecionados.has(item.chave)}
                            onChange={() => alternarSelecao(item.chave)}
                            aria-label={`Selecionar ${p.descricao}`}
                          />
                        </td>
                        <td data-rotulo="Vencimento">{formatarData(p.data)}</td>
                        {/* Previsão ainda não aconteceu, então não tem compra
                            de verdade: mostra o dia em que ela cai, que é a
                            data que ela recebe ao ser lançada. */}
                        <td data-rotulo="Compra">{formatarData(p.data)}</td>
                        <td>
                          {p.descricao}
                          <span className="etiqueta">Previsto</span>
                        </td>
                        <td data-rotulo="Categoria">{p.categoria}</td>
                        <td data-rotulo="Pagamento">{p.formaDePagamento ?? '—'}</td>
                        <td
                          data-rotulo="Valor"
                          className={`alinhado-direita ${p.tipo === 'GANHO' ? 'ganho' : 'gasto'}`}
                        >
                          {p.tipo === 'GANHO' ? '+' : '−'} {formatarDinheiro(p.valor)}
                        </td>
                        <td data-rotulo="Situação">
                          <span className="situacao situacao--pendente">
                            <ClockCountdown weight="bold" aria-hidden="true" />
                            <span>{rotuloDoStatus(p.tipo, 'PENDENTE')}</span>
                          </span>
                        </td>
                        <td className="alinhado-direita">
                          <div className="acoes">
                            <button
                              type="button"
                              className="botao--discreto botao--acao botao--acao-concluir"
                              disabled={lancando === p.id}
                              onClick={() => aoLancarPrevisao(p)}
                            >
                              <Check weight="bold" aria-hidden="true" />
                              {lancando === p.id
                                ? 'Lançando…'
                                : rotuloDaAcaoDeStatus(p.tipo, 'PENDENTE')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // --- Lançamento de verdade ---
                  const t = item.transacao;
                  const parcela = rotuloDaParcela(t.parcelaAtual, t.parcelasTotais);

                  const classesDaLinha = [
                    'linha--editavel',
                    selecionados.has(item.chave) && 'linha--selecionada',
                    emEdicao?.id === t.id && 'linha--em-edicao',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <tr
                      key={item.chave}
                      className={classesDaLinha}
                      onClick={(e) => aoClicarNaLinha(e.target, t)}
                    >
                      <td className="celula-selecao" data-rotulo="Selecionar">
                        <input
                          type="checkbox"
                          checked={selecionados.has(item.chave)}
                          onChange={() => alternarSelecao(item.chave)}
                          aria-label={`Selecionar ${t.descricao}`}
                        />
                      </td>
                      {/* Sem vencimento, o dinheiro se move no dia da compra —
                          por isso as duas colunas podem mostrar a mesma data. */}
                      <td data-rotulo="Vencimento">{formatarData(t.vencimento ?? t.data)}</td>
                      <td data-rotulo="Compra">{formatarData(t.data)}</td>
                      <td>
                        {/* O clique na linha já abre a edição; este botão é o
                            mesmo caminho para quem navega pelo teclado. */}
                        <button
                          type="button"
                          className="botao-de-edicao"
                          onClick={() => comecarEdicao(t)}
                          title="Editar este lançamento"
                        >
                          {t.descricao}
                        </button>
                        {parcela && <span className="marcador"> {parcela}</span>}
                        {t.ehSobraDoMesAnterior && (
                          <span
                            className="etiqueta"
                            title="Conta como sobra do mês anterior, não como entrada do mês"
                          >
                            Sobra anterior
                          </span>
                        )}
                        {t.classificacao && (
                          <span className="etiqueta">
                            {t.classificacao === 'FIXO' ? 'Fixo' : 'Variável'}
                          </span>
                        )}
                      </td>
                      <td data-rotulo="Categoria">{t.categoria}</td>
                      <td data-rotulo="Pagamento">{t.formaDePagamento ?? '—'}</td>
                      <td
                        data-rotulo="Valor"
                        className={`alinhado-direita ${t.tipo === 'GANHO' ? 'ganho' : 'gasto'}`}
                      >
                        {t.tipo === 'GANHO' ? '+' : '−'} {formatarDinheiro(t.valor)}
                      </td>
                      <td data-rotulo="Situação">
                        <span
                          className={
                            t.status === 'PENDENTE'
                              ? 'situacao situacao--pendente'
                              : 'situacao situacao--concluida'
                          }
                        >
                          {t.status === 'PENDENTE' ? (
                            <ClockCountdown weight="bold" aria-hidden="true" />
                          ) : (
                            <CheckCircle weight="fill" aria-hidden="true" />
                          )}
                          <span>{rotuloDoStatus(t.tipo, t.status)}</span>
                        </span>
                      </td>
                      <td className="alinhado-direita">
                        <div className="acoes">
                          <button
                            type="button"
                            className={`botao--discreto botao--acao ${
                              t.status === 'PENDENTE'
                                ? 'botao--acao-concluir'
                                : 'botao--acao-reabrir'
                            }`}
                            onClick={() => aoAlternarStatus(t)}
                          >
                            {t.status === 'PENDENTE' ? (
                              <Check weight="bold" aria-hidden="true" />
                            ) : (
                              <ArrowCounterClockwise weight="bold" aria-hidden="true" />
                            )}
                            {rotuloDaAcaoDeStatus(t.tipo, t.status)}
                          </button>
                          <button
                            type="button"
                            className="botao--discreto botao--perigo botao--acao botao--acao-excluir"
                            onClick={() => aoExcluir(t)}
                          >
                            <Trash weight="bold" aria-hidden="true" />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default Lancamentos;
