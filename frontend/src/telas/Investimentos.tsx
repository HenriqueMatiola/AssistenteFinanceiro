import { useEffect, useState, type FormEvent } from 'react';
import {
  buscarCarteira,
  criarInvestimento,
  excluirInvestimento,
  type Carteira,
  type Investimento,
} from '../api.ts';
import {
  formatarData,
  formatarDinheiro,
  formatarPercentual,
  formatarQuantidade,
  hojeISO,
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

function Investimentos() {
  const [carteira, setCarteira] = useState<Carteira | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário
  const [ativo, setAtivo] = useState('');
  const [apelido, setApelido] = useState('');
  const [dataDaCompra, setDataDaCompra] = useState(hojeISO());
  const [quantidade, setQuantidade] = useState('');
  const [valorPago, setValorPago] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);

  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;

    buscarCarteira()
      .then((dados) => {
        if (cancelado) return;
        setCarteira(dados);
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
  }, [versao]);

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
      const valorNumerico = Number(valorPago.replace(',', '.'));

      if (!Number.isFinite(quantidadeNumerica) || quantidadeNumerica <= 0) {
        throw new Error('Informe uma quantidade maior que zero.');
      }
      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        throw new Error('Informe quanto você pagou, em reais.');
      }

      await criarInvestimento({
        ativo,
        apelido: apelido || undefined,
        dataDaCompra,
        quantidade: quantidadeNumerica,
        valorPago: valorNumerico,
      });

      setAtivo('');
      setApelido('');
      setQuantidade('');
      setValorPago('');
      recarregar();
    } catch (e) {
      setErroDoFormulario(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoExcluir(investimento: Investimento) {
    const nome = investimento.apelido ?? investimento.ativo;
    if (!window.confirm(`Apagar a posição em "${nome}"?`)) return;

    setErro(null);
    try {
      await excluirInvestimento(investimento.id);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui excluir.');
    }
  }

  const total = carteira?.total;
  const investimentos = carteira?.investimentos ?? [];

  return (
    <>
      <section className="cartao">
        <h2>Nova compra</h2>
        <p className="explicacao">
          Informe o <strong>código do ativo</strong> e quanto você pagou no total.
          A cotação é buscada ao vivo a cada vez que esta tela abre — nenhum preço
          fica guardado, porque preço guardado envelhece e passa a mentir.
        </p>

        <form onSubmit={aoEnviar}>
          <div className="linha-de-campos">
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
              <span>Apelido (opcional)</span>
              <input
                type="text"
                placeholder="Ex: Petrobras"
                value={apelido}
                onChange={(e) => setApelido(e.target.value)}
              />
            </label>

            <label className="campo">
              <span>Data da compra</span>
              <input
                type="date"
                value={dataDaCompra}
                onChange={(e) => setDataDaCompra(e.target.value)}
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
              <span>Valor pago no total (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
                required
              />
            </label>
          </div>

          {erroDoFormulario && <p className="mensagem-erro">{erroDoFormulario}</p>}

          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Registrar compra'}
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
                : `${formatarPercentual(total.variacao)} sobre o que você investiu.`}
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
                <span className="kpi__rotulo">Resultado</span>
                <span className={`kpi__valor ${total.lucro < 0 ? 'gasto' : 'ganho'}`}>
                  {formatarDinheiro(total.lucro)}
                </span>
              </div>
            </div>

            {total.semCotacao > 0 && (
              <p className="mensagem-aviso">
                {total.semCotacao === 1
                  ? '1 ativo ficou sem cotação e está fora destes totais.'
                  : `${total.semCotacao} ativos ficaram sem cotação e estão fora destes totais.`}{' '}
                Confira se o código está certo — ações da B3 precisam do sufixo{' '}
                <strong>.SA</strong>.
              </p>
            )}
          </section>

          <section className="cartao">
            <h2>Seus ativos</h2>

            {investimentos.length === 0 ? (
              <p className="vazio">
                Nenhum ativo registrado. Comece pela compra mais recente que você
                lembrar.
              </p>
            ) : (
              <div className="tabela-rolavel">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Ativo</th>
                      <th>Compra</th>
                      <th className="alinhado-direita">Qtd.</th>
                      <th className="alinhado-direita">Preço médio</th>
                      <th className="alinhado-direita">Cotação</th>
                      <th className="alinhado-direita">Vale hoje</th>
                      <th className="alinhado-direita">Resultado</th>
                      <th className="alinhado-direita">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investimentos.map((i) => (
                      <tr key={i.id}>
                        <td>
                          {i.apelido ?? i.ativo}
                          {i.apelido && <span className="marcador"> {i.ativo}</span>}
                          {i.cambio !== null && (
                            <span
                              className="etiqueta"
                              title={`Cotado em ${i.moedaOriginal}, convertido a R$ ${i.cambio.toFixed(4)}`}
                            >
                              {i.moedaOriginal}
                            </span>
                          )}
                        </td>
                        <td>{formatarData(i.dataDaCompra)}</td>
                        <td className="alinhado-direita">
                          <span className="numero">{formatarQuantidade(i.quantidade)}</span>
                        </td>
                        <td className="alinhado-direita">
                          <span className="numero">{formatarDinheiro(i.precoMedio)}</span>
                        </td>
                        <td className="alinhado-direita">
                          {i.cotacao === null ? (
                            <span className="vazio">sem preço</span>
                          ) : (
                            <span className="numero">{formatarDinheiro(i.cotacao)}</span>
                          )}
                        </td>
                        <td className="alinhado-direita">
                          {i.valorAtual === null ? (
                            <span className="vazio">—</span>
                          ) : (
                            <span className="numero">{formatarDinheiro(i.valorAtual)}</span>
                          )}
                        </td>
                        <td
                          className={`alinhado-direita ${
                            i.lucro === null ? '' : i.lucro < 0 ? 'gasto' : 'ganho'
                          }`}
                        >
                          {i.lucro === null ? (
                            <span className="vazio">—</span>
                          ) : (
                            <>
                              {formatarDinheiro(i.lucro)}
                              {i.variacao !== null && (
                                <span className="barra__fatia">
                                  {' '}
                                  · {formatarPercentual(i.variacao)}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="alinhado-direita">
                          <div className="acoes">
                            <button
                              type="button"
                              className="botao--discreto"
                              onClick={() => aoExcluir(i)}
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
