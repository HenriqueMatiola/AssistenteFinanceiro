import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface Saude {
  banco: string;
  versaoDoBanco: string | null;
}

function Inicio() {
  const [saude, setSaude] = useState<Saude | null>(null);

  // Painel de diagnóstico: confirma que backend e banco continuam de pé.
  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((r) => r.json())
      .then(setSaude)
      .catch(() => setSaude(null));
  }, []);

  return (
    <>
      <div className="cartao">
        <h2>Próximos passos</h2>
        <p>
          Login, lançamentos, dashboard, recorrências e projeção estão prontos.
          Os Investimentos chegam na próxima etapa.
        </p>
      </div>

      <div className="cartao">
        <h2>Sistema</h2>
        <p>
          Banco de dados: <strong>{saude?.banco === 'ok' ? 'conectado' : 'sem resposta'}</strong>
        </p>
        <small>{saude?.versaoDoBanco?.split(',')[0] ?? '—'}</small>
      </div>
    </>
  );
}

export default Inicio;
