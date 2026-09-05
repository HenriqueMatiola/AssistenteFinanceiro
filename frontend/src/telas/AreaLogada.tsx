import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Usuario } from '../api.ts';
import { mesAtualISO } from '../formato.ts';
import TrilhaDeMeses from '../componentes/TrilhaDeMeses.tsx';
import Dashboard from './Dashboard.tsx';
import Lancamentos from './Lancamentos.tsx';
import Recorrencias from './Recorrencias.tsx';
import Projecao from './Projecao.tsx';
import Investimentos from './Investimentos.tsx';
import Perfil from './Perfil.tsx';
import Avatar from '../componentes/Avatar.tsx';

// Navegação por estado. Com seis telas, já vale trocar por um roteador de
// verdade, para cada aba ter URL própria e o botão voltar funcionar.
type Aba =
  | 'dashboard'
  | 'lancamentos'
  | 'projecao'
  | 'recorrencias'
  | 'investimentos'
  | 'perfil';

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
  { id: 'perfil', rotulo: 'Perfil', usaMes: false },
];

interface Props {
  usuario: Usuario;
  aoSair: () => void;
  /** A tela de Perfil devolve o usuário salvo por aqui, e a barra acompanha. */
  aoAtualizarUsuario: (usuario: Usuario) => void;
}

function AreaLogada({ usuario, aoSair, aoAtualizarUsuario }: Props) {
  // Abre no Dashboard: é a visão que responde "como estou este mês?" sem
  // precisar de nenhum clique.
  const [aba, setAba] = useState<Aba>('dashboard');

  // O mês mora aqui, e não dentro de cada tela: trocar de aba não deve
  // devolver você para o mês corrente no meio de uma conferência.
  const [mes, setMes] = useState(mesAtualISO());

  // A ordem também posiciona o marcador no trilho da barra: o CSS multiplica
  // ela pela altura do item, e assim não precisa medir nada no navegador a
  // cada troca de seção.
  const ordemDaAba = ABAS.findIndex((a) => a.id === aba);
  const abaAtual = ABAS[ordemDaAba];

  return (
    <div className="aplicativo">
      <aside className="lateral">
        <div className="lateral__marca">
          <span className="lateral__marca-nome">Assistente</span>
          <span className="lateral__marca-sufixo">financeiro</span>
        </div>

        <nav
          className="lateral__nav"
          aria-label="Seções"
          style={{ '--ordem': ordemDaAba } as CSSProperties}
        >
          {/* O marcador âmbar que corre pelo trilho. É decoração: quem conta
              aos leitores de tela onde estamos é o `aria-current` abaixo. */}
          <span className="lateral__marcador" aria-hidden="true" />

          {ABAS.map(({ id, rotulo }, ordem) => (
            <button
              key={id}
              type="button"
              className={aba === id ? 'lateral__item lateral__item--ativo' : 'lateral__item'}
              style={{ '--ordem': ordem } as CSSProperties}
              onClick={() => setAba(id)}
              aria-current={aba === id ? 'page' : undefined}
            >
              <span className="lateral__item-rotulo">{rotulo}</span>
            </button>
          ))}
        </nav>

      </aside>

      <main className="area">
        {/*
          A barra existe em todas as abas, mesmo nas que não usam mês: é ela
          que segura o usuário no canto direito. Se ele morasse dentro da
          trilha, sumiria em Projeção, Recorrências, Investimentos e Início.
        */}
        <header className="barra-superior">
          {abaAtual?.usaMes && <TrilhaDeMeses mes={mes} aoTrocar={setMes} />}

          {/* O nome de usuário fica no `title`: numa barra de uma linha, uma
              segunda linha de texto miúdo aperta tudo — e ele quase repete o
              nome, que sai dele. */}
          <div className="usuario" title={`${usuario.nome} — conectado como ${usuario.login}`}>
            <Avatar nome={usuario.nome} foto={usuario.foto} />
            <span className="usuario__nome">{usuario.nome}</span>

            <button type="button" className="botao-sair" onClick={aoSair}>
              Sair
            </button>
          </div>
        </header>

        <div className="conteudo">
          {/*
            A faixa aparece em todas as abas até o e-mail ser confirmado, e
            some sozinha no instante em que ele é. Ela não confirma nada aqui:
            leva ao Perfil, onde o fluxo mora inteiro — dois lugares para fazer
            a mesma coisa seriam dois lugares para consertar depois.

            Some também em quem ainda não tem e-mail nenhum: pedir para
            confirmar o que não existe só confundiria.
          */}
          {usuario.email && !usuario.emailVerificado && aba !== 'perfil' && (
            <div className="faixa-confirmacao" role="status">
              <span>
                Confirme seu e-mail para garantir que você consegue recuperar a
                conta.
              </span>
              <button
                type="button"
                className="botao--discreto"
                onClick={() => setAba('perfil')}
              >
                Confirmar agora
              </button>
            </div>
          )}

          <h1 className="titulo-da-tela">{abaAtual?.rotulo}</h1>

          {aba === 'dashboard' && <Dashboard mes={mes} />}
          {aba === 'lancamentos' && <Lancamentos mes={mes} aoTrocarMes={setMes} />}
          {aba === 'projecao' && <Projecao />}
          {aba === 'recorrencias' && <Recorrencias />}
          {aba === 'investimentos' && <Investimentos />}
          {aba === 'perfil' && <Perfil usuario={usuario} aoAtualizar={aoAtualizarUsuario} />}
        </div>
      </main>
    </div>
  );
}

export default AreaLogada;
