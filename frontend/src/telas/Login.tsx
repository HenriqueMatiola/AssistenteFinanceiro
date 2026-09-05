import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import {
  fazerLogin,
  criarConta,
  entrarComGoogle,
  pedirCodigoDeSenha,
  redefinirSenha,
  guardarToken,
  type Usuario,
} from '../api.ts';
import BotaoDoGoogle from '../componentes/BotaoDoGoogle.tsx';
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

/**
 * Entrar numa conta que já existe, abrir uma nova, ou recuperar o acesso de
 * quem esqueceu a senha.
 *
 * Os três moram na mesma caixa, e não em telas separadas: quem errou a senha
 * duas vezes está a um clique de recuperar, e volta no mesmo clique se lembrar
 * dela no meio do caminho.
 */
type Modo = 'entrar' | 'criar' | 'recuperar';

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

  // --- Recuperação de senha ---
  const [codigo, setCodigo] = useState('');

  // Separa os dois momentos do modo recuperar: pedir o código e digitá-lo.
  const [codigoPedido, setCodigoPedido] = useState(false);

  // A resposta do servidor é sempre a mesma frase, exista a conta ou não —
  // por isso ela é um aviso, e não uma confirmação de que o e-mail existe.
  const [aviso, setAviso] = useState<string | null>(null);

  /** Segundos até poder pedir outro código. Só serve para explicar o botão. */
  const [espera, setEspera] = useState(0);

  const criando = modo === 'criar';
  const recuperando = modo === 'recuperar';

  useEffect(() => {
    if (espera <= 0) return;
    const relogio = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(relogio);
  }, [espera]);

  // O mês de hoje divide a régua: o que já passou é sólido, o que vem é
  // contorno. É a mesma distinção que o app inteiro faz entre o realizado e
  // o previsto.
  const mesDeHoje = new Date().getMonth();

  /** Limpa o que não faz sentido carregar de um modo para o outro. */
  function irPara(proximo: Modo) {
    setErro(null);
    setAviso(null);
    setMostrarSenha(false);

    // Sair da recuperação joga fora o código digitado: voltar depois começa do
    // zero, e um código velho na tela só enganaria.
    if (proximo !== 'recuperar') {
      setCodigo('');
      setCodigoPedido(false);
    }

    setModo(proximo);
  }

  function alternarModo() {
    const proximo: Modo = criando ? 'entrar' : 'criar';

    // Quem digitou o e-mail no campo "usuário ou e-mail" e resolveu criar
    // conta não deve encontrá-lo virado num nome de usuário inválido: ele
    // muda de campo junto.
    if (proximo === 'criar' && identificador.includes('@')) {
      setEmail(identificador);
      setIdentificador('');
    }

    irPara(proximo);
  }

  /**
   * Vai para "esqueci minha senha" aproveitando o que já foi digitado: quem
   * escreveu o e-mail no campo de entrar não precisa escrevê-lo de novo.
   */
  function esqueciASenha() {
    if (!email && identificador.includes('@')) setEmail(identificador);
    setSenha('');
    irPara('recuperar');
  }

  /** Pede (ou repede) o código de recuperação. */
  async function pedirCodigo() {
    setErro(null);
    setAviso(null);
    setEnviando(true);

    try {
      // A validade vem do servidor: é lá que ela é decidida, e repeti-la aqui
      // como número fixo criaria uma segunda verdade para desencontrar.
      const { mensagem, validadeEmMinutos } = await pedirCodigoDeSenha(email);

      setCodigoPedido(true);
      setEspera(60);
      setAviso(
        `${mensagem} O código vale por ${validadeEmMinutos} minutos — ` +
          'se não aparecer, olhe no spam.'
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar o código.');
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Volta do botão do Google com a credencial assinada.
   *
   * Não há modo aqui: entrar e criar conta são o mesmo clique, e quem decide
   * se a conta é nova é o backend, olhando o que já existe no banco.
   */
  async function aoVoltarDoGoogle(credencial: string) {
    setErro(null);
    setEnviando(true);

    try {
      const sessao = await entrarComGoogle(credencial);
      guardarToken(sessao.token);
      aoEntrar(sessao.usuario);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar com o Google.');
      setEnviando(false);
    }
    // Sem `finally`: quando dá certo, a tela inteira é trocada pelo app, e
    // mexer no estado de um componente que está saindo não serve para nada.
  }

  async function aoEnviar(evento: FormEvent) {
    // Sem isto, o navegador recarregaria a página ao enviar o formulário.
    evento.preventDefault();

    // No modo recuperar, antes de ter pedido o código, enviar o formulário é
    // pedir o código — e não redefinir coisa nenhuma.
    if (recuperando && !codigoPedido) {
      await pedirCodigo();
      return;
    }

    setErro(null);
    setAviso(null);
    setEnviando(true);

    try {
      const sessao = recuperando
        ? await redefinirSenha({ email, codigo, novaSenha: senha })
        : criando
          ? await criarConta({ login: identificador, email, senha })
          : await fazerLogin(identificador, senha);

      guardarToken(sessao.token);
      aoEntrar(sessao.usuario);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível continuar.');

      // Numa entrada recusada a senha é a suspeita e sai do campo. Num
      // cadastro recusado o problema é o nome de usuário ou o e-mail —
      // apagar a senha só faria digitar de novo à toa. Na recuperação, o
      // suspeito é o código, e ele fica: quem errou um dígito quer corrigir
      // aquele dígito, não recomeçar.
      if (modo === 'entrar') setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  /**
   * O rótulo do botão principal — sete respostas para um botão só.
   *
   * Fora do JSX porque três ternários aninhados no meio da marcação viram um
   * borrão que ninguém lê depois.
   */
  function textoDoBotao(): string {
    if (recuperando) {
      if (!codigoPedido) return enviando ? 'Enviando…' : 'Enviar código';
      return enviando ? 'Salvando…' : 'Redefinir senha e entrar';
    }
    if (criando) return enviando ? 'Criando…' : 'Criar conta';
    return enviando ? 'Entrando…' : 'Entrar';
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
          <h2 className="entrada__titulo">
            {recuperando ? 'Recuperar acesso' : criando ? 'Criar conta' : 'Entrar'}
          </h2>

          {recuperando && (
            <p className="entrada__subtitulo">
              {codigoPedido
                ? 'Digite o código que chegou no seu e-mail e escolha a nova senha.'
                : 'Informe o e-mail da conta. Enviamos um código de 6 dígitos ' +
                  'para ele — quem abre a caixa é você, e é isso que prova quem é.'}
            </p>
          )}

          {/* Sem `noValidate`: a validação do próprio navegador barra o envio
              vazio e o e-mail malformado antes de gastar uma ida ao servidor,
              e já é acessível. */}
          <form onSubmit={aoEnviar} className="entrada__form">
            {/* O campo de usuário não existe na recuperação: lá o que
                identifica a conta é o e-mail, que é para onde o código vai. */}
            {!recuperando && (
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
            )}

            {(criando || recuperando) && (
              <div className="campo-entrada campo-entrada--do-modo">
                <label htmlFor="email">E-mail</label>
                <div className="campo-entrada__linha">
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    /* Depois que o código sai, o e-mail vira só referência: o
                       código foi feito para AQUELE endereço, e trocá-lo aqui
                       daria um "código incorreto" sem explicação. */
                    readOnly={recuperando && codigoPedido}
                    autoFocus={recuperando && !codigoPedido}
                    required
                  />
                </div>
              </div>
            )}

            {recuperando && codigoPedido && (
              <div className="campo-entrada campo-entrada--do-modo">
                <label htmlFor="codigo">Código</label>
                <div className="campo-entrada__linha">
                  <input
                    id="codigo"
                    className="campo-entrada__codigo"
                    type="text"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    /* Teclado numérico no celular sem as setinhas do
                       type="number", que ainda comeria o zero à esquerda. */
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={7}
                    autoFocus
                    required
                  />
                </div>
              </div>
            )}

            {/* Na recuperação a senha só entra em cena junto com o código:
                pedi-la antes de o e-mail sair seria pedir para digitar uma
                senha que talvez nunca chegue a valer. */}
            {(!recuperando || codigoPedido) && (
            <div className="campo-entrada">
              <label htmlFor="senha">{recuperando ? 'Nova senha' : 'Senha'}</label>
              <div className="campo-entrada__linha">
                <input
                  id="senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete={criando || recuperando ? 'new-password' : 'current-password'}
                  minLength={criando || recuperando ? 8 : undefined}
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
              {(criando || recuperando) && (
                <p className="campo-entrada__dica">Pelo menos 8 caracteres.</p>
              )}
            </div>
            )}

            {/* Fica logo abaixo da senha porque é ali que a dúvida aparece —
                depois de tentar uma senha e ela não servir. */}
            {modo === 'entrar' && (
              <p className="entrada__esqueci">
                <button type="button" className="entrada__link" onClick={esqueciASenha}>
                  <span>Esqueceu sua senha?</span>
                </button>
              </p>
            )}

            {erro && (
              <p className="entrada__erro" role="alert">
                {erro}
              </p>
            )}

            {aviso && (
              <p className="entrada__aviso" role="status">
                {aviso}
              </p>
            )}

            <button type="submit" className="entrada__botao" disabled={enviando}>
              <span>{textoDoBotao()}</span>
            </button>

            {/* O reenvio fica depois do botão principal: é a saída para quando
                o e-mail não chega, não o caminho esperado. */}
            {recuperando && codigoPedido && (
              <p className="entrada__esqueci">
                <button
                  type="button"
                  className="entrada__link"
                  onClick={pedirCodigo}
                  disabled={enviando || espera > 0}
                >
                  <span>
                    {espera > 0 ? `Reenviar código em ${espera}s` : 'Reenviar código'}
                  </span>
                </button>
              </p>
            )}
          </form>

          {/*
            O botão do Google fica DEPOIS do formulário, e não antes: quem já
            tem conta de senha aqui vem para digitá-la, e o caminho principal
            de uma tela não se coloca embaixo de uma alternativa. Ele some
            sozinho quando o app não tem o identificador do Google configurado
            — e a linha do "ou" vai junto, dentro do componente.
          */}
          <BotaoDoGoogle aoReceberCredencial={aoVoltarDoGoogle} />

          <p className="entrada__alternar">
            {recuperando ? (
              <>
                Lembrou a senha?{' '}
                <button
                  type="button"
                  className="entrada__link"
                  onClick={() => irPara('entrar')}
                >
                  <span>Voltar para entrar</span>
                </button>
              </>
            ) : (
              <>
                {criando ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
                <button
                  type="button"
                  className="entrada__link"
                  onClick={alternarModo}
                >
                  <span>{criando ? 'Entrar' : 'Criar conta'}</span>
                </button>
              </>
            )}
          </p>

          {/* Fecha a coluna e responde à pergunta que um app compartilhado
              levanta — mais ainda na hora de abrir uma conta nova. */}
        </div>
      </section>
    </main>
  );
}

export default Login;
