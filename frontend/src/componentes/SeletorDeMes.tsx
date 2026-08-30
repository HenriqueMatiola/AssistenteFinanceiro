import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDots, CaretLeft, CaretRight } from '@phosphor-icons/react';

const MESES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  rotuloAcessivel: string;
  maximo?: string;
}

function SeletorDeMes({ valor, aoMudar, rotuloAcessivel, maximo }: Props) {
  const referencia = valor || maximo || '';
  const anoInicial = Number(referencia.slice(0, 4)) || new Date().getFullYear();
  const [ano, setAno] = useState(anoInicial);
  const [aberto, setAberto] = useState(false);

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>
        <button type="button" className="seletor-data__gatilho" aria-label={rotuloAcessivel}>
          <span>
            {valor
              ? `${MESES[Number(valor.slice(5, 7)) - 1]} de ${valor.slice(0, 4)}`
              : 'Todos os meses'}
          </span>
          <CalendarDots weight="duotone" aria-hidden="true" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="seletor-mes__conteudo"
          sideOffset={6}
          align="start"
          collisionPadding={12}
        >
          <div className="seletor-mes__cabecalho">
            <button type="button" onClick={() => setAno((atual) => atual - 1)} aria-label="Ano anterior">
              <CaretLeft weight="bold" aria-hidden="true" />
            </button>
            <strong>{ano}</strong>
            <button type="button" onClick={() => setAno((atual) => atual + 1)} aria-label="Próximo ano">
              <CaretRight weight="bold" aria-hidden="true" />
            </button>
          </div>

          <div className="seletor-mes__grade">
            {MESES.map((rotulo, indice) => {
              const mes = `${ano}-${String(indice + 1).padStart(2, '0')}`;
              const desabilitado = Boolean(maximo && mes > maximo);
              return (
                <button
                  key={mes}
                  type="button"
                  className={mes === valor ? 'seletor-mes__mes seletor-mes__mes--ativo' : 'seletor-mes__mes'}
                  disabled={desabilitado}
                  onClick={() => {
                    aoMudar(mes);
                    setAberto(false);
                  }}
                >
                  {rotulo}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default SeletorDeMes;
