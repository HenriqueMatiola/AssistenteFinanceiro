import { useState } from 'react';
import type { FatiaDoGrafico } from '../fatias.ts';
import { formatarDinheiro } from '../formato.ts';

/**
 * A rosca de gastos por categoria, com a legenda ao lado.
 *
 * SVG escrito à mão, sem biblioteca de gráfico — é a mesma escolha que as
 * barras antigas seguiam, e aqui ela custa umas vinte linhas de aritmética.
 *
 * ## Como o desenho funciona
 *
 * Cada fatia é um CÍRCULO inteiro com um tracejado de um traço só: o traço
 * tem o comprimento da fatia e o vão cobre todo o resto da volta. Empurrando
 * o início de cada um (`stroke-dashoffset`) as fatias se encaixam uma após a
 * outra. Sai mais simples e mais exato que montar arcos com `path`, que
 * exigiria seno e cosseno para cada ponta — e erra feio em 100%, onde o arco
 * começa e termina no mesmo lugar.
 *
 * `pathLength={100}` é o truque que amarra tudo: ele declara que a volta
 * inteira vale 100, então comprimento de traço É porcentagem, e nenhuma conta
 * aqui precisa saber o raio de verdade.
 *
 * ## Leitores de tela
 *
 * A rosca é `aria-hidden`: ela não carrega nenhuma informação que a legenda ao
 * lado não diga em texto. É a mesma decisão que as barras antigas tomavam.
 */

/** Raio da linha de centro do anel, nas unidades do `viewBox` de 100×100. */
const RAIO = 38;

/** Espessura do anel. Fino o bastante para não virar um bolo de cor. */
const ESPESSURA = 16;

/**
 * O vão entre duas fatias, nas unidades de `pathLength`.
 *
 * A regra de desenho pede 2px na cor da superfície separando marcas que se
 * tocam. Com a rosca renderizada perto de 170px, a volta mede cerca de 400px,
 * e 2px dela dão meio por cento — daí o 0,5. É aproximado de propósito: fixar
 * em px exigiria medir o elemento no navegador a cada render, para um ganho
 * que ninguém enxerga.
 */
const VAO = 0.5;

/**
 * Nenhuma fatia desenha menos que isto, mesmo valendo 0,1% do mês.
 *
 * Sem o mínimo, uma categoria pequena vira um traço de espessura zero, que não
 * se distingue de "não existe". É o mesmo acordo que as barras faziam com a
 * largura mínima: distorce a proporção de quem já é minúsculo, em troca de
 * provar que existe.
 */
const FATIA_MINIMA = 0.8;

interface Props {
  fatias: FatiaDoGrafico[];
  /** Vai no buraco do meio — é o que a soma das fatias dá. */
  total: number;
}

/** A cor de uma fatia: um tom de série, ou o cinza do agrupado. */
function corDaFatia(fatia: FatiaDoGrafico): string {
  return fatia.cor === null ? 'var(--texto-suave)' : `var(--serie-${fatia.cor})`;
}

/**
 * Quanto o total do miolo pode medir sem encostar no anel.
 *
 * O buraco tem largura fixa; o total, não. "R$ 1.112.650,00" tem meia dúzia de
 * caracteres a mais que "R$ 2.650,00" e atravessava as fatias. Como a fonte de
 * dados é monoespaçada, contar caracteres prevê a largura bem o suficiente —
 * medir o elemento de verdade exigiria ler o layout no navegador a cada
 * render, por um ganho que ninguém enxerga.
 */
function tamanhoDoTotal(texto: string): string {
  if (texto.length <= 12) return '1.05rem';
  if (texto.length <= 14) return '0.85rem';
  return '0.72rem';
}

function GraficoDeRosca({ fatias, total }: Props) {
  /*
   * Qual fatia está sob o cursor. Serve só para apagar levemente as outras,
   * de um lado e do outro: passar o mouse na rosca acende a linha da legenda,
   * e passar na legenda acende a fatia.
   *
   * É enfeite, e por isso só responde ao mouse: a informação toda já está
   * escrita na legenda, então quem navega por teclado não perde nada, e dar
   * foco a itens que não fazem nada só encompridaria a travessia por Tab.
   */
  const [destacada, setDestacada] = useState<number | null>(null);

  // Onde cada fatia começa na volta. Vai somando conforme desenhamos.
  let percorrido = 0;

  return (
    <div className="rosca">
      <div className="rosca__desenho">
        <svg viewBox="0 0 100 100" className="rosca__svg" aria-hidden="true">
          {/* −90° põe o início no topo. Sem isto a primeira fatia começaria
              às três horas, e ninguém lê um gráfico assim. */}
          <g transform="rotate(-90 50 50)">
            {fatias.map((fatia, indice) => {
              const comprimento = fatia.fracao * 100;

              // Uma fatia sozinha é um anel fechado: abrir um vão nela
              // deixaria uma falha sem separar coisa alguma.
              const vao = fatias.length > 1 ? VAO : 0;
              const traco = Math.max(comprimento - vao, FATIA_MINIMA);

              const inicio = percorrido;
              percorrido += comprimento;

              return (
                <circle
                  key={fatia.rotulo}
                  cx="50"
                  cy="50"
                  r={RAIO}
                  fill="none"
                  stroke={corDaFatia(fatia)}
                  strokeWidth={ESPESSURA}
                  pathLength={100}
                  strokeDasharray={`${traco} ${100 - traco}`}
                  // Negativo empurra o traço para a frente na volta.
                  strokeDashoffset={-inicio}
                  className={
                    destacada === null || destacada === indice
                      ? 'rosca__fatia'
                      : 'rosca__fatia rosca__fatia--apagada'
                  }
                  onMouseEnter={() => setDestacada(indice)}
                  onMouseLeave={() => setDestacada(null)}
                />
              );
            })}
          </g>
        </svg>

        {/* O miolo. Fica em HTML por cima, e não num `<text>` do SVG, para
            herdar as fontes do app sem precisar reescalar nada à mão. */}
        <div className="rosca__miolo">
          <span className="rosca__miolo-rotulo">Total</span>
          <span
            className="rosca__miolo-valor"
            style={{ fontSize: tamanhoDoTotal(formatarDinheiro(total)) }}
          >
            {formatarDinheiro(total)}
          </span>
        </div>
      </div>

      <ul className="rosca__legenda">
        {fatias.map((fatia, indice) => (
          <li
            key={fatia.rotulo}
            className={
              destacada === null || destacada === indice
                ? 'rosca__item'
                : 'rosca__item rosca__item--apagado'
            }
            onMouseEnter={() => setDestacada(indice)}
            onMouseLeave={() => setDestacada(null)}
          >
            <span
              className="rosca__marcador"
              style={{ background: corDaFatia(fatia) }}
              aria-hidden="true"
            />

            <span className="rosca__texto">
              <span className="rosca__rotulo">{fatia.rotulo}</span>

              {/* Só aparece onde existe algo pendente — hoje, nas formas de
                  pagamento. Vai em âmbar, que é a cor que o app reserva para
                  "isto ainda exige algo de você", e nunca sozinha: o texto
                  diz o que o tom significa. */}
              {fatia.pendente > 0 && (
                <span className="rosca__pendente">
                  falta {formatarDinheiro(fatia.pendente)}
                </span>
              )}
            </span>

            <span className="rosca__valor">
              {formatarDinheiro(fatia.valor)}
              {/* Arredondado na exibição: os percentuais podem somar 99 ou
                  101, e mostrar duas casas para disfarçar isso seria pior. */}
              <span className="rosca__fracao"> · {Math.round(fatia.fracao * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default GraficoDeRosca;
