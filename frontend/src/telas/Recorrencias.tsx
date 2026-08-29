import { useEffect, useState, type FormEvent } from 'react';
import {
  alternarRecorrencia,
  criarRecorrencia,
  excluirRecorrencia,
  listarRecorrencias,
  type ClassificacaoGasto,
  type Recorrencia,
  type TipoTransacao,
} from '../api.ts';
import { formatarDinheiro } from '../formato.ts';

// As mesmas sugestões da tela de Lançamentos: a categoria de uma recorrência é
// a mesma coisa que a de um lançamento, e o gráfico do Dashboard agrupa por ela.
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

// Mesmas sugestões da tela de Lançamentos, pelo mesmo motivo: campo livre,
// porque os cartões de cada pessoa são outros.
const FORMAS_SUGERIDAS = ['Pix', 'Dinheiro', 'Débito', 'Cartão de crédito', 'Boleto'];

function Recorrencias() {
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);

  // Formulário
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipo, setTipo] = useState<TipoTransacao>('GASTO');
  const [formaDePagamento, setFormaDePagamento] = useState('');
  const [classificacao, setClassificacao] = useState<ClassificacaoGasto | ''>('');
  const [diaDoMes, setDiaDoMes] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);

  // Muda para forçar a lista a recarregar depois de criar, ligar ou apagar algo.
  const [versaoDaLista, setVersaoDaLista] = useState(0);

  useEffect(() => {
    // Se a lista recarregar antes da resposta chegar, esta flag descarta o
    // resultado atrasado — senão uma busca antiga sobrescreveria a nova.
    let cancelado = false;

    listarRecorrencias()
      .then((lista) => {
        if (cancelado) return;
        setRecorrencias(lista);
        setErroDaLista(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setErroDaLista(e instanceof Error ? e.message : 'Não consegui carregar as recorrências.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [versaoDaLista]);

  function recarregar() {
    setVersaoDaLista((n) => n + 1);
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErroDoFormulario(null);
    setSalvando(true);

    try {
      // O campo é texto para aceitar vírgula, como se escreve em português.
      const valorNumerico = Number(valor.replace(',', '.'));

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        throw new Error('Informe um valor maior que zero.');
      }

      await criarRecorrencia({
        descricao,
        valor: valorNumerico,
        categoria,
        tipo,
        formaDePagamento: formaDePagamento || undefined,
        classificacao: tipo === 'GASTO' ? classificacao : '',
        diaDoMes: Number(diaDoMes),
      });

      // Limpa só o que muda de uma recorrência para a outra; tipo e dia
      // costumam se repetir quando se cadastra várias seguidas.
      setDescricao('');
      setValor('');
      setCategoria('');
      recarregar();
    } catch (e) {
      setErroDoFormulario(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoAlternar(recorrencia: Recorrencia) {
    setErroDaLista(null);
    try {
      await alternarRecorrencia(recorrencia.id, !recorrencia.ativa);
      recarregar();
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui atualizar.');
    }
  }

  async function aoExcluir(recorrencia: Recorrencia) {
    // Apagar não tem volta e leva a descrição junto — por isso a pergunta.
    // Quem só quer parar de contar na projeção deve usar o "Desligar".
    const confirmado = window.confirm(
      `Apagar "${recorrencia.descricao}" de vez? Para apenas tirá-la da projeção, use Desligar.`
    );
    if (!confirmado) return;

    setErroDaLista(null);
    try {
      await excluirRecorrencia(recorrencia.id);
      recarregar();
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui excluir.');
    }
  }

  const quantidadeAtiva = recorrencias.filter((r) => r.ativa).length;

  return (
    <>
      <section className="cartao">
        <h2>Nova recorrência</h2>
        <p className="explicacao">
          Contas que se repetem todo mês: aluguel, assinatura, salário. Elas não
          entram no Dashboard — servem para a <strong>Projeção</strong> estimar
          os meses que ainda não chegaram. Quando a conta for de fato paga,
          lance-a normalmente em Lançamentos.
        </p>

        <form onSubmit={aoEnviar}>
          <div className="linha-de-campos">
            <label className="campo">
              <span>Descrição</span>
              <input
                type="text"
                placeholder="Ex: Aluguel"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
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
                list="categorias-recorrencia"
                placeholder="Ex: Moradia"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                required
              />
              <datalist id="categorias-recorrencia">
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

            <label className="campo">
              <span>Dia do mês</span>
              <input
                type="number"
                min={1}
                max={31}
                value={diaDoMes}
                onChange={(e) => setDiaDoMes(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="linha-de-campos">
            <label className="campo">
              <span>Forma de pagamento</span>
              <input
                type="text"
                list="formas-recorrencia"
                placeholder="Ex: Cartão Nubank"
                value={formaDePagamento}
                onChange={(e) => setFormaDePagamento(e.target.value)}
              />
              <datalist id="formas-recorrencia">
                {FORMAS_SUGERIDAS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>

            {/* Fixo/variável só faz sentido para gasto. */}
            {tipo === 'GASTO' && (
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
            )}
          </div>

          {erroDoFormulario && <p className="mensagem-erro">{erroDoFormulario}</p>}

          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Adicionar recorrência'}
          </button>
        </form>
      </section>

      <section className="cartao">
        <h2>Recorrências</h2>

        {carregando && <p>Carregando…</p>}
        {erroDaLista && <p className="mensagem-erro">{erroDaLista}</p>}

        {!carregando && !erroDaLista && recorrencias.length === 0 && (
          <p className="vazio">
            Nenhuma recorrência cadastrada. Sem elas, a Projeção só enxerga os
            lançamentos futuros que você digitar à mão.
          </p>
        )}

        {!carregando && !erroDaLista && recorrencias.length > 0 && (
          <>
            <p className="explicacao">
              {quantidadeAtiva} de {recorrencias.length} entram na projeção. As
              desligadas ficam na lista, mas não somam nada.
            </p>

            <div className="tabela-rolavel"><table className="tabela">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Pagamento</th>
                  <th className="alinhado-direita">Valor</th>
                  <th className="alinhado-direita">Ações</th>
                </tr>
              </thead>
              <tbody>
                {recorrencias.map((r) => (
                  <tr key={r.id} className={r.ativa ? undefined : 'linha--desligada'}>
                    <td>{r.diaDoMes}</td>
                    <td>
                      {r.descricao}
                      {r.classificacao && (
                        <span className="etiqueta">
                          {r.classificacao === 'FIXO' ? 'Fixo' : 'Variável'}
                        </span>
                      )}
                    </td>
                    <td>{r.categoria}</td>
                    <td>{r.formaDePagamento ?? '—'}</td>
                    <td className={`alinhado-direita ${r.tipo === 'GANHO' ? 'ganho' : 'gasto'}`}>
                      {r.tipo === 'GANHO' ? '+' : '−'} {formatarDinheiro(r.valor)}
                    </td>
                    <td className="alinhado-direita">
                      <div className="acoes">
                        <button
                          type="button"
                          className="botao--discreto"
                          onClick={() => aoAlternar(r)}
                        >
                          {r.ativa ? 'Desligar' : 'Ligar'}
                        </button>
                        <button
                          type="button"
                          className="botao--discreto"
                          onClick={() => aoExcluir(r)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}
      </section>
    </>
  );
}

export default Recorrencias;
