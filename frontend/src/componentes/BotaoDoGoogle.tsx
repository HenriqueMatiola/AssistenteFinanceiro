import { useEffect, useRef, useState } from 'react';

/**
 * O botão "Entrar com o Google".
 *
 * Quem desenha o botão é o próprio Google, dentro de um iframe: a marca dele
 * tem regras de uso, e um botão feito à mão que se pareça com o oficial é
 * justamente o que elas proíbem. Em troca, ele não obedece ao nosso CSS — o
 * que dá para escolher são as opções de `renderButton` mais abaixo.
 *
 * O que volta do Google é uma "credencial": um token assinado por eles,
 * dizendo quem entrou. Ele não vale nada sozinho — quem confere a assinatura
 * é o backend, em `/api/auth/google`.
 */

/**
 * A fatia da API do Google que usamos, escrita à mão.
 *
 * O pacote de tipos oficial descreve a biblioteca inteira — One Tap, botões
 * de autorização, revogação de acesso. Nada disso entra aqui, e uma dependência
 * a mais para três funções não se paga.
 */
interface RespostaDaCredencial {
  credential: string;
}

interface ApiDoGoogle {
  accounts: {
    id: {
      initialize(opcoes: {
        client_id: string;
        callback: (resposta: RespostaDaCredencial) => void;
      }): void;
      renderButton(
        alvo: HTMLElement,
        opcoes: {
          type: 'standard';
          theme: 'outline' | 'filled_blue' | 'filled_black';
          size: 'large';
          shape: 'pill';
          text: 'signin_with' | 'continue_with';
          logo_alignment: 'center' | 'left';
          locale: string;
          width: number;
        }
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: ApiDoGoogle;
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client';

/** O botão do Google só aceita largura em pixels, e dentro destes limites. */
const LARGURA_MINIMA = 200;
const LARGURA_MAXIMA = 400;

/**
 * Carrega o script do Google uma vez por página.
 *
 * A promessa fica guardada no módulo: se dois botões aparecerem, ou se este
 * remontar ao trocar de modo na tela de entrada, os dois esperam o mesmo
 * carregamento em vez de baixar o script de novo.
 */
let carregamento: Promise<void> | null = null;

function carregarScript(): Promise<void> {
  if (carregamento) return carregamento;

  carregamento = new Promise((resolver, rejeitar) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () => resolver();
    tag.onerror = () => {
      // Sem isto, uma falha de rede deixaria a promessa guardada como
      // rejeitada para sempre — nem recarregar o componente tentaria de novo.
      carregamento = null;
      rejeitar(new Error('script do Google não carregou'));
    };
    document.head.appendChild(tag);
  });

  return carregamento;
}

interface Props {
  /** Recebe a credencial assinada, para mandar ao backend. */
  aoReceberCredencial: (credencial: string) => void;
}

/**
 * Devolve `null` quando o app não tem `VITE_GOOGLE_CLIENT_ID` configurado, ou
 * quando o script do Google não carrega. Nos dois casos a tela continua
 * inteira: entrar com senha nunca dependeu disto.
 */
function BotaoDoGoogle({ aoReceberCredencial }: Props) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  const caixa = useRef<HTMLDivElement>(null);
  const [falhou, setFalhou] = useState(false);

  /*
   * O callback do Google é registrado uma vez, no `initialize`, e o Google
   * guarda aquela referência. Sem esta gaveta, um clique no botão chamaria a
   * versão de `aoReceberCredencial` que existia no primeiro render — e a tela
   * de entrada troca de função ao alternar entre "entrar" e "criar conta".
   */
  const retorno = useRef(aoReceberCredencial);

  // Sem lista de dependências: roda depois de todo render, deixando a gaveta
  // sempre com a função da vez. O clique no botão só acontece muito depois,
  // então ela nunca é lida desatualizada.
  useEffect(() => {
    retorno.current = aoReceberCredencial;
  });

  useEffect(() => {
    if (!clientId) return;

    const alvo = caixa.current;
    if (!alvo) return;

    // Depois de desmontar, o `then` abaixo não deve mexer em nada.
    let vivo = true;

    carregarScript()
      .then(() => {
        if (!vivo || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resposta) => retorno.current(resposta.credential),
        });

        // O botão do Google não aceita largura em porcentagem, então ele é
        // medido: a coluna do acesso muda de largura com a janela.
        const largura = Math.round(alvo.getBoundingClientRect().width);

        window.google.accounts.id.renderButton(alvo, {
          type: 'standard',
          // Branco nos dois temas: além de preservar melhor as cores da marca,
          // o botão ganha contraste sem virar outro bloco escuro no formulário.
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          // "Continuar com o Google" serve aos dois modos da tela: quem não
          // tem conta ganha uma no mesmo clique.
          text: 'continue_with',
          logo_alignment: 'left',
          locale: 'pt-BR',
          width: Math.min(Math.max(largura, LARGURA_MINIMA), LARGURA_MAXIMA),
        });
      })
      .catch(() => {
        if (vivo) setFalhou(true);
      });

    return () => {
      vivo = false;
    };
  }, [clientId]);

  if (!clientId || falhou) return null;

  return (
    <>
      {/* A linha do "ou" vem junto do botão de propósito: separador sem nada
          para separar é ruído, e o botão some em três situações (sem
          configuração, script bloqueado, rede fora). */}
      <p className="entrada__ou">
        <span>ou</span>
      </p>

      <div className="entrada__google" ref={caixa} />
    </>
  );
}

export default BotaoDoGoogle;
