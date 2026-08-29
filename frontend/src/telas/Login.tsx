import { useState, type FormEvent } from 'react';
import { fazerLogin, guardarToken, type Usuario } from '../api.ts';

interface Props {
  /** Avisa o App de que o login deu certo, passando quem entrou. */
  aoEntrar: (usuario: Usuario) => void;
}

function Login({ aoEntrar }: Props) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    // Sem isto, o navegador recarregaria a página ao enviar o formulário.
    evento.preventDefault();

    setErro(null);
    setEnviando(true);

    try {
      const resultado = await fazerLogin(login, senha);
      guardarToken(resultado.token);
      aoEntrar(resultado.usuario);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar.');
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="entrada">
      <div className="entrada__caixa">
        <h1 className="entrada__marca">Assistente Financeiro</h1>
        <p className="entrada__sub">Entre para ver suas contas do mês.</p>

        <form onSubmit={aoEnviar} className="cartao">
          <label className="campo">
            <span>Login</span>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label className="campo">
            <span>Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {erro && <p className="mensagem-erro">{erro}</p>}

          <button type="submit" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default Login;
