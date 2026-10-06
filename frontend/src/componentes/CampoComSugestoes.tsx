import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { CaretDown, Check, X } from '@phosphor-icons/react';

interface Sugestao {
  valor: string;
  detalhe?: string;
  /**
   * Presente nas opções que a própria pessoa criou digitando. É o que permite
   * apagá-las — as fixas do app, como os exemplos de ativo, não têm id e por
   * isso não ganham o botão de excluir.
   */
  id?: number;
}

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  sugestoes: readonly (string | Sugestao)[];
  placeholder?: string;
  obrigatorio?: boolean;
  rotuloAcessivel: string;
  /** Quando existe, as opções com `id` ganham um "x" para sair da lista. */
  aoExcluir?: (id: number) => void;
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
  aoExcluir,
}: Props) {
  const [aberto, setAberto] = useState(false);

  /*
   * O campo inteiro — entrada e seta.
   *
   * Existe por causa de um detalhe do Radix: a lista é ancorada neste bloco
   * (`Popover.Anchor`), e não disparada por ele (`Popover.Trigger`), porque
   * quem manda abrir é o foco na entrada. Só que o Radix então não reconhece
   * este bloco como parte do popover, e trata o clique que ABRE a lista como
   * um clique fora dela — fechando no mesmo gesto. A referência é o que
   * permite dizer "este clique foi aqui dentro" lá embaixo.
   */
  const campo = useRef<HTMLDivElement>(null);

  return (
    <Command className="combobox" shouldFilter>
      <Popover.Root open={aberto} onOpenChange={setAberto}>
        <Popover.Anchor asChild>
          <div
            ref={campo}
            className="combobox__campo"
            data-state={aberto ? 'open' : 'closed'}
          >
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
            /*
             * Sem isto, clicar na entrada abria e fechava a lista no mesmo
             * clique: o foco abre o popover ainda durante o `mousedown`, e o
             * Radix contava esse mesmo gesto como "interagiu fora" — só a
             * seta funcionava, porque ela cancela o `mousedown` e só alterna
             * depois. Cliques dentro do campo não fecham mais nada.
             */
            onInteractOutside={(evento) => {
              if (campo.current?.contains(evento.target as Node)) {
                evento.preventDefault();
              }
            }}
          >
            <Command.List className="combobox__lista">
              <Command.Empty className="combobox__vazio">
                {sugestoes.length === 0
                  ? 'Digite e salve: o que você usar fica guardado aqui.'
                  : 'Digite para usar um novo valor'}
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

                  {aoExcluir && sugestao.id !== undefined && (
                    <button
                      type="button"
                      className="combobox__excluir"
                      aria-label={`Tirar "${sugestao.valor}" da lista`}
                      /*
                       * O cmdk escolhe a opção no clique da LINHA inteira, e o
                       * "x" mora dentro dela. Sem segurar o evento nas duas
                       * pontas, apagar também preencheria o campo com o valor
                       * que acabou de sumir.
                       */
                      onMouseDown={(evento) => {
                        evento.preventDefault();
                        evento.stopPropagation();
                      }}
                      onClick={(evento) => {
                        evento.stopPropagation();
                        aoExcluir(sugestao.id!);
                      }}
                    >
                      <X weight="bold" aria-hidden="true" />
                    </button>
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
