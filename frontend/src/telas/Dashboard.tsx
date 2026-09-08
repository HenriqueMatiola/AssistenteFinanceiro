import { useEffect, useState } from 'react';
import {
  buscarGastosPorCategoria,
  buscarGastosPorFormaDePagamento,
  buscarResumo,
  type GastoPorCategoria,
  type GastoPorForma,
  type ResumoDoMes,
} from '../api.ts';
import { formatarDinheiro, formatarMes } from '../formato.ts';

/**
 * Uma categoria minúscula ao lado de uma enorme viraria uma barra de 1 pixel,
 * que não se distingue de "nada". Este mínimo garante que ela apareça.
 */
const LARGURA_MINIMA_DA_BARRA = 1.5;

interface Props {
  /** Mês em foco, escolhido na trilha do topo. Formato "AAAA-MM". */
  mes: string;
}

function Dashboard({ mes }: Props) {
  const [resumo, setResumo] = useState<ResumoDoMes | null>(null);
  const [categorias, setCategorias] = useState<GastoPorCategoria[]>([]);
  const [formas, setFormas] = useState<GastoPorForma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Se o mês mudar antes de a resposta chegar, esta flag descarta o
    // resultado atrasado — senão um mês antigo sobrescreveria o novo.
    let cancelado = false;
    setCarregando(true);

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

  // A lista já vem ordenada do maior para o menor, então o primeiro item é a
  // régua: ele vira a barra de 100% e todos os outros são medidos contra ele.
  const maiorGasto = categorias[0]?.total ?? 0;
  const totalGasto = categorias.reduce((soma, c) => soma + c.total, 0);
  const previstas = resumo?.recorrenciasPrevistas ?? [];

  if (erro) {
    return <p className="mensagem-erro">{erro}</p>;
  }

  if (carregando || !resumo) {
    return <p className="vazio">Carregando…</p>;
  }

  /*
   * Zero não é ganho nem perda, e por isso fica sem cor.
   *
   * Desde que a sobra negativa passou a virar zero, "R$ 0,00" é o valor mais
   * comum desta linha — e pintá-lo de verde, junto das entradas, anunciaria
   * uma folga que não existe. As outras três figuras seguem com a regra
   * simples: abaixo de zero é vermelho.
   */
  const corDaSobra =
    resumo.sobraDoMesAnterior === 0 ? '' : resumo.sobraDoMesAnterior < 0 ? 'gasto' : 'ganho';

  return (
    <>
      <section className="cartao">
        <h2>Balanço de {formatarMes(mes)}</h2>

        <p className={`figura-destaque ${resumo.disponivel < 0 ? 'gasto' : 'ganho'}`}>
          {formatarDinheiro(resumo.disponivel)}
        </p>
        <p className="explicacao">
          Disponível: o que sobrou dos meses anteriores mais o resultado deste mês.
        </p>

        <div className="kpis">
          <div className="kpi">
            <span className="kpi__rotulo">Sobra anterior</span>
            <span className={`kpi__valor ${corDaSobra}`}>
              {formatarDinheiro(resumo.sobraDoMesAnterior)}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi__rotulo">Entradas</span>
            <span className="kpi__valor ganho">{formatarDinheiro(resumo.entradas)}</span>
          </div>
          <div className="kpi">
            <span className="kpi__rotulo">Saídas</span>
            <span className="kpi__valor gasto">{formatarDinheiro(resumo.saidas)}</span>
          </div>
          <div className="kpi">
            <span className="kpi__rotulo">Saldo do mês</span>
            <span className={`kpi__valor ${resumo.saldo < 0 ? 'gasto' : 'ganho'}`}>
              {formatarDinheiro(resumo.saldo)}
            </span>
          </div>
        </div>
      </section>

      <section className="cartao">
        <h2>De onde vêm os números</h2>
        <p className="explicacao">
          O balanço soma três faixas: o que já se moveu, o que está lançado mas
          ainda não aconteceu, e as recorrências que nem viraram lançamento
          ainda.
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
                <td data-rotulo="Entradas" className="alinhado-direita ganho">
                  {formatarDinheiro(resumo.realizado.entradas)}
                </td>
                <td data-rotulo="Saídas" className="alinhado-direita gasto">
                  {formatarDinheiro(resumo.realizado.saidas)}
                </td>
              </tr>
              <tr>
                <td>Lançado, a receber / a pagar</td>
                <td data-rotulo="Entradas" className="alinhado-direita ganho">
                  {formatarDinheiro(resumo.pendente.entradas)}
                </td>
                <td data-rotulo="Saídas" className="alinhado-direita gasto">
                  {formatarDinheiro(resumo.pendente.saidas)}
                </td>
              </tr>
              <tr>
                <td>
                  Previsto pelas recorrências
                  {previstas.length > 0 && (
                    <span className="marcador"> {previstas.length} conta(s)</span>
                  )}
                </td>
                <td data-rotulo="Entradas" className="alinhado-direita ganho">
                  {formatarDinheiro(resumo.previsto.entradas)}
                </td>
                <td data-rotulo="Saídas" className="alinhado-direita gasto">
                  {formatarDinheiro(resumo.previsto.saidas)}
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
              Quanto sai por cada meio. A coluna "ainda a pagar" é, na prática, o
              que falta fechar da fatura.
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
                      <td data-rotulo="Total" className="alinhado-direita gasto">{formatarDinheiro(f.total)}</td>
                      <td data-rotulo="Ainda a pagar" className="alinhado-direita">
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
  );
}

export default Dashboard;
