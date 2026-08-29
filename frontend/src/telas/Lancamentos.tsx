import { useEffect, useState, type FormEvent } from 'react';
import {
  alterarStatusTransacao,
  criarTransacao,
  excluirTransacao,
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
  formatarData,
  formatarDinheiro,
  formatarMes,
  hojeISO,
  rotuloDaAcaoDeStatus,
  rotuloDaParcela,
  rotuloDoStatus,
} from '../formato.ts';

// Sugestões que aparecem ao clicar no campo de categoria. O usuário pode
// digitar qualquer outra coisa — é só um atalho.
const CATEGORIAS_SUGERIDAS = [
  'Alimentação',
  'Moradia',
  'Transporte',
  'Saúde',
  'Educação',
  'Lazer',
  'Salário',
  'Investimentos',
  'Outros',
];

// Mesma ideia para a forma de pagamento: sugestões comuns, campo livre.
// Não é lista fixa porque os cartões de cada pessoa são outros.
const FORMAS_SUGERIDAS = ['Pix', 'Dinheiro', 'Débito', 'Cartão de crédito', 'Boleto'];

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

  // Formulário
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hojeISO());
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
  const [aviso, setAviso] = useState<string | null>(null);

  // Id da recorrência sendo lançada, para desabilitar só o botão dela.
  const [lancando, setLancando] = useState<number | null>(null);

  // Muda quando queremos recarregar sem que os filtros tenham mudado
  // (por exemplo, logo depois de criar um lançamento).
  const [versaoDaLista, setVersaoDaLista] = useState(0);

  const ehSobra = tipo === 'SOBRA';

  // Uma sobra do mês passado é um valor único e já realizado: parcelar,
  // classificar como fixo/variável ou dizer a forma de pagamento não se
  // aplicam a ela.
  const quantidadeDeParcelas = ehSobra ? 1 : Number(parcelas) || 1;
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

  function recarregarLista() {
    setCarregando(true);
    setVersaoDaLista((n) => n + 1);
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErroDoFormulario(null);
    setAviso(null);
    setSalvando(true);

    try {
      // O input de valor é texto para aceitar vírgula, como se escreve em
      // português. A conversão para número acontece aqui.
      const valorNumerico = Number(valor.replace(',', '.'));

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
      const dataUsada = ehSobra ? `${mes}-01` : data;

      const criadas = await criarTransacao({
        data: dataUsada,
        descricao: ehSobra ? DESCRICAO_DA_SOBRA : descricao,
        valor: valorNumerico,
        categoria: ehSobra ? CATEGORIA_DA_SOBRA : categoria,
        tipo: ehSobra ? 'GANHO' : tipo,
        status: ehSobra ? 'CONCLUIDA' : status,
        formaDePagamento: ehSobra ? undefined : formaDePagamento || undefined,
        classificacao: !ehSobra && tipo === 'GASTO' ? classificacao : '',
        parcelas: quantidadeDeParcelas,
        ehSobraDoMesAnterior: ehSobra,
      });

      if (criadas.length > 1) {
        // Só as parcelas do mês em foco aparecem na lista; sem este aviso,
        // parece que 11 delas se perderam.
        setAviso(
          `${criadas.length} parcelas criadas, de ${formatarData(criadas[0]?.data ?? data)} ` +
            `a ${formatarData(criadas.at(-1)?.data ?? data)}.`
        );
      }

      // Limpa só o que muda de um lançamento para o outro; data, tipo e forma
      // de pagamento costumam se repetir quando se lança vários seguidos.
      setDescricao('');
      setValor('');
      setCategoria('');
      setParcelas('1');

      // Se o lançamento caiu fora do mês em foco, mostra o mês dele para que
      // ele não "suma" logo depois de ser criado.
      const mesDoLancamento = dataUsada.slice(0, 7);
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
      await alterarStatusTransacao(
        transacao.id,
        transacao.status === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA'
      );
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
        data: t.data,
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

  const quantidadePrevista = itens.filter((i) => i.especie === 'previsao').length;

  return (
    <>
      <section className="cartao">
        <h2>Novo lançamento</h2>

        <form onSubmit={aoEnviar}>
          {/* Numa sobra, descrição, data e categoria são sempre as mesmas, e
              o app as preenche. Pedi-las seria trabalho sem escolha. */}
          {!ehSobra && (
            <div className="linha-de-campos">
              <label className="campo campo--largo">
                <span>Descrição</span>
                <input
                  type="text"
                  placeholder="Ex: Netflix"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  required
                />
              </label>

              <label className="campo">
                <span>Data</span>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  required
                />
              </label>
            </div>
          )}

          <div className="linha-de-campos">
            <label className="campo">
              <span>{ehParcelado ? 'Valor da parcela (R$)' : 'Valor (R$)'}</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </label>

            {!ehSobra && (
              <label className="campo">
                <span>Categoria</span>
                <input
                  type="text"
                  list="categorias-sugeridas"
                  placeholder="Ex: Lazer"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  required
                />
                <datalist id="categorias-sugeridas">
                  {CATEGORIAS_SUGERIDAS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            )}

            <label className="campo">
              <span>Tipo</span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoDoFormulario)}
              >
                <option value="GASTO">Gasto</option>
                <option value="GANHO">Ganho</option>
                <option value="SOBRA">Sobra do mês anterior</option>
              </select>
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
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusTransacao)}
                >
                  <option value="PENDENTE">{rotuloDoStatus(tipo, 'PENDENTE')}</option>
                  <option value="CONCLUIDA">{rotuloDoStatus(tipo, 'CONCLUIDA')}</option>
                </select>
              </label>

              <label className="campo">
                <span>Forma de pagamento</span>
                <input
                  type="text"
                  list="formas-sugeridas"
                  placeholder="Ex: Cartão Nubank"
                  value={formaDePagamento}
                  onChange={(e) => setFormaDePagamento(e.target.value)}
                />
                <datalist id="formas-sugeridas">
                  {FORMAS_SUGERIDAS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </label>

              {/* Fixo/variável e parcelamento só fazem sentido para gasto. */}
              {tipo === 'GASTO' && (
                <>
                  <label className="campo">
                    <span>Fixo ou variável</span>
                    <select
                      value={classificacao}
                      onChange={(e) =>
                        setClassificacao(e.target.value as ClassificacaoGasto | '')
                      }
                    >
                      <option value="">Não classificar</option>
                      <option value="FIXO">Fixo</option>
                      <option value="VARIAVEL">Variável</option>
                    </select>
                  </label>

                  <label className="campo">
                    <span>Parcelas</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={parcelas}
                      onChange={(e) => setParcelas(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {ehParcelado && (
            <p className="explicacao">
              Serão criados <strong>{quantidadeDeParcelas} lançamentos</strong>, um por mês, de{' '}
              {formatarDinheiro(Number(valor.replace(',', '.')) || 0)} cada — total de{' '}
              {formatarDinheiro((Number(valor.replace(',', '.')) || 0) * quantidadeDeParcelas)}. A
              Projeção já enxerga todos eles.
            </p>
          )}

          {erroDoFormulario && <p className="mensagem-erro">{erroDoFormulario}</p>}

          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Adicionar lançamento'}
          </button>
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
            <select
              value={tipoFiltrado}
              onChange={(e) => trocarTipoFiltrado(e.target.value as TipoTransacao | '')}
            >
              <option value="">Todos</option>
              <option value="GASTO">Só gastos</option>
              <option value="GANHO">Só ganhos</option>
            </select>
          </label>

          <label className="campo">
            <span>Situação</span>
            <select
              value={statusFiltrado}
              onChange={(e) => trocarStatusFiltrado(e.target.value as StatusTransacao | '')}
            >
              <option value="">Todas</option>
              <option value="PENDENTE">A pagar / a receber</option>
              <option value="CONCLUIDA">Pago / recebido</option>
            </select>
          </label>
        </div>

        {aviso && <p className="mensagem-aviso">{aviso}</p>}
        {carregando && <p className="vazio">Carregando…</p>}
        {erroDaLista && <p className="mensagem-erro">{erroDaLista}</p>}

        {!carregando && !erroDaLista && itens.length === 0 && (
          <p className="vazio">Nenhum lançamento neste filtro.</p>
        )}

        {!carregando && !erroDaLista && itens.length > 0 && (
          <div className="tabela-rolavel">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Pagamento</th>
                  <th className="alinhado-direita">Valor</th>
                  <th>Situação</th>
                  <th className="alinhado-direita">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  // --- Conta prevista: ainda não existe como lançamento ---
                  if (item.especie === 'previsao') {
                    const p = item.previsao;

                    return (
                      <tr key={item.chave} className="linha--prevista">
                        <td data-rotulo="Data">{formatarData(p.data)}</td>
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
                            {rotuloDoStatus(p.tipo, 'PENDENTE')}
                          </span>
                        </td>
                        <td className="alinhado-direita">
                          <div className="acoes">
                            <button
                              type="button"
                              className="botao--discreto"
                              disabled={lancando === p.id}
                              onClick={() => aoLancarPrevisao(p)}
                            >
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

                  return (
                    <tr key={item.chave}>
                      <td data-rotulo="Data">{formatarData(t.data)}</td>
                      <td>
                        {t.descricao}
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
                            t.status === 'PENDENTE' ? 'situacao situacao--pendente' : 'situacao'
                          }
                        >
                          {rotuloDoStatus(t.tipo, t.status)}
                        </span>
                      </td>
                      <td className="alinhado-direita">
                        <div className="acoes">
                          <button
                            type="button"
                            className="botao--discreto"
                            onClick={() => aoAlternarStatus(t)}
                          >
                            {rotuloDaAcaoDeStatus(t.tipo, t.status)}
                          </button>
                          <button
                            type="button"
                            className="botao--discreto"
                            onClick={() => aoExcluir(t)}
                          >
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
