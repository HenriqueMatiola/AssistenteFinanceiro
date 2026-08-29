import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface Saude {
  banco: string;
  versaoDoBanco: string | null;
}

/** O que cada aba responde. Serve de mapa para quem abre o app sem lembrar. */
const ABAS_EXPLICADAS = [
  {
    nome: 'Dashboard',
    resposta: 'Como este mês está fechando: entradas, saídas e o que sobra.',
  },
  {
    nome: 'Lançamentos',
    resposta: 'O que entrou e saiu, com as contas previstas junto para marcar como pagas.',
  },
  {
    nome: 'Projeção',
    resposta: 'Como ficam os próximos meses se nada mudar.',
  },
  {
    nome: 'Recorrências',
    resposta: 'As contas que se repetem todo mês e alimentam a projeção.',
  },
  {
    nome: 'Investimentos',
    resposta: 'Quanto a carteira vale hoje, com cotação buscada na hora.',
  },
];

function Inicio() {
  const [saude, setSaude] = useState<Saude | null>(null);
  const [semResposta, setSemResposta] = useState(false);

  // Painel de diagnóstico: confirma que backend e banco continuam de pé.
  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then(setSaude)
      .catch(() => setSemResposta(true));
  }, []);

  return (
    <>
      <section className="cartao">
        <h2>O que cada aba responde</h2>

        <dl className="glossario">
          {ABAS_EXPLICADAS.map(({ nome, resposta }) => (
            <div key={nome} className="glossario__item">
              <dt className="glossario__termo">{nome}</dt>
              <dd className="glossario__descricao">{resposta}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="cartao">
        <h2>Sistema</h2>

        {semResposta ? (
          <p className="mensagem-erro">
            O servidor não respondeu. Confira se o backend está rodando em{' '}
            <strong>{API_URL}</strong> e se o banco subiu com{' '}
            <code>docker compose up -d</code>.
          </p>
        ) : (
          <>
            <p>
              Banco de dados:{' '}
              <strong>{saude?.banco === 'ok' ? 'conectado' : 'verificando…'}</strong>
            </p>
            <small>{saude?.versaoDoBanco?.split(',')[0] ?? '—'}</small>
          </>
        )}
      </section>
    </>
  );
}

export default Inicio;
