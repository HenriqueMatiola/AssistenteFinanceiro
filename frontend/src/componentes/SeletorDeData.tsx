import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';
import { CalendarBlank } from '@phosphor-icons/react';
import 'react-day-picker/style.css';

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  obrigatorio?: boolean;
  rotuloAcessivel: string;
  maximo?: string;
  /** Dias anteriores a este ficam desligados no calendário. */
  minimo?: string;
}

function dataLocal(valor: string) {
  if (!valor) return undefined;
  const [ano, mes, dia] = valor.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function SeletorDeData({ valor, aoMudar, obrigatorio, rotuloAcessivel, maximo, minimo }: Props) {
  const [aberto, setAberto] = useState(false);
  const selecionada = dataLocal(valor);
  const limite = dataLocal(maximo ?? '');
  const piso = dataLocal(minimo ?? '');

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="seletor-data__gatilho"
          aria-label={rotuloAcessivel}
          aria-required={obrigatorio}
        >
          <span>{selecionada ? format(selecionada, 'dd/MM/yyyy') : 'Selecionar data'}</span>
          <CalendarBlank weight="duotone" aria-hidden="true" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="seletor-data__conteudo"
          sideOffset={6}
          align="start"
          collisionPadding={12}
        >
          <DayPicker
            mode="single"
            locale={ptBR}
            selected={selecionada}
            defaultMonth={selecionada}
            /* O calendário já recusa o que o backend recusaria: data fora do
               teto, ou — no vencimento — anterior à data do lançamento. */
            disabled={[
              ...(limite ? [{ after: limite }] : []),
              ...(piso ? [{ before: piso }] : []),
            ]}
            showOutsideDays
            fixedWeeks
            onSelect={(novaData) => {
              if (!novaData) return;
              aoMudar(format(novaData, 'yyyy-MM-dd'));
              setAberto(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default SeletorDeData;
