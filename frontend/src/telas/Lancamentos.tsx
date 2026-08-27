import { useEffect, useState, type FormEvent } from 'react';
import {
  criarTransacao,
  listarTransacoes,
  type TipoTransacao,
  type Transacao,
} from '../api.ts';
import { formatarData, formatarDinheiro, hojeISO, mesAtualISO } from '../formato.ts';

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

function Lancamentos() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);

  // Filtros
  const [mes, setMes] = useState(mesAtualISO());
  const [tipoFiltrado, setTipoFiltrado] = useState<TipoTransacao | ''>('');

  // Formulário
  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipo, setTipo] = useState<TipoTransacao>('GASTO');
  const [salvando, setSalvando] = useState(false);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);

  // Muda quando queremos recarregar sem que os filtros tenham mudado
  // (por exemplo, logo depois de criar um lançamento).
  const [versaoDaLista, setVersaoDaLista] = useState(0);

  useEffect(() => {
    // Se os filtros mudarem antes da resposta chegar, esta flag descarta o
    // resultado atrasado — senão uma busca antiga poderia sobrescrever a nova.
    let cancelado = false;

    listarTransacoes({ mes, tipo: tipoFiltrado })
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
  }, [mes, tipoFiltrado, versaoDaLista]);

  /** Troca um filtro já mostrando o aviso de carregamento. */
  function trocarMes(novoMes: string) {
    setCarregando(true);
    setMes(novoMes);
  }

  function trocarTipoFiltrado(novoTipo: TipoTransacao | '') {
    setCarregando(true);
    setTipoFiltrado(novoTipo);
  }

  function recarregarLista() {
    setCarregando(true);
    setVersaoDaLista((n) => n + 1);
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErroDoFormulario(null);
    setSalvando(true);

    try {
      // O input de valor é texto para aceitar vírgula, como se escreve em
      // português. A conversão para número acontece aqui.
      const valorNumerico = Number(valor.replace(',', '.'));

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        throw new Error('Informe um valor maior que zero.');
      }

      await criarTransacao({
        data,
        valor: valorNumerico,
        categoria,
        tipo,
      });

      // Limpa só o que muda de um lançamento para o outro; data e tipo
      // costumam se repetir quando se lança vários seguidos.
      setValor('');
      setCategoria('');

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

  return (
    <>
      <section className="cartao">
        <h2>Novo lançamento</h2>

        <form onSubmit={aoEnviar}>
          <div className="linha-de-campos">
            <label className="campo">
              <span>Data</span>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </label>

            <label className="campo">
              <span>Valor (R$)</span>
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

          <div className="linha-de-campos">
            <label className="campo">
              <span>Categoria</span>
              <input
                type="text"
                list="categorias-sugeridas"
                placeholder="Ex: Mercado"
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
        </div>

        {carregando && <p>Carregando…</p>}
        {erroDaLista && <p className="mensagem-erro">{erroDaLista}</p>}

        {!carregando && !erroDaLista && transacoes.length === 0 && (
          <p className="vazio">Nenhum lançamento neste filtro.</p>
        )}

        {!carregando && !erroDaLista && transacoes.length > 0 && (
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Categoria</th>
                <th className="alinhado-direita">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transacoes.map((t) => (
                <tr key={t.id}>
                  <td>{formatarData(t.data)}</td>
                  <td>{t.categoria}</td>
                  <td
                    className={`alinhado-direita ${t.tipo === 'GANHO' ? 'ganho' : 'gasto'}`}
                  >
                    {t.tipo === 'GANHO' ? '+' : '−'} {formatarDinheiro(t.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export default Lancamentos;
