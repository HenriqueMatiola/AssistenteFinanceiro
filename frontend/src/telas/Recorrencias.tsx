import { useEffect, useState, type FormEvent } from 'react';
import { Minus, Plus, Power, Trash } from '@phosphor-icons/react';
import {
  alternarRecorrencia,
  criarRecorrencia,
  excluirRecorrencia,
  listarRecorrencias,
  type ClassificacaoGasto,
  type Recorrencia,
  type TipoTransacao,
} from '../api.ts';
import {
  formatarDinheiro,
  formatarEntradaMonetaria,
  numeroDaEntradaMonetaria,
} from '../formato.ts';
import CampoComSugestoes from '../componentes/CampoComSugestoes.tsx';
import SelectPersonalizado from '../componentes/SelectPersonalizado.tsx';

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

  function mudarDiaDoMes(diferenca: number) {
    const diaAtual = Number(diaDoMes) || 1;
    setDiaDoMes(String(Math.min(31, Math.max(1, diaAtual + diferenca))));
  }

  function digitarDiaDoMes(texto: string) {
    const digitos = texto.replace(/\D/g, '');
    if (!digitos) {
      setDiaDoMes('');
      return;
    }
    setDiaDoMes(String(Math.min(31, Math.max(1, Number(digitos)))));
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErroDoFormulario(null);
    setSalvando(true);

    try {
      const valorNumerico = numeroDaEntradaMonetaria(valor);

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
              <span>Valor</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={valor}
                onChange={(e) => setValor(formatarEntradaMonetaria(e.target.value))}
                className="campo__dinheiro"
                required
              />
            </label>
          </div>

          <div className="linha-de-campos">
            <label className="campo">
              <span>Categoria</span>
              <CampoComSugestoes
                valor={categoria}
                aoMudar={setCategoria}
                sugestoes={CATEGORIAS_SUGERIDAS}
                placeholder="Ex: Moradia"
                rotuloAcessivel="Categoria da recorrência"
                obrigatorio
              />
            </label>

            <label className="campo">
              <span>Tipo</span>
              <SelectPersonalizado<TipoTransacao>
                valor={tipo}
                aoMudar={setTipo}
                rotuloAcessivel="Tipo da recorrência"
                opcoes={[
                  { valor: 'GASTO', rotulo: 'Gasto' },
                  { valor: 'GANHO', rotulo: 'Ganho' },
                ]}
              />
            </label>

            <label className="campo">
              <span>Dia do mês</span>
              <div className="controle-parcelas" role="group" aria-label="Dia do mês">
                <button
                  type="button"
                  onClick={() => mudarDiaDoMes(-1)}
                  disabled={(Number(diaDoMes) || 1) <= 1}
                  aria-label="Diminuir dia do mês"
                >
                  <Minus weight="bold" aria-hidden="true" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={diaDoMes}
                  onChange={(e) => digitarDiaDoMes(e.target.value)}
                  onBlur={() => {
                    if (!diaDoMes) setDiaDoMes('1');
                  }}
                  aria-label="Dia do mês"
                  required
                />
                <span className="controle-parcelas__sufixo">do mês</span>
                <button
                  type="button"
                  onClick={() => mudarDiaDoMes(1)}
                  disabled={(Number(diaDoMes) || 1) >= 31}
                  aria-label="Aumentar dia do mês"
                >
                  <Plus weight="bold" aria-hidden="true" />
                </button>
              </div>
            </label>
          </div>

          <div className="linha-de-campos">
            <label className="campo">
              <span>Forma de pagamento</span>
              <CampoComSugestoes
                valor={formaDePagamento}
                aoMudar={setFormaDePagamento}
                sugestoes={FORMAS_SUGERIDAS}
                placeholder="Ex: Cartão Nubank"
                rotuloAcessivel="Forma de pagamento da recorrência"
              />
            </label>

            {/* Fixo/variável só faz sentido para gasto. */}
            {tipo === 'GASTO' && (
              <label className="campo">
                <span>Fixo ou variável</span>
                <SelectPersonalizado<ClassificacaoGasto | ''>
                  valor={classificacao}
                  aoMudar={setClassificacao}
                  rotuloAcessivel="Classificação da recorrência"
                  opcoes={[
                    { valor: '', rotulo: 'Não classificar' },
                    { valor: 'FIXO', rotulo: 'Fixo' },
                    { valor: 'VARIAVEL', rotulo: 'Variável' },
                  ]}
                />
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
                    <td data-rotulo="Dia">{r.diaDoMes}</td>
                    <td>
                      {r.descricao}
                      {r.classificacao && (
                        <span className="etiqueta">
                          {r.classificacao === 'FIXO' ? 'Fixo' : 'Variável'}
                        </span>
                      )}
                    </td>
                    <td data-rotulo="Categoria">{r.categoria}</td>
                    <td data-rotulo="Pagamento">{r.formaDePagamento ?? '—'}</td>
                    <td data-rotulo="Valor" className={`alinhado-direita ${r.tipo === 'GANHO' ? 'ganho' : 'gasto'}`}>
                      {r.tipo === 'GANHO' ? '+' : '−'} {formatarDinheiro(r.valor)}
                    </td>
                    <td className="alinhado-direita">
                      <div className="acoes">
                        <button
                          type="button"
                          className={`botao--discreto botao--acao ${
                            r.ativa ? 'botao--acao-reabrir' : 'botao--acao-concluir'
                          }`}
                          onClick={() => aoAlternar(r)}
                        >
                          <Power weight="bold" aria-hidden="true" />
                          {r.ativa ? 'Desligar' : 'Ligar'}
                        </button>
                        <button
                          type="button"
                          className="botao--discreto botao--perigo botao--acao botao--acao-excluir"
                          onClick={() => aoExcluir(r)}
                        >
                          <Trash weight="bold" aria-hidden="true" />
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
