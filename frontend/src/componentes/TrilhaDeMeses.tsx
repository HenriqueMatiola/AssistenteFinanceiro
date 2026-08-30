import { useEffect, useState } from 'react';
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

  return (
    <nav className="trilha" aria-label="Selecionar mês">
      <button
        type="button"
        className="trilha__navegacao trilha__navegacao--antes"
        onClick={() => setAnoVisivel((a) => a - 1)}
        aria-label={`Ver ${anoVisivel - 1}`}
      >
        ‹
      </button>

      <span className="trilha__ano">{anoVisivel}</span>

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
              aria-current={ativo ? 'true' : undefined}
            >
              {rotulo}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="trilha__navegacao trilha__navegacao--depois"
        onClick={() => setAnoVisivel((a) => a + 1)}
        aria-label={`Ver ${anoVisivel + 1}`}
      >
        ›
      </button>
    </nav>
  );
}

export default TrilhaDeMeses;
