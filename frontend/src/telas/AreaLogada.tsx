import { useState } from 'react';
import type { Usuario } from '../api.ts';
import { mesAtualISO } from '../formato.ts';
import TrilhaDeMeses from '../componentes/TrilhaDeMeses.tsx';
import Dashboard from './Dashboard.tsx';
import Lancamentos from './Lancamentos.tsx';
import Recorrencias from './Recorrencias.tsx';
import Projecao from './Projecao.tsx';
import Investimentos from './Investimentos.tsx';
import Inicio from './Inicio.tsx';

// Navegação por estado. Com seis telas, já vale trocar por um roteador de
// verdade, para cada aba ter URL própria e o botão voltar funcionar.
type Aba =
  | 'dashboard'
  | 'lancamentos'
  | 'projecao'
  | 'recorrencias'
  | 'investimentos'
  | 'inicio';

/**
 * `usaMes` diz se a tela trabalha com um mês específico. A trilha de meses só
 * aparece nessas: um seletor que não muda nada na tela é pior que nenhum.
 * Projeção olha vários meses à frente; Recorrências não tem mês nenhum.
 */
const ABAS: { id: Aba; rotulo: string; usaMes: boolean }[] = [
  { id: 'dashboard', rotulo: 'Dashboard', usaMes: true },
  { id: 'lancamentos', rotulo: 'Lançamentos', usaMes: true },
  { id: 'projecao', rotulo: 'Projeção', usaMes: false },
  { id: 'recorrencias', rotulo: 'Recorrências', usaMes: false },
  { id: 'investimentos', rotulo: 'Investimentos', usaMes: false },
  { id: 'inicio', rotulo: 'Início', usaMes: false },
];

interface Props {
  usuario: Usuario;
  aoSair: () => void;
}

/** "Henrique Matiola" → "HM". Duas letras cabem no círculo; três já não. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? partes.at(-1)?.[0] ?? '' : '';
  return (primeira + ultima).toUpperCase();
}

function AreaLogada({ usuario, aoSair }: Props) {
  // Abre no Dashboard: é a visão que responde "como estou este mês?" sem
  // precisar de nenhum clique.
  const [aba, setAba] = useState<Aba>('dashboard');

  // O mês mora aqui, e não dentro de cada tela: trocar de aba não deve
  // devolver você para o mês corrente no meio de uma conferência.
  const [mes, setMes] = useState(mesAtualISO());

  const abaAtual = ABAS.find((a) => a.id === aba);

  return (
    <div className="aplicativo">
      <aside className="lateral">
        <div className="lateral__marca">
          <span className="lateral__marca-nome">Assistente</span>
          <span className="lateral__marca-sufixo">financeiro</span>
        </div>

        <nav className="lateral__nav" aria-label="Seções">
          {ABAS.map(({ id, rotulo }) => (
            <button
              key={id}
              type="button"
              className={aba === id ? 'lateral__item lateral__item--ativo' : 'lateral__item'}
              onClick={() => setAba(id)}
              aria-current={aba === id ? 'page' : undefined}
            >
              {rotulo}
            </button>
          ))}
        </nav>

        <div className="lateral__rodape">
          <div className="usuario">
            <span className="usuario__iniciais" aria-hidden="true">
              {iniciaisDe(usuario.nome)}
            </span>
            <span className="usuario__dados">
              <span className="usuario__nome">{usuario.nome}</span>
              <span className="usuario__login">{usuario.login}</span>
            </span>
          </div>

          <button type="button" className="botao-sair" onClick={aoSair}>
            Sair
          </button>
        </div>
      </aside>

      <main className="area">
        {abaAtual?.usaMes && <TrilhaDeMeses mes={mes} aoTrocar={setMes} />}

        <div className="conteudo">
          <h1 className="titulo-da-tela">{abaAtual?.rotulo}</h1>

          {aba === 'dashboard' && <Dashboard mes={mes} />}
          {aba === 'lancamentos' && <Lancamentos mes={mes} aoTrocarMes={setMes} />}
          {aba === 'projecao' && <Projecao />}
          {aba === 'recorrencias' && <Recorrencias />}
          {aba === 'investimentos' && <Investimentos />}
          {aba === 'inicio' && <Inicio />}
        </div>
      </main>
    </div>
  );
}

export default AreaLogada;
