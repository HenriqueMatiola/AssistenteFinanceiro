import { useEffect, useState, type FormEvent } from 'react';
import {
  buscarCarteira,
  excluirOperacao,
  listarOperacoes,
  registrarOperacao,
  type Carteira,
  type ClasseDeAtivo,
  type Operacao,
  type TipoDeOperacao,
} from '../api.ts';
import {
  formatarData,
  formatarDinheiro,
  formatarMes,
  formatarPercentual,
  formatarQuantidade,
  hojeISO,
  mesAtualISO,
} from '../formato.ts';

/**
 * Exemplos de código, por tipo de ativo. O código é o que a fonte de cotação
 * entende — não o nome do papel —, e errá-lo é o jeito mais fácil de a posição
 * aparecer sem preço.
 */
const EXEMPLOS_DE_ATIVO = [
  { codigo: 'PETR4.SA', descricao: 'ações da B3 — o sufixo .SA é obrigatório' },
  { codigo: 'HGLG11.SA', descricao: 'fundos imobiliários' },
  { codigo: 'BTC-USD', descricao: 'cripto (convertida para reais na hora)' },
  { codigo: 'AAPL', descricao: 'ações de fora' },
];

const NOME_DA_CLASSE: Record<ClasseDeAtivo, string> = {
  ACAO: 'Ações',
  FII: 'Fundos imobiliários',
  CRIPTO: 'Cripto',
  ETF: 'ETFs',
  OUTRO: 'Outros',
};

