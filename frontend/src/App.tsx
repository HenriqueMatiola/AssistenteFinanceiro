import { useEffect, useState } from 'react';
import { apagarToken, buscarUsuarioLogado, lerToken, type Usuario } from './api.ts';
import Login from './telas/Login.tsx';
import AreaLogada from './telas/AreaLogada.tsx';
import './App.css';

function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  // Só há o que verificar se existir um token guardado. Começando já com o
  // valor certo, evitamos uma renderização extra logo na abertura.
  const [verificando, setVerificando] = useState(() => Boolean(lerToken()));

  useEffect(() => {
    // Ter um token guardado não significa que ele ainda vale (pode ter
    // expirado). Quem decide é o backend.
    if (!lerToken()) return;

    buscarUsuarioLogado()
      .then(setUsuario)
      .catch(() => {
        apagarToken();
        setUsuario(null);
      })
      .finally(() => setVerificando(false));
  }, []);

  function sair() {
    apagarToken();
    setUsuario(null);
  }

  if (verificando) {
    return (
      <main className="pagina">
        <p>Carregando…</p>
      </main>
    );
  }

  if (!usuario) {
    return <Login aoEntrar={setUsuario} />;
  }

  return <AreaLogada usuario={usuario} aoSair={sair} />;
}

export default App;
