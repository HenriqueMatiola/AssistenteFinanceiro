import { useState, type CSSProperties, type FormEvent } from 'react';
import { fazerLogin, criarConta, guardarToken, type Usuario } from '../api.ts';
import './Login.css';

/**
 * As doze barras do painel são a trilha de meses do app — o mesmo elemento que
 * fica no topo de todas as telas — em forma de gráfico.
 *
 * As alturas são fixas, e não sorteadas: um desenho que muda a cada carga não
 * é uma marca, é ruído. Elas desenham um ano plausível de movimento, com o
 * meio do ano mais cheio.
 */
const MESES = [
  { sigla: 'jan', altura: 38 },
  { sigla: 'fev', altura: 52 },
  { sigla: 'mar', altura: 44 },
  { sigla: 'abr', altura: 67 },
  { sigla: 'mai', altura: 58 },
  { sigla: 'jun', altura: 81 },
  { sigla: 'jul', altura: 72 },
  { sigla: 'ago', altura: 95 },
  { sigla: 'set', altura: 63 },
  { sigla: 'out', altura: 77 },
  { sigla: 'nov', altura: 55 },
  { sigla: 'dez', altura: 88 },
];

/** Entrar numa conta que já existe, ou abrir uma nova. */
type Modo = 'entrar' | 'criar';

interface Props {
  /** Avisa o App de que a sessão começou, passando quem entrou. */
  aoEntrar: (usuario: Usuario) => void;
}

/**
 * O olho do campo de senha. Traço aberto quando a senha está escondida (clique
 * para ver) e riscado quando ela está à mostra (clique para esconder) — o
 * desenho mostra o que o clique faz, não o estado atual.
 */
function IconeOlho({ riscado }: { riscado: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.7-6.4 10-6.4S22 12 22 12s-3.7 6.4-10 6.4S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
      {riscado && <path d="M4.5 19.5 19.5 4.5" />}
    </svg>
  );
}

function Login({ aoEntrar }: Props) {
  const [modo, setModo] = useState<Modo>('entrar');

  // O mesmo estado serve aos dois modos: ao entrar ele é "usuário ou e-mail";
  // ao criar conta, o nome de usuário. Assim o que já foi digitado sobrevive
  // à troca de modo.
  const [identificador, setIdentificador] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const criando = modo === 'criar';

  // O mês de hoje divide a régua: o que já passou é sólido, o que vem é
  // contorno. É a mesma distinção que o app inteiro faz entre o realizado e
  // o previsto.
  const mesDeHoje = new Date().getMonth();

  function alternarModo() {
    const proximo: Modo = criando ? 'entrar' : 'criar';

    // Quem digitou o e-mail no campo "usuário ou e-mail" e resolveu criar
    // conta não deve encontrá-lo virado num nome de usuário inválido: ele
    // muda de campo junto.
    if (proximo === 'criar' && identificador.includes('@')) {
      setEmail(identificador);
      setIdentificador('');
    }

    setErro(null);
    setMostrarSenha(false);
    setModo(proximo);
  }

  async function aoEnviar(evento: FormEvent) {
    // Sem isto, o navegador recarregaria a página ao enviar o formulário.
    evento.preventDefault();

    setErro(null);
    setEnviando(true);

    try {
      const sessao = criando
        ? await criarConta({ login: identificador, email, senha })
        : await fazerLogin(identificador, senha);

      guardarToken(sessao.token);
      aoEntrar(sessao.usuario);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível continuar.');

      // Numa entrada recusada a senha é a suspeita e sai do campo. Num
      // cadastro recusado o problema é o nome de usuário ou o e-mail —
      // apagar a senha só faria digitar de novo à toa.
      if (!criando) setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="entrada">
      <section className="entrada__marca">
        <div className="entrada__identidade">
          <h1 className="entrada__logo">
            Assistente
            <span className="entrada__logo-sufixo">Financeiro</span>
          </h1>
        </div>

        {/*
          A régua e a frase andam juntas na base: a frase é a legenda do que o
          desenho mostra — o que já passou, sólido, e o que ainda vem, em
          contorno.
        */}
        <div className="entrada__rodape">
          {/* Decorativo: a régua repete o que a frase abaixo já diz em texto,
              então quem usa leitor de tela não perde nada ao pulá-la. */}
          <div className="regua" aria-hidden="true">
            {MESES.map(({ sigla, altura }, indice) => {
              const classes = ['regua__mes'];
              if (indice > mesDeHoje) classes.push('regua__mes--futuro');
              if (indice === mesDeHoje) classes.push('regua__mes--hoje');

              return (
                <div
                  key={sigla}
                  className={classes.join(' ')}
                  style={{ '--altura': `${altura}%`, '--ordem': indice } as CSSProperties}
                >
                  <div className="regua__barra" />
                  <span className="regua__sigla">{sigla}</span>
                </div>
              );
            })}
          </div>

          <p className="entrada__frase">
            Suas contas do mês,
            <br />e as que ainda vêm.
          </p>
        </div>
      </section>

      <section className="entrada__acesso">
        <div className="entrada__caixa">
          <h2 className="entrada__titulo">{criando ? 'Criar conta' : 'Entrar'}</h2>

          {/* Sem `noValidate`: a validação do próprio navegador barra o envio
              vazio e o e-mail malformado antes de gastar uma ida ao servidor,
              e já é acessível. */}
          <form onSubmit={aoEnviar} className="entrada__form">
            <div className="campo-entrada campo-entrada--do-modo">
              <label htmlFor="identificador">
                {criando ? 'Nome de usuário' : 'Usuário ou e-mail'}
              </label>
              <div className="campo-entrada__linha">
                <input
                  id="identificador"
                  type="text"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
              {criando && (
                <p className="campo-entrada__dica">
                  Letras sem acento, números, ponto e hífen.
                </p>
              )}
            </div>

            {criando && (
              <div className="campo-entrada campo-entrada--do-modo">
                <label htmlFor="email">E-mail</label>
                <div className="campo-entrada__linha">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
            )}

            <div className="campo-entrada">
              <label htmlFor="senha">Senha</label>
              <div className="campo-entrada__linha">
                <input
                  id="senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete={criando ? 'new-password' : 'current-password'}
                  minLength={criando ? 8 : undefined}
                  required
                />
                {/* type="button" é obrigatório: dentro de um form, o padrão de
                    um botão é enviar — e ver a senha enviaria o formulário. */}
                <button
                  type="button"
                  className="campo-entrada__olho"
                  onClick={() => setMostrarSenha((atual) => !atual)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <IconeOlho riscado={mostrarSenha} />
                </button>
              </div>
              {criando && <p className="campo-entrada__dica">Pelo menos 8 caracteres.</p>}
            </div>

            {erro && (
              <p className="entrada__erro" role="alert">
                {erro}
              </p>
            )}

            <button type="submit" className="entrada__botao" disabled={enviando}>
              <span>
                {enviando
                  ? criando
                    ? 'Criando…'
                    : 'Entrando…'
                  : criando
                    ? 'Criar conta'
                    : 'Entrar'}
              </span>
            </button>
          </form>

          <p className="entrada__alternar">
            {criando ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
            <button
              type="button"
              className="entrada__link"
              onClick={alternarModo}
            >
              <span>{criando ? 'Entrar' : 'Criar conta'}</span>
            </button>
          </p>

          {/* Fecha a coluna e responde à pergunta que um app compartilhado
              levanta — mais ainda na hora de abrir uma conta nova. */}
          <p className="entrada__nota">Cada conta enxerga só os próprios lançamentos.</p>
        </div>
      </section>
    </main>
  );
}

export default Login;
