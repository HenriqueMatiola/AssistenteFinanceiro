import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { CaretDown, Check } from '@phosphor-icons/react';

interface Sugestao {
  valor: string;
  detalhe?: string;
}

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  sugestoes: readonly (string | Sugestao)[];
  placeholder?: string;
  obrigatorio?: boolean;
  rotuloAcessivel: string;
}

function normalizar(sugestao: string | Sugestao): Sugestao {
  return typeof sugestao === 'string' ? { valor: sugestao } : sugestao;
}

function CampoComSugestoes({
  valor,
  aoMudar,
  sugestoes,
  placeholder,
  obrigatorio,
  rotuloAcessivel,
}: Props) {
  const [aberto, setAberto] = useState(false);

  return (
    <Command className="combobox" shouldFilter>
      <Popover.Root open={aberto} onOpenChange={setAberto}>
        <Popover.Anchor asChild>
          <div className="combobox__campo" data-state={aberto ? 'open' : 'closed'}>
            <Command.Input
              className="combobox__entrada"
              value={valor}
              onValueChange={(novoValor) => {
                aoMudar(novoValor);
                setAberto(true);
              }}
              onFocus={() => setAberto(true)}
              placeholder={placeholder}
              required={obrigatorio}
              aria-label={rotuloAcessivel}
            />
            <button
              type="button"
              className="combobox__seta"
              aria-label={aberto ? 'Fechar sugestões' : 'Abrir sugestões'}
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => setAberto((estado) => !estado)}
            >
              <CaretDown weight="bold" aria-hidden="true" />
            </button>
          </div>
        </Popover.Anchor>

        <Popover.Portal>
          <Popover.Content
            className="combobox__conteudo"
            sideOffset={6}
            align="start"
            collisionPadding={12}
            onOpenAutoFocus={(evento) => evento.preventDefault()}
          >
            <Command.List className="combobox__lista">
              <Command.Empty className="combobox__vazio">
                Digite para usar um novo valor
              </Command.Empty>
              {sugestoes.map(normalizar).map((sugestao) => (
                <Command.Item
                  key={sugestao.valor}
                  value={sugestao.valor}
                  className="combobox__opcao"
                  onSelect={(selecionado) => {
                    aoMudar(selecionado);
                    setAberto(false);
                  }}
                >
                  <span>
                    <strong>{sugestao.valor}</strong>
                    {sugestao.detalhe && <small>{sugestao.detalhe}</small>}
                  </span>
                  {valor.toLocaleLowerCase() === sugestao.valor.toLocaleLowerCase() && (
                    <Check weight="bold" aria-hidden="true" />
                  )}
                </Command.Item>
              ))}
            </Command.List>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Command>
  );
}

export default CampoComSugestoes;
