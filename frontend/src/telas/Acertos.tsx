import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash, X } from '@phosphor-icons/react';
import {
  criarAcerto,
  excluirAcerto,
  excluirBaixa,
  listarAcertos,
  registrarBaixa,
  type Acerto,
  type TipoDeAcerto,
  type TotaisDeAcertos,
} from '../api.ts';
import {
  formatarData,
  formatarDinheiro,
  formatarEntradaMonetaria,
  hojeISO,
  numeroDaEntradaMonetaria,
} from '../formato.ts';
import CampoComSugestoes from '../componentes/CampoComSugestoes.tsx';
import SelectPersonalizado from '../componentes/SelectPersonalizado.tsx';
import SeletorDeData from '../componentes/SeletorDeData.tsx';

const TOTAIS_ZERADOS: TotaisDeAcertos = { aReceber: 0, aPagar: 0, liquido: 0 };

/**
 * A aba "A receber e a pagar".
 *
 * Para dinheiro que mudou de lugar entre você e alguém e ainda vai voltar, sem
 * data para acontecer: um empréstimo, uma conta que você adiantou, o rateio de
 * uma viagem. É essa falta de data que a separa de um lançamento pendente —
 * aquele tem dia certo e por isso entra no balanço do mês; este não pertence a
 * mês nenhum, e nada daqui aparece no Dashboard.
 *
 * Cada acerto nasce com um valor e vai sendo abatido por pagamentos parciais.
 * Quem faz a conta é o backend: a tela recarrega depois de cada mudança em vez
 * de somar por conta própria, senão o topo e a lista poderiam discordar.
 */
