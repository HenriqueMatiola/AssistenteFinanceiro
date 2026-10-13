import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Minus, Plus, Power, Trash } from '@phosphor-icons/react';
import {
  alternarRecorrencia,
  alternarVariasRecorrencias,
  criarRecorrencia,
  editarRecorrencia,
  excluirRecorrencia,
  excluirVariasRecorrencias,
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
import { useSugestoes } from '../useSugestoes.ts';
import SelectPersonalizado from '../componentes/SelectPersonalizado.tsx';
import TituloOrdenavel, {
  ordenarPor,
  proximaOrdenacao,
  type Ordenacao,
} from '../componentes/TituloOrdenavel.tsx';
import AvisoTemporario, { useAvisoTemporario } from '../componentes/AvisoTemporario.tsx';

/** As colunas que se ordenam clicando no título. Ações fica de fora. */
type ColunaOrdenavel = 'dia' | 'descricao' | 'categoria' | 'pagamento' | 'valor';

/**
 * O que cada recorrência tem naquela coluna, pronto para comparar. Valor vai
 * SEM o sinal, como em Lançamentos: "do menor para o maior" é da conta pequena
 * à grande, seja gasto ou ganho.
 */
function valorDaColuna(r: Recorrencia, coluna: ColunaOrdenavel): string | number | null {
  switch (coluna) {
    case 'dia':
      return r.diaDoMes;
    case 'descricao':
      return r.descricao;
    case 'categoria':
      return r.categoria;
    case 'pagamento':
      return r.formaDePagamento;
    case 'valor':
      return r.valor;
  }
}

function Recorrencias() {
  /*
   * As mesmas listas da tela de Lançamentos: a categoria de uma recorrência é
   * a mesma coisa que a de um lançamento, e o gráfico do Dashboard agrupa as
   * duas juntas. Criar uma aqui faz ela aparecer lá.
   */
  const { sugestoes, excluir: excluirSugestao, recarregar: recarregarSugestoes } = useSugestoes();

  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  const [aviso, setAviso] = useAvisoTemporario();

  // `null` é a ordem que vem do backend: ligadas primeiro, depois pelo dia.
  const [ordenacao, setOrdenacao] = useState<Ordenacao<ColunaOrdenavel>>(null);

  // Ids marcados para as ações em lote.
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [processandoLote, setProcessandoLote] = useState(false);
  const caixaDeTodas = useRef<HTMLInputElement>(null);

  // A recorrência aberta no formulário lá de cima. Nula = criando uma nova.
  const [emEdicao, setEmEdicao] = useState<Recorrencia | null>(null);
  const cartaoDoFormulario = useRef<HTMLElement>(null);
  const campoDeDescricao = useRef<HTMLInputElement>(null);

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

        // A seleção guarda só o que ainda existe — uma recorrência apagada
        // não pode continuar contando nos botões do lote.
        const idsNaTela = new Set(lista.map((r) => r.id));
        setSelecionadas((atual) => new Set([...atual].filter((id) => idsNaTela.has(id))));
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

  /** Volta o formulário a uma recorrência nova, do zero. */
  function limparFormulario() {
    setEmEdicao(null);
    setDescricao('');
    setValor('');
    setCategoria('');
    setTipo('GASTO');
    setFormaDePagamento('');
    setClassificacao('');
    setDiaDoMes('1');
    setErroDoFormulario(null);
  }

  /** Carrega a recorrência clicada no formulário lá de cima e rola até ele. */
  function comecarEdicao(recorrencia: Recorrencia) {
    setEmEdicao(recorrencia);
    setDescricao(recorrencia.descricao);
    // "1500.00" → "R$ 1.500,00": a mesma máscara que a digitação usa.
    setValor(formatarEntradaMonetaria(recorrencia.valor.toFixed(2)));
    setCategoria(recorrencia.categoria);
    setTipo(recorrencia.tipo);
    setFormaDePagamento(recorrencia.formaDePagamento ?? '');
    setClassificacao(recorrencia.classificacao ?? '');
    setDiaDoMes(String(recorrencia.diaDoMes));
    setErroDoFormulario(null);
    setAviso(null);

    cartaoDoFormulario.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // `preventScroll`: o foco não briga com a rolagem suave que já começou.
    campoDeDescricao.current?.focus({ preventScroll: true });
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErroDoFormulario(null);
    setAviso(null);
    setSalvando(true);

    try {
      const valorNumerico = numeroDaEntradaMonetaria(valor);

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        throw new Error('Informe um valor maior que zero.');
      }

      const dados = {
        descricao,
        valor: valorNumerico,
        categoria,
        tipo,
        formaDePagamento: formaDePagamento || undefined,
        classificacao: tipo === 'GASTO' ? classificacao : ('' as const),
        diaDoMes: Number(diaDoMes),
      };

      if (emEdicao) {
        await editarRecorrencia(emEdicao.id, dados);
        setAviso(`"${descricao}" atualizada.`);
        // Tipo e dia vieram da recorrência editada; a próxima nova não deve
        // herdá-los.
        limparFormulario();
      } else {
        await criarRecorrencia(dados);
        // Limpa só o que muda de uma recorrência para a outra; tipo e dia
        // costumam se repetir quando se cadastra várias seguidas.
        setDescricao('');
        setValor('');
        setCategoria('');
      }

      // Traz para a lista a categoria que o backend acabou de memorizar.
      recarregarSugestoes();
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
      // Editar algo que não existe mais terminaria num 404 ao salvar.
      if (emEdicao?.id === recorrencia.id) limparFormulario();
      recarregar();
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui excluir.');
    }
  }

  // --- Seleção e ações em lote ------------------------------------------

  function alternarSelecao(id: number) {
    setSelecionadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  const marcadas = recorrencias.filter((r) => selecionadas.has(r.id));
  const ligadasMarcadas = marcadas.filter((r) => r.ativa);
  const desligadasMarcadas = marcadas.filter((r) => !r.ativa);

  const todasMarcadas = recorrencias.length > 0 && marcadas.length === recorrencias.length;
  const algumasMarcadas = marcadas.length > 0 && !todasMarcadas;

  // "Parcialmente marcado" não existe como atributo de HTML, só como
  // propriedade do elemento — por isso o ref, em vez de uma prop do JSX.
  useEffect(() => {
    if (caixaDeTodas.current) caixaDeTodas.current.indeterminate = algumasMarcadas;
  }, [algumasMarcadas]);

  function alternarTodas() {
    setSelecionadas(todasMarcadas ? new Set() : new Set(recorrencias.map((r) => r.id)));
  }

  /**
   * Roda uma ação em lote: trava os botões, limpa a seleção no fim e
   * recarrega a lista mesmo se der erro — parte pode ter mudado.
   */
  async function emLote(acao: () => Promise<string>) {
    setErroDaLista(null);
    setAviso(null);
    setProcessandoLote(true);
    try {
      setAviso(await acao());
      setSelecionadas(new Set());
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui concluir a ação.');
    } finally {
      setProcessandoLote(false);
      recarregar();
    }
  }

  function ligarMarcadas() {
    return emLote(async () => {
      const n = await alternarVariasRecorrencias(
        desligadasMarcadas.map((r) => r.id),
        true
      );
      return n === 1 ? '1 recorrência ligada.' : `${n} recorrências ligadas.`;
    });
  }

  function desligarMarcadas() {
    return emLote(async () => {
      const n = await alternarVariasRecorrencias(
        ligadasMarcadas.map((r) => r.id),
        false
      );
      return n === 1 ? '1 recorrência desligada.' : `${n} recorrências desligadas.`;
    });
  }

  function excluirMarcadas() {
    const quantidade = marcadas.length;
    const confirmado = window.confirm(
      `Apagar ${quantidade} ${quantidade === 1 ? 'recorrência' : 'recorrências'} de vez?\n\n` +
        'Para apenas tirá-las da projeção, use Desligar. ' +
        'Os lançamentos que já nasceram delas continuam.'
    );
    if (!confirmado) return;

    return emLote(async () => {
      const ids = marcadas.map((r) => r.id);
      const n = await excluirVariasRecorrencias(ids);
      if (emEdicao && ids.includes(emEdicao.id)) limparFormulario();
      return n === 1 ? '1 recorrência apagada.' : `${n} recorrências apagadas.`;
    });
  }

  /**
   * Clique em qualquer ponto da linha abre a edição — menos nos controles
   * que já têm função própria (caixinha, botões).
   */
  function aoClicarNaLinha(alvo: EventTarget, recorrencia: Recorrencia) {
    if ((alvo as HTMLElement).closest('button, input, label, a')) return;
    comecarEdicao(recorrencia);
  }

  const quantidadeAtiva = recorrencias.filter((r) => r.ativa).length;
  const recorrenciasOrdenadas = ordenarPor(recorrencias, ordenacao, valorDaColuna);

  return (
    <>
      <section
        ref={cartaoDoFormulario}
        className={emEdicao ? 'cartao cartao--formulario cartao--em-edicao' : 'cartao cartao--formulario'}
      >
        <h2>{emEdicao ? 'Editar recorrência' : 'Nova recorrência'}</h2>
        {emEdicao ? (
          <p className="explicacao">
            A mudança vale para as próximas previsões e para a <strong>Projeção</strong>.
            Os lançamentos que já nasceram desta recorrência continuam como foram
            lançados.
          </p>
        ) : (
          <p className="explicacao">
            Contas que se repetem todo mês: aluguel, assinatura, salário. Elas não
            entram no Dashboard — servem para a <strong>Projeção</strong> estimar
            os meses que ainda não chegaram. Quando a conta for de fato paga,
            lance-a normalmente em Lançamentos.
          </p>
        )}

        <form onSubmit={aoEnviar}>
          <div className="linha-de-campos">
            <label className="campo">
              <span>Descrição</span>
              <input
                ref={campoDeDescricao}
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
                sugestoes={sugestoes.CATEGORIA}
                aoExcluir={excluirSugestao}
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
                sugestoes={sugestoes.FORMA_DE_PAGAMENTO}
                aoExcluir={excluirSugestao}
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

          <div className="botoes-do-formulario">
            <button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : emEdicao ? 'Salvar alterações' : 'Adicionar recorrência'}
            </button>
            {emEdicao && (
              <button
                type="button"
                className="botao--discreto"
                onClick={limparFormulario}
                disabled={salvando}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="cartao">
        <h2>Recorrências</h2>

        <AvisoTemporario texto={aviso} />
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

            {/* A caixinha de "todas" fica aqui, e não no cabeçalho da tabela:
                no celular o cabeçalho some. Cada botão conta só as linhas em
                que ele age — "Ligar (1)" numa seleção de 3 avisa que duas já
                estão ligadas. */}
            <div className="barra-de-lote">
              <label className="barra-de-lote__todos">
                <input
                  ref={caixaDeTodas}
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={alternarTodas}
                />
                {marcadas.length === 0
                  ? 'Selecionar todas'
                  : `${marcadas.length} ${marcadas.length === 1 ? 'selecionada' : 'selecionadas'}`}
              </label>

              {marcadas.length > 0 && (
                <div className="acoes">
                  {desligadasMarcadas.length > 0 && (
                    <button
                      type="button"
                      className="botao--discreto botao--acao botao--acao-concluir"
                      disabled={processandoLote}
                      onClick={ligarMarcadas}
                    >
                      <Power weight="bold" aria-hidden="true" />
                      Ligar ({desligadasMarcadas.length})
                    </button>
                  )}
                  {ligadasMarcadas.length > 0 && (
                    <button
                      type="button"
                      className="botao--discreto botao--acao botao--acao-reabrir"
                      disabled={processandoLote}
                      onClick={desligarMarcadas}
                    >
                      <Power weight="bold" aria-hidden="true" />
                      Desligar ({ligadasMarcadas.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className="botao--discreto botao--perigo botao--acao botao--acao-excluir"
                    disabled={processandoLote}
                    onClick={excluirMarcadas}
                  >
                    <Trash weight="bold" aria-hidden="true" />
                    Excluir ({marcadas.length})
                  </button>
                </div>
              )}
            </div>

            <div className="tabela-rolavel"><table className="tabela">
              <thead>
                <tr>
                  <th className="celula-selecao" aria-label="Seleção" />
                  {(
                    [
                      ['dia', 'Dia'],
                      ['descricao', 'Descrição'],
                      ['categoria', 'Categoria'],
                      ['pagamento', 'Pagamento'],
                      ['valor', 'Valor'],
                    ] as const
                  ).map(([coluna, rotulo]) => (
                    <TituloOrdenavel
                      key={coluna}
                      coluna={coluna}
                      rotulo={rotulo}
                      ordenacao={ordenacao}
                      aoClicar={(c) => setOrdenacao((atual) => proximaOrdenacao(atual, c))}
                      alinhadoDireita={coluna === 'valor'}
                    />
                  ))}
                  <th className="alinhado-direita">Ações</th>
                </tr>
              </thead>
              <tbody>
                {recorrenciasOrdenadas.map((r) => {
                  const classesDaLinha = [
                    'linha--editavel',
                    !r.ativa && 'linha--desligada',
                    selecionadas.has(r.id) && 'linha--selecionada',
                    emEdicao?.id === r.id && 'linha--em-edicao',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <tr
                      key={r.id}
                      className={classesDaLinha}
                      onClick={(e) => aoClicarNaLinha(e.target, r)}
                    >
                      <td className="celula-selecao" data-rotulo="Selecionar">
                        <input
                          type="checkbox"
                          checked={selecionadas.has(r.id)}
                          onChange={() => alternarSelecao(r.id)}
                          aria-label={`Selecionar ${r.descricao}`}
                        />
                      </td>
                      <td data-rotulo="Dia">{r.diaDoMes}</td>
                      <td>
                        {/* O clique na linha já abre a edição; este botão é o
                            mesmo caminho para quem navega pelo teclado. */}
                        <button
                          type="button"
                          className="botao-de-edicao"
                          onClick={() => comecarEdicao(r)}
                          title="Editar esta recorrência"
                        >
                          {r.descricao}
                        </button>
                        {r.classificacao && (
                          <span className="etiqueta">
                            {r.classificacao === 'FIXO' ? 'Fixo' : 'Variável'}
                          </span>
                        )}
                      </td>
                      <td data-rotulo="Categoria">{r.categoria}</td>
                      <td data-rotulo="Pagamento">{r.formaDePagamento ?? '—'}</td>
                      <td
                        data-rotulo="Valor"
                        className={`alinhado-direita ${r.tipo === 'GANHO' ? 'ganho' : 'gasto'}`}
                      >
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
                  );
                })}
              </tbody>
            </table></div>
          </>
        )}
      </section>
    </>
  );
}

export default Recorrencias;
