import * as Select from '@radix-ui/react-select';
import { CaretDown, Check } from '@phosphor-icons/react';

const VALOR_VAZIO = '__valor_vazio__';

interface Opcao<T extends string | number> {
  valor: T;
  rotulo: string;
}

interface Props<T extends string | number> {
  valor: T;
  opcoes: readonly Opcao<T>[];
  aoMudar: (valor: T) => void;
  rotuloAcessivel: string;
}

function codificar(valor: string | number) {
  return valor === '' ? VALOR_VAZIO : valor;
}

function SelectPersonalizado<T extends string | number>({
  valor,
  opcoes,
  aoMudar,
  rotuloAcessivel,
}: Props<T>) {
  return (
    <Select.Root
      value={String(codificar(valor))}
      onValueChange={(novoValor) => {
        const opcao = opcoes.find((item) => String(codificar(item.valor)) === novoValor);
        if (opcao) aoMudar(opcao.valor);
      }}
    >
      <Select.Trigger className="select-personalizado__gatilho" aria-label={rotuloAcessivel}>
        <Select.Value />
        <Select.Icon className="select-personalizado__seta">
          <CaretDown weight="bold" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="select-personalizado__conteudo"
          position="popper"
          sideOffset={6}
          align="start"
          collisionPadding={12}
        >
          <Select.Viewport className="select-personalizado__lista">
            {opcoes.map((opcao) => (
              <Select.Item
                key={String(codificar(opcao.valor))}
                value={String(codificar(opcao.valor))}
                className="select-personalizado__opcao"
              >
                <Select.ItemText>{opcao.rotulo}</Select.ItemText>
                <Select.ItemIndicator className="select-personalizado__indicador">
                  <Check weight="bold" aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export default SelectPersonalizado;
