import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { mesAtualISO } from '../formato.ts';

/**
 * Navegação por mês, no topo de todas as telas que trabalham com um mês.
 *
 * Antes cada tela tinha seu próprio seletor, e trocar de aba jogava você de
 * volta para o mês corrente. Aqui o mês é escolhido uma vez e vale para o app
 * inteiro — é assim que se navega uma planilha de contas.
 */

const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

interface Props {
  /** Mês selecionado, no formato "AAAA-MM". */
  mes: string;
  aoTrocar: (mes: string) => void;
}

function TrilhaDeMeses({ mes, aoTrocar }: Props) {
  const anoSelecionado = Number(mes.slice(0, 4));

  // O ano mostrado na régua é independente do selecionado: dá para espiar
  // dezembro do ano que vem sem sair de agosto.
  const [anoVisivel, setAnoVisivel] = useState(anoSelecionado);

  // Se o mês mudar por fora (ao lançar algo em outro ano, por exemplo), a
  // régua acompanha — senão o mês ativo ficaria invisível.
  useEffect(() => {
    setAnoVisivel(anoSelecionado);
  }, [anoSelecionado]);

  const mesDeHoje = mesAtualISO();

  const botoesDosMeses = useRef<Array<HTMLButtonElement | null>>([]);

  function navegarPeloTeclado(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let destino: number | undefined;

    if (evento.key === 'ArrowLeft') destino = Math.max(0, indice - 1);
    if (evento.key === 'ArrowRight') destino = Math.min(MESES.length - 1, indice + 1);
    if (evento.key === 'Home') destino = 0;
    if (evento.key === 'End') destino = MESES.length - 1;

    if (destino === undefined) return;

    evento.preventDefault();
    botoesDosMeses.current[destino]?.focus();
  }

  return (
    <nav className="trilha" aria-label="Selecionar mês">
      <div className="trilha__controle-ano">
        <button
          type="button"
          className="trilha__navegacao trilha__navegacao--antes"
          onClick={() => setAnoVisivel((a) => a - 1)}
          aria-label={`Ver ${anoVisivel - 1}`}
        >
          <CaretLeft weight="bold" aria-hidden="true" />
        </button>

        <div className="trilha__ano" aria-live="polite">
          <span className="trilha__ano-rotulo">Ano</span>
          <strong key={anoVisivel}>{anoVisivel}</strong>
        </div>

        <button
          type="button"
          className="trilha__navegacao trilha__navegacao--depois"
          onClick={() => setAnoVisivel((a) => a + 1)}
          aria-label={`Ver ${anoVisivel + 1}`}
        >
          <CaretRight weight="bold" aria-hidden="true" />
        </button>
      </div>

      <div className="trilha__meses">
        {MESES.map((rotulo, indice) => {
          const valor = `${anoVisivel}-${String(indice + 1).padStart(2, '0')}`;
          const ativo = valor === mes;

          const classes = ['trilha__mes'];
          if (ativo) classes.push('trilha__mes--ativo');
          if (valor === mesDeHoje) classes.push('trilha__mes--atual');

          return (
            <button
              key={valor}
              type="button"
              className={classes.join(' ')}
              onClick={() => aoTrocar(valor)}
              onKeyDown={(evento) => navegarPeloTeclado(evento, indice)}
              ref={(elemento) => {
                botoesDosMeses.current[indice] = elemento;
              }}
              aria-current={ativo ? 'true' : undefined}
              aria-label={`${rotulo} de ${anoVisivel}${valor === mesDeHoje ? ', mês atual' : ''}`}
            >
              <span>{rotulo}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default TrilhaDeMeses;
