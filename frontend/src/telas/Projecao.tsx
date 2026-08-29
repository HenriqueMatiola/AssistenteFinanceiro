import { useEffect, useState } from 'react';
import { buscarProjecao, type MesProjetado } from '../api.ts';
import { formatarData, formatarDinheiro, formatarMes } from '../formato.ts';

// Quantos meses a tela oferece. Mais que 12 vira adivinhação: qualquer coisa
// muda num ano.
const OPCOES_DE_PERIODO = [3, 6, 12];

function Projecao() {
  const [quantidadeDeMeses, setQuantidadeDeMeses] = useState(6);
  const [meses, setMeses] = useState<MesProjetado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Se o período mudar antes de a resposta chegar, esta flag descarta o
    // resultado atrasado.
    let cancelado = false;

    // Sem `inicio`: o backend começa no mês que vem por conta própria.
    buscarProjecao(undefined, quantidadeDeMeses)
      .then((projecao) => {
        if (cancelado) return;
        setMeses(projecao.meses);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : 'Não consegui carregar a projeção.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [quantidadeDeMeses]);

  function trocarPeriodo(novaQuantidade: number) {
    setCarregando(true);
    setQuantidadeDeMeses(novaQuantidade);
  }

  // O acumulado do último mês é o número que responde à pergunta toda:
  // "somando tudo, como eu termino o período?"
  const acumuladoFinal = meses.at(-1)?.saldoAcumulado ?? 0;

  // As recorrências são as mesmas em todos os meses — só a data muda. Então a
  // lista do primeiro mês já mostra tudo que se repete.
  const itensRecorrentes = meses[0]?.itens ?? [];

  return (
    <>
      <section className="cartao">
        <label className="campo campo--sozinho">
          <span>Período</span>
          <select
            value={quantidadeDeMeses}
            onChange={(e) => trocarPeriodo(Number(e.target.value))}
          >
            {OPCOES_DE_PERIODO.map((n) => (
              <option key={n} value={n}>
                Próximos {n} meses
              </option>
            ))}
          </select>
        </label>
        <p className="explicacao">
          A projeção começa no mês que vem. O mês corrente fica com o Dashboard,
          que trabalha só com o que já aconteceu — misturar os dois contaria em
          dobro toda conta deste mês que já foi paga e lançada.
        </p>
      </section>

      {erro && <p className="mensagem-erro">{erro}</p>}
      {carregando && <p>Carregando…</p>}

      {!carregando && !erro && meses.length > 0 && (
        <>
          <section className="cartao">
            <h2>
              Se nada mudar, em {formatarMes(meses.at(-1)?.mes ?? '')} você terá
            </h2>

            <p className={`figura-destaque ${acumuladoFinal < 0 ? 'gasto' : 'ganho'}`}>
              {formatarDinheiro(acumuladoFinal)}
            </p>

            <p className="explicacao">
              Somando os {meses.length} meses projetados, a partir de zero. É a
              sobra (ou o rombo) do período, não o seu saldo em conta.
            </p>
          </section>

          <section className="cartao">
            <h2>Mês a mês</h2>

            <table className="tabela">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="alinhado-direita">Entradas</th>
                  <th className="alinhado-direita">Saídas</th>
                  <th className="alinhado-direita">Saldo</th>
                  <th className="alinhado-direita">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((mes) => {
                  // Um mês pode ter parcelas já lançadas além das recorrências.
                  // Marcar isso evita o susto de ver um mês fora da curva.
                  const temLancamentoPontual =
                    mes.deLancamentos.entradas > 0 || mes.deLancamentos.saidas > 0;

                  return (
                    <tr key={mes.mes}>
                      <td>
                        {formatarMes(mes.mes)}
                        {temLancamentoPontual && (
                          <span className="marcador" title="Tem lançamento pontual já feito">
                            {' '}
                            + lançamentos
                          </span>
                        )}
                      </td>
                      <td className="alinhado-direita ganho">
                        {formatarDinheiro(mes.entradas)}
                      </td>
                      <td className="alinhado-direita gasto">{formatarDinheiro(mes.saidas)}</td>
                      <td
                        className={`alinhado-direita ${mes.saldo < 0 ? 'gasto' : 'ganho'}`}
                      >
                        {formatarDinheiro(mes.saldo)}
                      </td>
                      <td
                        className={`alinhado-direita ${
                          mes.saldoAcumulado < 0 ? 'gasto' : 'ganho'
                        }`}
                      >
                        {formatarDinheiro(mes.saldoAcumulado)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="cartao">
            <h2>O que se repete todo mês</h2>

            {itensRecorrentes.length === 0 ? (
              <p className="vazio">
                Nenhuma recorrência ativa. Os números acima vêm só dos
                lançamentos que você já fez com data futura.
              </p>
            ) : (
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data prevista</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th className="alinhado-direita">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {itensRecorrentes.map((item) => (
                    <tr key={item.id}>
                      {/* A data é a do primeiro mês projetado; nos meses
                          seguintes cai no mesmo dia. */}
                      <td>{formatarData(item.data)}</td>
                      <td>{item.descricao}</td>
                      <td>{item.categoria}</td>
                      <td
                        className={`alinhado-direita ${
                          item.tipo === 'GANHO' ? 'ganho' : 'gasto'
                        }`}
                      >
                        {item.tipo === 'GANHO' ? '+' : '−'} {formatarDinheiro(item.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default Projecao;
