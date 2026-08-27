import { useState } from 'react';
import type { Usuario } from '../api.ts';
import Dashboard from './Dashboard.tsx';
import Lancamentos from './Lancamentos.tsx';
import Inicio from './Inicio.tsx';

// Navegação simples por estado. Quando houver mais telas (Projeção,
// Investimentos), vale trocar por um roteador de verdade, com URL própria.
type Aba = 'dashboard' | 'lancamentos' | 'inicio';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'dashboard', rotulo: 'Dashboard' },
  { id: 'lancamentos', rotulo: 'Lançamentos' },
  { id: 'inicio', rotulo: 'Início' },
];

interface Props {
  usuario: Usuario;
  aoSair: () => void;
}

function AreaLogada({ usuario, aoSair }: Props) {
  // Abre no Dashboard: é a visão que responde "como estou este mês?" sem
  // precisar de nenhum clique.
  const [aba, setAba] = useState<Aba>('dashboard');

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
        {ABAS.map(({ id, rotulo }) => (
          <button
            key={id}
            type="button"
            className={aba === id ? 'aba aba--ativa' : 'aba'}
            onClick={() => setAba(id)}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === 'dashboard' && <Dashboard />}
      {aba === 'lancamentos' && <Lancamentos />}
      {aba === 'inicio' && <Inicio />}
    </main>
  );
}

export default AreaLogada;
