import { useEffect, useState } from 'react';
import {
  buscarGastosPorCategoria,
  buscarGastosPorFormaDePagamento,
  buscarResumo,
  type GastoPorCategoria,
  type GastoPorForma,
  type ResumoDoMes,
} from '../api.ts';
import { formatarDinheiro, formatarMes, mesAtualISO } from '../formato.ts';

/**
 * Uma categoria minúscula ao lado de uma enorme viraria uma barra de 1 pixel,
 * que não se distingue de "nada". Este mínimo garante que ela apareça.
 */
const LARGURA_MINIMA_DA_BARRA = 1.5;

function Dashboard() {
  const [mes, setMes] = useState(mesAtualISO());
  const [resumo, setResumo] = useState<ResumoDoMes | null>(null);
  const [categorias, setCategorias] = useState<GastoPorCategoria[]>([]);
  const [formas, setFormas] = useState<GastoPorForma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Se o mês mudar antes de a resposta chegar, esta flag descarta o
    // resultado atrasado — senão um mês antigo sobrescreveria o novo.
    let cancelado = false;

    // As três chamadas não dependem uma da outra, então vão juntas: o
    // navegador as dispara em paralelo e a tela espera uma vez só.
    Promise.all([
      buscarResumo(mes),
      buscarGastosPorCategoria(mes),
      buscarGastosPorFormaDePagamento(mes),
    ])
      .then(([totais, gastos, pagamentos]) => {
        if (cancelado) return;
        setResumo(totais);
        setCategorias(gastos.categorias);
        setFormas(pagamentos.formas);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : 'Não consegui carregar o resumo.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [mes]);

  /** Troca o mês já mostrando o aviso de carregamento. */
  function trocarMes(novoMes: string) {
    setCarregando(true);
    setMes(novoMes);
  }

  // A lista já vem ordenada do maior para o menor, então o primeiro item é a
  // régua: ele vira a barra de 100% e todos os outros são medidos contra ele.
  const maiorGasto = categorias[0]?.total ?? 0;
  const totalGasto = categorias.reduce((soma, c) => soma + c.total, 0);

  return (
    <>
      <section className="cartao">
        <label className="campo campo--sozinho">
          <span>Mês</span>
          <input type="month" value={mes} onChange={(e) => trocarMes(e.target.value)} />
        </label>
      </section>

      {erro && <p className="mensagem-erro">{erro}</p>}
      {carregando && <p>Carregando…</p>}

      {!carregando && !erro && resumo && (
        <>
          <section className="cartao">
            <h2>Balanço de {formatarMes(mes)}</h2>

            <p className={`figura-destaque ${resumo.disponivel < 0 ? 'gasto' : 'ganho'}`}>
              {formatarDinheiro(resumo.disponivel)}
            </p>
            <p className="explicacao">
              Disponível: o que sobrou dos meses anteriores mais o resultado
              deste mês.
            </p>

            <div className="totais">
              <div className="total">
                <span className="total__rotulo">Sobra do mês anterior</span>
                <span
                  className={`total__valor ${
                    resumo.sobraDoMesAnterior < 0 ? 'gasto' : 'ganho'
                  }`}
                >
                  {formatarDinheiro(resumo.sobraDoMesAnterior)}
                </span>
              </div>
              <div className="total">
                <span className="total__rotulo">Entradas</span>
                <span className="total__valor ganho">{formatarDinheiro(resumo.entradas)}</span>
              </div>
              <div className="total">
                <span className="total__rotulo">Saídas</span>
                <span className="total__valor gasto">{formatarDinheiro(resumo.saidas)}</span>
              </div>
              <div className="total">
                <span className="total__rotulo">Saldo do mês</span>
                <span className={`total__valor ${resumo.saldo < 0 ? 'gasto' : 'ganho'}`}>
                  {formatarDinheiro(resumo.saldo)}
                </span>
              </div>
            </div>
          </section>

          <section className="cartao">
            <h2>Já aconteceu × ainda vai acontecer</h2>
            <p className="explicacao">
              Os números acima contam o mês inteiro, pago ou não. Aqui dá para
              ver quanto disso já saiu de fato da conta.
            </p>

            <div className="tabela-rolavel">
              <table className="tabela">
                <thead>
                  <tr>
                    <th></th>
                    <th className="alinhado-direita">Entradas</th>
                    <th className="alinhado-direita">Saídas</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Já realizado</td>
                    <td className="alinhado-direita ganho">
                      {formatarDinheiro(resumo.realizado.entradas)}
                    </td>
                    <td className="alinhado-direita gasto">
                      {formatarDinheiro(resumo.realizado.saidas)}
                    </td>
                  </tr>
                  <tr>
                    <td>A receber / a pagar</td>
                    <td className="alinhado-direita ganho">
                      {formatarDinheiro(resumo.pendente.entradas)}
                    </td>
                    <td className="alinhado-direita gasto">
                      {formatarDinheiro(resumo.pendente.saidas)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="cartao">
            <h2>Gastos por categoria</h2>

            {categorias.length === 0 ? (
              <p className="vazio">Nenhum gasto lançado em {formatarMes(mes)}.</p>
            ) : (
              <ul className="grafico-de-barras">
                {categorias.map((c) => {
                  const fatia = Math.round((c.total / totalGasto) * 100);

                  return (
                    <li key={c.categoria} className="barra">
                      <div className="barra__topo">
                        <span className="barra__nome">{c.categoria}</span>
                        <span className="barra__valor">
                          {formatarDinheiro(c.total)}
                          <span className="barra__fatia"> · {fatia}%</span>
                        </span>
                      </div>

                      {/* Decorativo: o valor já está escrito acima em texto, então
                          quem usa leitor de tela não perde nada ao pular a barra. */}
                      <div className="barra__trilho" aria-hidden="true">
                        <div
                          className="barra__preenchimento"
                          style={{
                            width: `${Math.max(
                              (c.total / maiorGasto) * 100,
                              LARGURA_MINIMA_DA_BARRA
                            )}%`,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="cartao">
            <h2>Por forma de pagamento</h2>

            {formas.length === 0 ? (
              <p className="vazio">Nenhum gasto lançado em {formatarMes(mes)}.</p>
            ) : (
              <>
                <p className="explicacao">
                  Quanto sai por cada meio. A coluna "ainda a pagar" é, na
                  prática, o que falta fechar da fatura.
                </p>

                <div className="tabela-rolavel">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Forma</th>
                        <th className="alinhado-direita">Total</th>
                        <th className="alinhado-direita">Ainda a pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formas.map((f) => (
                        <tr key={f.forma}>
                          <td>{f.forma}</td>
                          <td className="alinhado-direita gasto">{formatarDinheiro(f.total)}</td>
                          <td className="alinhado-direita">
                            {f.pendente > 0 ? (
                              <span className="situacao situacao--pendente">
                                {formatarDinheiro(f.pendente)}
                              </span>
                            ) : (
                              <span className="vazio">tudo pago</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default Dashboard;
