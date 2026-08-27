import { useEffect, useState } from 'react';
import {
  buscarGastosPorCategoria,
  buscarResumo,
  type GastoPorCategoria,
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
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Se o mês mudar antes de a resposta chegar, esta flag descarta o
    // resultado atrasado — senão um mês antigo sobrescreveria o novo.
    let cancelado = false;

    // As duas chamadas não dependem uma da outra, então vão juntas: o
    // navegador as dispara em paralelo e a tela espera uma vez só, não duas.
    Promise.all([buscarResumo(mes), buscarGastosPorCategoria(mes)])
      .then(([totais, gastos]) => {
        if (cancelado) return;
        setResumo(totais);
        setCategorias(gastos.categorias);
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
            <h2>Saldo de {formatarMes(mes)}</h2>

            <p
              className={`figura-destaque ${resumo.saldo < 0 ? 'gasto' : 'ganho'}`}
            >
              {formatarDinheiro(resumo.saldo)}
            </p>

            <div className="totais">
              <div className="total">
                <span className="total__rotulo">Entradas</span>
                <span className="total__valor ganho">
                  {formatarDinheiro(resumo.entradas)}
                </span>
              </div>
              <div className="total">
                <span className="total__rotulo">Saídas</span>
                <span className="total__valor gasto">
                  {formatarDinheiro(resumo.saidas)}
                </span>
              </div>
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
        </>
      )}
    </>
  );
}

export default Dashboard;
