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
import Acertos from './Acertos.tsx';
import Perfil from './Perfil.tsx';
import Avatar from '../componentes/Avatar.tsx';

// Navegação por estado. Com seis telas, já vale trocar por um roteador de
// verdade, para cada aba ter URL própria e o botão voltar funcionar.
type Aba =
  | 'dashboard'
  | 'lancamentos'
  | 'projecao'
  | 'recorrencias'
  | 'acertos'
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
  { id: 'acertos', rotulo: 'A receber e a pagar', usaMes: false },
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
  const [abaEscolhida, setAba] = useState<Aba>('dashboard');

  // O mês mora aqui, e não dentro de cada tela: trocar de aba não deve
  // devolver você para o mês corrente no meio de uma conferência.
  const [mes, setMes] = useState(mesAtualISO());

  /*
   * Enquanto o e-mail não está confirmado, o app inteiro se resume ao Perfil:
   * é lá que moram o campo de e-mail e o passo a passo do código.
   *
   * Quem decide é o backend: `precisaConfirmarEmail` já vem pronto de lá, e as
   * rotas de dados respondem 403 de qualquer jeito — esconder um botão nunca
   * protegeu nada. O papel da tela aqui é outro: parar de oferecer o que não
   * vai funcionar, para a pessoa não bater numa porta trancada e ficar sem
   * entender o que aconteceu.
   *
   * A aba é DERIVADA, e não forçada com `setAba` dentro de um efeito: forçar
   * mostraria o Dashboard por um instante antes de corrigir, e faria a
   * navegação esquecer onde a pessoa estava. Assim, no segundo em que a
   * confirmação sai, ela volta sozinha para a aba que tinha escolhido.
   */
  const precisaConfirmar = usuario.precisaConfirmarEmail;
  const aba: Aba = precisaConfirmar ? 'perfil' : abaEscolhida;

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
              /* Desligadas até o e-mail ser confirmado. O `disabled` também as
                 tira da navegação por Tab, e a faixa logo abaixo é quem diz o
                 motivo — um `title` não serviria: o navegador não mostra dica
                 de elemento desabilitado. */
              disabled={precisaConfirmar && id !== 'perfil'}
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

            {/* Sair continua valendo mesmo barrado: quem entrou na conta
                errada precisa poder cair fora sem confirmar e-mail nenhum. */}
            <button type="button" className="botao-sair" onClick={aoSair}>
              Sair
            </button>
          </div>
        </header>

        <div className="conteudo">
          {/*
            A faixa explica por que o resto do app não está disponível. Ela some
            sozinha no instante em que a confirmação sai, e não tem botão de
            dispensar, porque não há para onde mandar a pessoa: o passo a passo já
            está logo abaixo, nesta mesma tela.

            As duas frases não são frescura. Quem não tem e-mail nenhum — conta
            criada antes de o cadastro pedir um — não tem o que confirmar, e
            mandá-la "confirmar o e-mail" seria um beco sem saída.
          */}
          {precisaConfirmar && (
            <div className="faixa-confirmacao" role="status">
              <span>
                {usuario.email
                  ? 'Confirme seu e-mail abaixo para liberar o restante do app.'
                  : 'Cadastre um e-mail abaixo e confirme-o para liberar o restante do app.'}
              </span>
            </div>
          )}

          <h1 className="titulo-da-tela">{abaAtual?.rotulo}</h1>

          {aba === 'dashboard' && <Dashboard mes={mes} />}
          {aba === 'lancamentos' && <Lancamentos mes={mes} aoTrocarMes={setMes} />}
          {aba === 'projecao' && <Projecao />}
          {aba === 'recorrencias' && <Recorrencias />}
          {aba === 'acertos' && <Acertos />}
          {aba === 'investimentos' && <Investimentos />}
          {aba === 'perfil' && <Perfil usuario={usuario} aoAtualizar={aoAtualizarUsuario} />}
        </div>
      </main>
    </div>
  );
}

export default AreaLogada;