function Acertos() {
  const [acertos, setAcertos] = useState<Acerto[]>([]);
  const [totais, setTotais] = useState<TotaisDeAcertos>(TOTAIS_ZERADOS);
  const [carregando, setCarregando] = useState(true);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);

  // Muda para forçar a lista a recarregar depois de criar, abater ou apagar.
  const [versaoDaLista, setVersaoDaLista] = useState(0);

  // Formulário de novo acerto.
  const [tipo, setTipo] = useState<TipoDeAcerto>('RECEBER');
  const [pessoa, setPessoa] = useState('');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);

  // O formulário de pagamento abre DENTRO de um acerto: guardamos qual.
  const [acertoAberto, setAcertoAberto] = useState<number | null>(null);
  const [dataDaBaixa, setDataDaBaixa] = useState(hojeISO());
  const [valorDaBaixa, setValorDaBaixa] = useState('');
  const [erroDaBaixa, setErroDaBaixa] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

  useEffect(() => {
    // Se a lista recarregar antes da resposta chegar, esta flag descarta o
    // resultado atrasado — senão uma busca antiga sobrescreveria a nova.
    let cancelado = false;

    listarAcertos()
      .then((resposta) => {
        if (cancelado) return;
        setAcertos(resposta.acertos);
        setTotais(resposta.totais);
        setErroDaLista(null);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setErroDaLista(e instanceof Error ? e.message : 'Não consegui carregar os acertos.');
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

  /**
   * As pessoas que já aparecem na lista viram sugestões do campo.
   *
   * É o que evita que "João" e "Joao" virem duas pessoas diferentes nos totais
   * — o backend não tem como saber que são a mesma, então quem resolve isso é
   * a tela, oferecendo o nome que já existe antes de a pessoa digitar outro.
   */
  const pessoasJaUsadas = useMemo(
    () => [...new Set(acertos.map((a) => a.pessoa))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [acertos]
  );

  const emAberto = acertos.filter((a) => !a.quitado);
  const quitados = acertos.filter((a) => a.quitado);

  function abrirBaixa(acerto: Acerto) {
    setAcertoAberto(acerto.id);
    setDataDaBaixa(hojeISO());
    setValorDaBaixa('');
    setErroDaBaixa(null);
  }

  function fecharBaixa() {
    setAcertoAberto(null);
    setErroDaBaixa(null);
  }

  async function aoCriar(evento: FormEvent) {
    evento.preventDefault();
    setErroDoFormulario(null);
    setSalvando(true);

    try {
      const valorNumerico = numeroDaEntradaMonetaria(valor);

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        throw new Error('Informe um valor maior que zero.');
      }

      await criarAcerto({
        tipo,
        pessoa,
        valor: valorNumerico,
        descricao: descricao || undefined,
      });

      // O tipo fica como estava: quem está registrando várias dívidas de uma
      // vez costuma estar do mesmo lado do balcão.
      setPessoa('');
      setValor('');
      setDescricao('');
      recarregar();
    } catch (e) {
      setErroDoFormulario(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function aoRegistrarBaixa(evento: FormEvent, acerto: Acerto) {
    evento.preventDefault();
    setErroDaBaixa(null);
    setRegistrando(true);

    try {
      const valorNumerico = numeroDaEntradaMonetaria(valorDaBaixa);

      if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
        throw new Error('Informe um valor maior que zero.');
      }

      await registrarBaixa(acerto.id, { data: dataDaBaixa, valor: valorNumerico });

      fecharBaixa();
      recarregar();
    } catch (e) {
      setErroDaBaixa(e instanceof Error ? e.message : 'Não consegui registrar.');
    } finally {
      setRegistrando(false);
    }
  }

  async function aoExcluirAcerto(acerto: Acerto) {
    // Apagar leva o histórico junto, e isso não tem volta — daí a pergunta.
    const confirmado = window.confirm(
      `Apagar o acerto de ${formatarDinheiro(acerto.valor)} com ${acerto.pessoa}? ` +
        'O histórico de pagamentos vai junto.'
    );
    if (!confirmado) return;

    setErroDaLista(null);
    try {
      await excluirAcerto(acerto.id);
      recarregar();
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui excluir.');
    }
  }

  async function aoExcluirBaixa(acerto: Acerto, baixaId: number) {
    setErroDaLista(null);
    try {
      await excluirBaixa(acerto.id, baixaId);
      recarregar();
    } catch (e) {
      setErroDaLista(e instanceof Error ? e.message : 'Não consegui apagar o pagamento.');
    }
  }

  /** Um acerto e todo o histórico dele. */
  function cartaoDoAcerto(a: Acerto) {
    const ehReceber = a.tipo === 'RECEBER';
    const cor = ehReceber ? 'ganho' : 'gasto';

    return (
      <li key={a.id} className={a.quitado ? 'acerto acerto--quitado' : 'acerto'}>
        <div className="acerto__topo">
          <div>
            <span className="acerto__pessoa">{a.pessoa}</span>
            <span className={`etiqueta etiqueta--${cor}`}>
              {ehReceber ? 'A receber' : 'A pagar'}
            </span>
            {a.descricao && <span className="acerto__descricao">{a.descricao}</span>}
          </div>

          <div className="acerto__numeros">
            <span className={`acerto__saldo ${a.quitado ? '' : cor}`}>
              {a.quitado ? 'Quitado' : formatarDinheiro(a.saldo)}
            </span>
            {a.pago > 0 && (
              <span className="acerto__detalhe">
                {formatarDinheiro(a.pago)} de {formatarDinheiro(a.valor)}
              </span>
            )}
          </div>
        </div>

        {a.baixas.length > 0 && (
          <ul className="acerto__historico">
            {a.baixas.map((b) => (
              <li key={b.id} className="acerto__baixa">
                <span className="acerto__baixa-data">{formatarData(b.data)}</span>
                <span className="acerto__baixa-valor">
                  {ehReceber ? 'Recebi' : 'Paguei'} {formatarDinheiro(b.valor)}
                </span>
                <button
                  type="button"
                  className="botao--discreto botao--perigo acerto__desfazer"
                  onClick={() => void aoExcluirBaixa(a, b.id)}
                  aria-label={`Apagar o pagamento de ${formatarDinheiro(b.valor)} em ${formatarData(b.data)}`}
                >
                  <X weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {acertoAberto === a.id ? (
          <form className="acerto__form" onSubmit={(e) => void aoRegistrarBaixa(e, a)}>
            <label className="campo">
              <span>Quando</span>
              <SeletorDeData
                valor={dataDaBaixa}
                aoMudar={setDataDaBaixa}
                rotuloAcessivel={`Data do pagamento com ${a.pessoa}`}
                obrigatorio
              />
            </label>

            <label className="campo">
              <span>Quanto</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={valorDaBaixa}
                onChange={(e) => setValorDaBaixa(formatarEntradaMonetaria(e.target.value))}
                className="campo__dinheiro"
                required
              />
            </label>

            {/* Preenche o campo com o que falta, em vez de registrar direto:
                quitar é a ação mais comum e a mais fácil de errar sem querer,
                então ela ainda passa pelo botão de confirmar. */}
            <button
              type="button"
              className="botao--discreto"
              onClick={() => setValorDaBaixa(formatarEntradaMonetaria(a.saldo.toFixed(2)))}
            >
              Tudo ({formatarDinheiro(a.saldo)})
            </button>

            <button type="submit" disabled={registrando}>
              {registrando ? 'Registrando…' : 'Registrar'}
            </button>

            <button type="button" className="botao--discreto" onClick={fecharBaixa}>
              Cancelar
            </button>

            {erroDaBaixa && <p className="mensagem-erro acerto__erro">{erroDaBaixa}</p>}
          </form>
        ) : (
          <div className="acoes">
            {!a.quitado && (
              <button
                type="button"
                className="botao--discreto botao--acao botao--acao-concluir"
                onClick={() => abrirBaixa(a)}
              >
                <Plus weight="bold" aria-hidden="true" />
                {ehReceber ? 'Registrar recebimento' : 'Registrar pagamento'}
              </button>
            )}

            <button
              type="button"
              className="botao--discreto botao--perigo botao--acao botao--acao-excluir"
              onClick={() => void aoExcluirAcerto(a)}
            >
              <Trash weight="bold" aria-hidden="true" />
              Excluir
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <>
      {/*
        Os totais grudam abaixo da barra superior e acompanham a rolagem: com a
        lista longa, o número que responde "no fim das contas, sobra ou falta?"
        é justamente o que se quer olhar enquanto se percorre as linhas.
      */}
      <section className="cartao totais-fixos">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__rotulo">Tenho a receber</span>
            <span className="kpi__valor ganho">{formatarDinheiro(totais.aReceber)}</span>
          </div>
          <div className="kpi">
            <span className="kpi__rotulo">Tenho a pagar</span>
            <span className="kpi__valor gasto">{formatarDinheiro(totais.aPagar)}</span>
          </div>
          <div className="kpi">
            <span className="kpi__rotulo">No saldo</span>
            <span
              className={`kpi__valor ${
                totais.liquido === 0 ? '' : totais.liquido < 0 ? 'gasto' : 'ganho'
              }`}
            >
              {formatarDinheiro(totais.liquido)}
            </span>
          </div>
        </div>
      </section>

      <section className="cartao">
        <h2>Novo acerto</h2>
        <p className="explicacao">
          Dinheiro emprestado, adiantado ou rateado com alguém, <strong>sem data
          para acontecer</strong>. Se a conta tem dia certo, ela é um lançamento
          — cadastre em Lançamentos, para entrar no balanço do mês. Nada desta
          aba aparece no Dashboard: emprestar não é gastar, é dinheiro que muda
          de lugar e volta.
        </p>

        <form onSubmit={(e) => void aoCriar(e)}>
          <div className="linha-de-campos">
            <label className="campo">
              <span>O quê</span>
              <SelectPersonalizado<TipoDeAcerto>
                valor={tipo}
                aoMudar={setTipo}
                rotuloAcessivel="Tipo do acerto"
                opcoes={[
                  { valor: 'RECEBER', rotulo: 'Tenho a receber' },
                  { valor: 'PAGAR', rotulo: 'Tenho a pagar' },
                ]}
              />
            </label>

            <label className="campo">
              <span>Quem</span>
              <CampoComSugestoes
                valor={pessoa}
                aoMudar={setPessoa}
                sugestoes={pessoasJaUsadas}
                placeholder="Ex: João"
                rotuloAcessivel="Com quem é o acerto"
                obrigatorio
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

          <label className="campo campo--sozinho">
            <span>Do que se trata (opcional)</span>
            <input
              type="text"
              placeholder="Ex: gasolina da viagem"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </label>

          {erroDoFormulario && <p className="mensagem-erro">{erroDoFormulario}</p>}

          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Adicionar acerto'}
          </button>
        </form>
      </section>

      <section className="cartao">
        <h2>Em aberto</h2>

        {carregando && <p>Carregando…</p>}
        {erroDaLista && <p className="mensagem-erro">{erroDaLista}</p>}

        {!carregando && !erroDaLista && emAberto.length === 0 && (
          <p className="vazio">
            Nada em aberto. Quando alguém te dever — ou você dever a alguém —
            sem data para acertar, é aqui que a conta fica.
          </p>
        )}

        {emAberto.length > 0 && <ul className="acertos">{emAberto.map(cartaoDoAcerto)}</ul>}
      </section>

      {quitados.length > 0 && (
        <section className="cartao">
          <h2>Já quitados</h2>
          <p className="explicacao">
            Ficam aqui como histórico: eles não somam mais nada no topo, mas
            continuam contando quando cada pagamento aconteceu.
          </p>
          <ul className="acertos">{quitados.map(cartaoDoAcerto)}</ul>
        </section>
      )}
    </>
  );
}

export default Acertos;
