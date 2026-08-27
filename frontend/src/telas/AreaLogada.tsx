import { useState } from 'react';
import type { Usuario } from '../api.ts';
import Lancamentos from './Lancamentos.tsx';
import Inicio from './Inicio.tsx';

// Navegação simples por estado. Quando houver mais telas (Dashboard, Projeção,
// Investimentos), vale trocar por um roteador de verdade, com URL própria.
type Aba = 'lancamentos' | 'inicio';

interface Props {
  usuario: Usuario;
  aoSair: () => void;
}

function AreaLogada({ usuario, aoSair }: Props) {
  const [aba, setAba] = useState<Aba>('lancamentos');

  return (
    <main className="pagina">
      <header className="cabecalho">
        <div>
          <h1>Assistente Financeiro</h1>
          <p className="subtitulo">
            {usuario.nome} ({usuario.login})
          </p>
        </div>
        <button type="button" onClick={aoSair}>
          Sair
        </button>
      </header>

      <nav className="abas">
        <button
          type="button"
          className={aba === 'lancamentos' ? 'aba aba--ativa' : 'aba'}
          onClick={() => setAba('lancamentos')}
        >
          Lançamentos
        </button>
        <button
          type="button"
          className={aba === 'inicio' ? 'aba aba--ativa' : 'aba'}
          onClick={() => setAba('inicio')}
        >
          Início
        </button>
      </nav>

      {aba === 'lancamentos' ? <Lancamentos /> : <Inicio />}
    </main>
  );
}

export default AreaLogada;
