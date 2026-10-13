import { useEffect, useState } from 'react';

/**
 * Quanto tempo o aviso amarelo ("3 parcelas criadas", "atualizado") fica na
 * tela. Ele confirma algo que já aconteceu e não pede nenhuma ação — parado
 * ali, só empurraria a lista para baixo até o próximo clique.
 */
const DURACAO_DO_AVISO = 6000;

/**
 * Estado de um aviso que some sozinho. Um aviso novo antes do fim cancela o
 * timer do anterior (o retorno do efeito) e ganha os seus próprios segundos.
 */
export function useAvisoTemporario() {
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => setAviso(null), DURACAO_DO_AVISO);
    return () => clearTimeout(timer);
  }, [aviso]);

  return [aviso, setAviso] as const;
}

/**
 * O aviso em si. `key` = o texto: um aviso novo é outro elemento, e a animação
 * de esmaecer recomeça do zero em vez de continuar a do anterior. A duração
 * vai no `style` para o esmaecer terminar junto com o timer do hook.
 */
function AvisoTemporario({ texto }: { texto: string | null }) {
  if (!texto) return null;

  return (
    <p
      key={texto}
      className="mensagem-aviso mensagem-aviso--temporaria"
      style={{ animationDuration: `${DURACAO_DO_AVISO}ms` }}
      role="status"
    >
      {texto}
    </p>
  );
}

export default AvisoTemporario;
