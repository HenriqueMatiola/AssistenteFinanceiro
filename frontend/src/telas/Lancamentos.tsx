import { useEffect, useState, type FormEvent } from 'react';
import {
  alterarStatusTransacao,
  criarTransacao,
  excluirTransacao,
  listarTransacoes,
  type ClassificacaoGasto,
  type StatusTransacao,
  type TipoTransacao,
  type Transacao,
} from '../api.ts';
import {
  formatarData,
  formatarDinheiro,
  hojeISO,
  mesAtualISO,
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

function Lancamentos() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);

  // Filtros
  const [mes, setMes] = useState(mesAtualISO());
  const [tipoFiltrado, setTipoFiltrado] = useState<TipoTransacao | ''>('');
  const [statusFiltrado, setStatusFiltrado] = useState<StatusTransacao | ''>('');

  // Formulário
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipo, setTipo] = useState<TipoTransacao>('GASTO');
  // Nasce pendente: o uso comum é planejar o mês e ir marcando o que saiu.
  const [status, setStatus] = useState<StatusTransacao>('PENDENTE');
  const [formaDePagamento, setFormaDePagamento] = useState('');
  const [classificacao, setClassificacao] = useState<ClassificacaoGasto | ''>('');
  const [parcelas, setParcelas] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Muda quando queremos recarregar sem que os filtros tenham mudado
  // (por exemplo, logo depois de criar um lançamento).
  const [versaoDaLista, setVersaoDaLista] = useState(0);

  const quantidadeDeParcelas = Number(parcelas) || 1;
  const ehParcelado = quantidadeDeParcelas > 1;

  useEffect(() => {
    // Se os filtros mudarem antes da resposta chegar, esta flag descarta o
    // resultado atrasado — senão uma busca antiga poderia sobrescrever a nova.
    let cancelado = false;

    listarTransacoes({ mes, tipo: tipoFiltrado, status: statusFiltrado })
      .then((lista) => {
        if (cancelado) return;
        setTransacoes(lista);
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
  }, [mes, tipoFiltrado, statusFiltrado, versaoDaLista]);

  /** Troca um filtro já mostrando o aviso de carregamento. */
  function trocarMes(novoMes: string) {
    setCarregando(true);
    setMes(novoMes);
  }

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

      const criadas = await criarTransacao({
        data,
        descricao,
        valor: valorNumerico,
        categoria,
        tipo,
        status,
        formaDePagamento: formaDePagamento || undefined,
        classificacao: tipo === 'GASTO' ? classificacao : '',
        parcelas: quantidadeDeParcelas,
      });

      if (criadas.length > 1) {
        // Só as parcelas do mês filtrado aparecem na lista; sem este aviso,
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

      // Se o lançamento caiu fora do mês filtrado, mostra o mês dele para
      // que ele não "suma" logo depois de ser criado.
      const mesDoLancamento = data.slice(0, 7);
      if (mesDoLancamento !== mes) {
        trocarMes(mesDoLancamento);
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

  return (
    <>
      <section className="cartao">
        <h2>Novo lançamento</h2>

        <form onSubmit={aoEnviar}>
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

            <label className="campo">
              <span>Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoTransacao)}>
                <option value="GASTO">Gasto</option>
                <option value="GANHO">Ganho</option>
              </select>
            </label>
          </div>

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
                    onChange={(e) => setClassificacao(e.target.value as ClassificacaoGasto | '')}
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

        <div className="linha-de-campos">
          <label className="campo">
            <span>Mês</span>
            <input type="month" value={mes} onChange={(e) => trocarMes(e.target.value)} />
          </label>

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
        {carregando && <p>Carregando…</p>}
        {erroDaLista && <p className="mensagem-erro">{erroDaLista}</p>}

        {!carregando && !erroDaLista && transacoes.length === 0 && (
          <p className="vazio">Nenhum lançamento neste filtro.</p>
        )}

        {!carregando && !erroDaLista && transacoes.length > 0 && (
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
                {transacoes.map((t) => {
                  const parcela = rotuloDaParcela(t.parcelaAtual, t.parcelasTotais);

                  return (
                    <tr key={t.id}>
                      <td>{formatarData(t.data)}</td>
                      <td>
                        {t.descricao}
                        {parcela && <span className="marcador"> {parcela}</span>}
                        {t.classificacao && (
                          <span className="etiqueta">
                            {t.classificacao === 'FIXO' ? 'Fixo' : 'Variável'}
                          </span>
                        )}
                      </td>
                      <td>{t.categoria}</td>
                      <td>{t.formaDePagamento ?? '—'}</td>
                      <td
                        className={`alinhado-direita ${t.tipo === 'GANHO' ? 'ganho' : 'gasto'}`}
                      >
                        {t.tipo === 'GANHO' ? '+' : '−'} {formatarDinheiro(t.valor)}
                      </td>
                      <td>
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