function Investimentos() {
  const [carteira, setCarteira] = useState<Carteira | null>(null);
  const [operacoes, setOperacoes] = useState<Operacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros do histórico
  const [mesFiltrado, setMesFiltrado] = useState('');
  const [tipoFiltrado, setTipoFiltrado] = useState<TipoDeOperacao | ''>('');

  // Formulário
  const [tipo, setTipo] = useState<TipoDeOperacao>('COMPRA');
  const [ativo, setAtivo] = useState('');
  const [classe, setClasse] = useState<ClasseDeAtivo | ''>('');
  const [data, setData] = useState(hojeISO());
  const [quantidade, setQuantidade] = useState('');
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);

  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;

    Promise.all([buscarCarteira(), listarOperacoes({ mes: mesFiltrado, tipo: tipoFiltrado })])
      .then(([dados, historico]) => {
        if (cancelado) return;
        setCarteira(dados);
        setOperacoes(historico);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : 'Não consegui carregar a carteira.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [versao, mesFiltrado, tipoFiltrado]);

  function recarregar() {
    setCarregando(true);
    setVersao((n) => n + 1);
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErroDoFormulario(null);
    setSalvando(true);

    try {
      // Os campos são texto para aceitar vírgula, como se escreve em português.
      const quantidadeNumerica = Number(quantidade.replace(',', '.'));
      const valorNumerico = Number(valor.replace(',', '.'));

      if (!Number.isFinite(quantidadeNumerica) || quantidadeNumerica <= 0) {
        throw new Error('Informe uma quantidade maior que zero.');
      }
      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        throw new Error(
          tipo === 'COMPRA'
            ? 'Informe quanto você pagou, em reais.'
            : 'Informe quanto você recebeu, em reais.'
        );
      }

      await registrarOperacao({
        ativo,
        classe: classe || undefined,
        tipo,
        data,
        quantidade: quantidadeNumerica,
        valor: valorNumerico,
      });

      setAtivo('');
      setQuantidade('');
      setValor('');
      recarregar();
    } catch (e) {
      setErroDoFormulario(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoExcluir(operacao: Operacao) {
    const acao = operacao.tipo === 'COMPRA' ? 'compra' : 'venda';
    if (
      !window.confirm(
        `Apagar a ${acao} de ${formatarQuantidade(operacao.quantidade)} ${operacao.ativo}?\n\n` +
          'O preço médio e o resultado são recalculados a partir das operações que sobrarem.'
      )
    ) {
      return;
    }

    setErro(null);
    try {
      await excluirOperacao(operacao.id);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui excluir.');
    }
  }

  const total = carteira?.total;
  const ativosEmCarteira = (carteira?.ativos ?? []).filter((a) => a.quantidade > 0);
  const ativosEncerrados = (carteira?.ativos ?? []).filter(
    (a) => a.quantidade === 0 && a.quantidadeVendida > 0
  );
  const porClasse = carteira?.porClasse ?? [];

  return (
    <>
      <section className="cartao">
        <h2>Registrar operação</h2>
        <p className="explicacao">
          Cada compra e cada venda é um registro. O preço médio, a posição e o
          resultado saem da soma delas — e a cotação é buscada ao vivo, porque
          preço guardado envelhece e passa a mentir.
        </p>

        <form onSubmit={aoEnviar}>
          <div className="linha-de-campos">
            <label className="campo">
              <span>Operação</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeOperacao)}>
                <option value="COMPRA">Compra</option>
                <option value="VENDA">Venda</option>
              </select>
            </label>

            <label className="campo">
              <span>Código do ativo</span>
              <input
                type="text"
                list="ativos-exemplo"
                placeholder="Ex: PETR4.SA"
                value={ativo}
                onChange={(e) => setAtivo(e.target.value)}
                required
              />
              <datalist id="ativos-exemplo">
                {EXEMPLOS_DE_ATIVO.map((a) => (
                  <option key={a.codigo} value={a.codigo}>
                    {a.descricao}
                  </option>
                ))}
              </datalist>
            </label>

            <label className="campo">
              <span>Tipo de ativo</span>
              <select
                value={classe}
                onChange={(e) => setClasse(e.target.value as ClasseDeAtivo | '')}
              >
                <option value="">Descobrir pelo código</option>
                {(Object.keys(NOME_DA_CLASSE) as ClasseDeAtivo[]).map((c) => (
                  <option key={c} value={c}>
                    {NOME_DA_CLASSE[c]}
                  </option>
                ))}
              </select>
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
              <span>Quantidade</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 100 ou 0,005"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
              />
            </label>

            <label className="campo">
              <span>
                {tipo === 'COMPRA' ? 'Valor pago no total (R$)' : 'Valor recebido (R$)'}
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </label>
          </div>

          {erroDoFormulario && <p className="mensagem-erro">{erroDoFormulario}</p>}

          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : tipo === 'COMPRA' ? 'Registrar compra' : 'Registrar venda'}
          </button>
        </form>
      </section>

      {erro && <p className="mensagem-erro">{erro}</p>}
      {carregando && <p className="vazio">Buscando cotações…</p>}

      {!carregando && !erro && total && (
        <>
          <section className="cartao">
            <h2>Resultado da carteira</h2>

            <p className={`figura-destaque ${total.lucro < 0 ? 'gasto' : 'ganho'}`}>
              {formatarDinheiro(total.lucro)}
            </p>
            <p className="explicacao">
              {total.variacao === null
                ? 'Registre uma compra para acompanhar o resultado.'
                : `${formatarPercentual(total.variacao)} sobre o que está investido hoje — o lucro no papel, de quem ainda segura os ativos.`}
            </p>

            <div className="kpis">
              <div className="kpi">
                <span className="kpi__rotulo">Investido</span>
                <span className="kpi__valor">{formatarDinheiro(total.valorPago)}</span>
              </div>
              <div className="kpi">
                <span className="kpi__rotulo">Vale hoje</span>
                <span className="kpi__valor">{formatarDinheiro(total.valorAtual)}</span>
              </div>
              <div className="kpi">
                <span className="kpi__rotulo">No papel</span>
                <span className={`kpi__valor ${total.lucro < 0 ? 'gasto' : 'ganho'}`}>
                  {formatarDinheiro(total.lucro)}
                </span>
              </div>
              <div className="kpi">
                <span className="kpi__rotulo">Já realizado</span>
                <span
                  className={`kpi__valor ${total.lucroRealizado < 0 ? 'gasto' : 'ganho'}`}
                >
                  {formatarDinheiro(total.lucroRealizado)}
                </span>
              </div>
            </div>

            {total.semCotacao > 0 && (
              <p className="mensagem-aviso">
                {total.semCotacao === 1
                  ? '1 ativo ficou sem cotação e está fora destes totais.'
                  : `${total.semCotacao} ativos ficaram sem cotação e estão fora destes totais.`}{' '}
                Confira o código — ações da B3 precisam do sufixo <strong>.SA</strong>.
              </p>
            )}
          </section>

          <section className="cartao">
            <h2>Por tipo de ativo</h2>

            {porClasse.length === 0 ? (
              <p className="vazio">Nada em carteira ainda.</p>
            ) : (
              <div className="tabela-rolavel">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th className="alinhado-direita">Ativos</th>
                      <th className="alinhado-direita">Investido</th>
                      <th className="alinhado-direita">Vale hoje</th>
                      <th className="alinhado-direita">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porClasse.map((c) => (
                      <tr key={c.classe}>
                        <td>{NOME_DA_CLASSE[c.classe]}</td>
                        <td data-rotulo="Ativos" className="alinhado-direita">
                          <span className="numero">{c.ativos}</span>
                        </td>
                        <td data-rotulo="Investido" className="alinhado-direita">
                          <span className="numero">{formatarDinheiro(c.investido)}</span>
                        </td>
                        <td data-rotulo="Vale hoje" className="alinhado-direita">
                          <span className="numero">{formatarDinheiro(c.valorAtual)}</span>
                        </td>
                        <td
                          data-rotulo="Resultado"
                          className={`alinhado-direita ${c.lucro < 0 ? 'gasto' : 'ganho'}`}
                        >
                          {formatarDinheiro(c.lucro)}
                          {c.variacao !== null && (
                            <span className="barra__fatia"> · {formatarPercentual(c.variacao)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="cartao">
            <h2>Posição por ativo</h2>

            {ativosEmCarteira.length === 0 ? (
              <p className="vazio">
                Nenhum ativo em carteira. Registre uma compra para começar.
              </p>
            ) : (
              <div className="tabela-rolavel">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Ativo</th>
                      <th className="alinhado-direita">Quantidade</th>
                      <th className="alinhado-direita">Preço médio</th>
                      <th className="alinhado-direita">Cotação</th>
                      <th className="alinhado-direita">Investido</th>
                      <th className="alinhado-direita">Vale hoje</th>
                      <th className="alinhado-direita">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativosEmCarteira.map((a) => (
                      <tr key={a.ativo}>
                        <td>
                          {a.ativo}
                          {a.cambio !== null && (
                            <span
                              className="etiqueta"
                              title={`Cotado em ${a.moedaOriginal}, convertido a R$ ${a.cambio.toFixed(4)}`}
                            >
                              {a.moedaOriginal}
                            </span>
                          )}
                        </td>
                        <td data-rotulo="Quantidade" className="alinhado-direita">
                          <span className="numero">{formatarQuantidade(a.quantidade)}</span>
                        </td>
                        <td data-rotulo="Preço médio" className="alinhado-direita">
                          <span className="numero">{formatarDinheiro(a.precoMedio)}</span>
                        </td>
                        <td data-rotulo="Cotação" className="alinhado-direita">
                          {a.cotacao === null ? (
                            <span className="vazio">sem preço</span>
                          ) : (
                            <span className="numero">{formatarDinheiro(a.cotacao)}</span>
                          )}
                        </td>
                        <td data-rotulo="Investido" className="alinhado-direita">
                          <span className="numero">{formatarDinheiro(a.investido)}</span>
                        </td>
                        <td data-rotulo="Vale hoje" className="alinhado-direita">
                          {a.valorAtual === null ? (
                            <span className="vazio">—</span>
                          ) : (
                            <span className="numero">{formatarDinheiro(a.valorAtual)}</span>
                          )}
                        </td>
                        <td
                          data-rotulo="Resultado"
                          className={`alinhado-direita ${
                            a.lucro === null ? '' : a.lucro < 0 ? 'gasto' : 'ganho'
                          }`}
                        >
                          {a.lucro === null ? (
                            <span className="vazio">—</span>
                          ) : (
                            <>
                              {formatarDinheiro(a.lucro)}
                              {a.variacao !== null && (
                                <span className="barra__fatia">
                                  {' '}
                                  · {formatarPercentual(a.variacao)}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ativosEncerrados.length > 0 && (
              <>
                <p className="explicacao" style={{ marginTop: '1.25rem' }}>
                  Posições encerradas — você vendeu tudo, mas o resultado continua
                  contando no "já realizado".
                </p>
                <div className="tabela-rolavel">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Ativo</th>
                        <th className="alinhado-direita">Quantidade vendida</th>
                        <th className="alinhado-direita">Resultado realizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ativosEncerrados.map((a) => (
                        <tr key={a.ativo}>
                          <td>{a.ativo}</td>
                          <td data-rotulo="Quantidade vendida" className="alinhado-direita">
                            <span className="numero">
                              {formatarQuantidade(a.quantidadeVendida)}
                            </span>
                          </td>
                          <td
                            data-rotulo="Resultado realizado"
                            className={`alinhado-direita ${
                              a.lucroRealizado < 0 ? 'gasto' : 'ganho'
                            }`}
                          >
                            {formatarDinheiro(a.lucroRealizado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="cartao">
            <h2>Histórico de operações</h2>

            <div className="linha-de-campos linha-de-campos--filtros">
              <label className="campo">
                <span>Mês</span>
                <input
                  type="month"
                  value={mesFiltrado}
                  max={mesAtualISO()}
                  onChange={(e) => setMesFiltrado(e.target.value)}
                />
              </label>

              <label className="campo">
                <span>Operação</span>
                <select
                  value={tipoFiltrado}
                  onChange={(e) => setTipoFiltrado(e.target.value as TipoDeOperacao | '')}
                >
                  <option value="">Compras e vendas</option>
                  <option value="COMPRA">Só compras</option>
                  <option value="VENDA">Só vendas</option>
                </select>
              </label>

              {(mesFiltrado || tipoFiltrado) && (
                <div className="campo campo--acao">
                  <button
                    type="button"
                    className="botao--discreto"
                    onClick={() => {
                      setMesFiltrado('');
                      setTipoFiltrado('');
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
              )}
            </div>

            {operacoes.length === 0 ? (
              <p className="vazio">
                {mesFiltrado
                  ? `Nenhuma operação em ${formatarMes(mesFiltrado)}.`
                  : 'Nenhuma operação registrada.'}
              </p>
            ) : (
              <div className="tabela-rolavel">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Operação</th>
                      <th>Ativo</th>
                      <th className="alinhado-direita">Quantidade</th>
                      <th className="alinhado-direita">Valor</th>
                      <th className="alinhado-direita">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operacoes.map((o) => (
                      <tr key={o.id}>
                        <td data-rotulo="Data">{formatarData(o.data)}</td>
                        <td data-rotulo="Operação">
                          <span
                            className={
                              o.tipo === 'VENDA' ? 'situacao situacao--pendente' : 'situacao'
                            }
                          >
                            {o.tipo === 'COMPRA' ? 'Compra' : 'Venda'}
                          </span>
                        </td>
                        {/* Sem rótulo de propósito: no celular esta célula vira
                            o título do cartão, e o ativo é o que identifica a
                            operação. */}
                        <td>{o.ativo}</td>
                        <td data-rotulo="Quantidade" className="alinhado-direita">
                          <span className="numero">{formatarQuantidade(o.quantidade)}</span>
                        </td>
                        <td
                          data-rotulo="Valor"
                          className={`alinhado-direita ${o.tipo === 'VENDA' ? 'ganho' : 'gasto'}`}
                        >
                          {o.tipo === 'VENDA' ? '+' : '−'} {formatarDinheiro(o.valor)}
                        </td>
                        <td className="alinhado-direita">
                          <div className="acoes">
                            <button
                              type="button"
                              className="botao--discreto botao--perigo"
                              onClick={() => aoExcluir(o)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default Investimentos;
