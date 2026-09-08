import { useState, type ChangeEvent, type FormEvent } from 'react';
import { atualizarPerfil, trocarSenha, type Usuario } from '../api.ts';
import { prepararFotoDePerfil, ErroDeImagem } from '../imagem.ts';
import Avatar from '../componentes/Avatar.tsx';
import ConfirmacaoDeEmail from '../componentes/ConfirmacaoDeEmail.tsx';

interface Props {
  usuario: Usuario;
  /** Avisa o App de que os dados mudaram, para a barra superior acompanhar. */
  aoAtualizar: (usuario: Usuario) => void;
}

function Perfil({ usuario, aoAtualizar }: Props) {
  const [nome, setNome] = useState(usuario.nome);
  const [email, setEmail] = useState(usuario.email ?? '');

  // A foto escolhida só existe na tela até salvar. Guardar o "mudou" à parte
  // separa "não mexi na foto" de "tirei a foto" — os dois deixam `foto` sem
  // valor, mas um manda `null` para o servidor e o outro não manda nada.
  const [foto, setFoto] = useState(usuario.foto);
  const [fotoMudou, setFotoMudou] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  // Troca de senha: formulário próprio, com estado próprio.
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [trocando, setTrocando] = useState(false);
  const [erroDaSenha, setErroDaSenha] = useState<string | null>(null);
  const [senhaTrocada, setSenhaTrocada] = useState(false);

  /**
   * Qualquer edição apaga o "Perfil salvo." da tela.
   *
   * Sem isto a confirmação envelhece: você troca o nome, não salva, e a
   * mensagem continua dizendo que está tudo gravado.
   */
  function mudar(guardar: (valor: string) => void) {
    return (evento: ChangeEvent<HTMLInputElement>) => {
      guardar(evento.target.value);
      setSalvo(false);
    };
  }

  async function aoEscolherFoto(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];

    // Sem isto, escolher o mesmo arquivo duas vezes seguidas não dispara
    // nada na segunda: o valor do input não teria mudado.
    evento.target.value = '';
    if (!arquivo) return;

    setErro(null);
    setSalvo(false);

    try {
      setFoto(await prepararFotoDePerfil(arquivo));
      setFotoMudou(true);
    } catch (e) {
      setErro(e instanceof ErroDeImagem ? e.message : 'Não consegui usar essa imagem.');
    }
  }

  function removerFoto() {
    setFoto(null);
    setFotoMudou(true);
    setErro(null);
    setSalvo(false);
  }

  async function salvarDados(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvo(false);
    setSalvando(true);

    try {
      const atualizado = await atualizarPerfil({
        nome,
        email,
        // Só entra no envio se mexeram nela: mandar a mesma foto de volta
        // seriam centenas de KB à toa a cada salvamento.
        ...(fotoMudou ? { foto } : {}),
      });

      aoAtualizar(atualizado);
      setFotoMudou(false);
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarSenha(evento: FormEvent) {
    evento.preventDefault();
    setErroDaSenha(null);
    setSenhaTrocada(false);
    setTrocando(true);

    try {
      await trocarSenha(senhaAtual, novaSenha);
      setSenhaAtual('');
      setNovaSenha('');
      setSenhaTrocada(true);
    } catch (e) {
      setErroDaSenha(e instanceof Error ? e.message : 'Não consegui trocar a senha.');
    } finally {
      setTrocando(false);
    }
  }

  return (
    <>
      <section className="cartao">
        <h2>Seus dados</h2>

        <form onSubmit={salvarDados}>
          <div className="perfil__foto">
            <Avatar nome={nome || usuario.nome} foto={foto} tamanho="grande" />

            <div className="perfil__foto-acoes">
              <div className="perfil__foto-botoes">
                {/*
                  O input fica escondido mas continua no fluxo de foco: some da
                  vista, não do teclado. Quem estiliza com `display: none`
                  deixa o campo inalcançável para quem navega por Tab.
                */}
                <label className="botao-arquivo">
                  <span>{foto ? 'Trocar foto' : 'Escolher foto'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={aoEscolherFoto}
                  />
                </label>

                {foto && (
                  <button type="button" className="botao--discreto" onClick={removerFoto}>
                    Remover
                  </button>
                )}
              </div>

              <p className="perfil__dica">
                A imagem é recortada no centro e reduzida antes de subir.
              </p>
            </div>
          </div>

          <div className="linha-de-campos">
            <label className="campo">
              <span>Nome</span>
              <input
                type="text"
                value={nome}
                onChange={mudar(setNome)}
                maxLength={40}
                required
              />
            </label>

            <label className="campo">
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={mudar(setEmail)}
                required
              />
            </label>
          </div>

          {/* O nome de usuário aparece, mas não muda: é por ele que se entra,
              e trocá-lo por engano tirava o acesso de quem não lembra o
              e-mail. Se você quiser mudá-lo, peça. */}
          <div className="linha-de-campos">
            <label className="campo campo--sozinho">
              <span>Nome de usuário</span>
              <input type="text" value={usuario.login} readOnly />
            </label>
          </div>

          {erro && <p className="mensagem-erro">{erro}</p>}
          {salvo && <p className="mensagem-ok">Perfil salvo.</p>}

          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </section>

      {/*
        A confirmação vem logo depois dos dados, e não no fim da tela: ela fala
        do campo de e-mail que está ali em cima, e quem acabou de trocar o
        endereço precisa achar o caminho de confirmar o novo sem procurar.
      */}
      <section className="cartao">
        <h2>Confirmação de e-mail</h2>
        {/* A `key` no endereço remonta o componente quando o e-mail muda.
            Trocar o e-mail apaga o código pendente lá no banco, e sem isto a
            tela seguiria mostrando o campo do código antigo — junto com os
            dígitos já digitados, que agora não valem para nada. */}
        <ConfirmacaoDeEmail
          key={usuario.email ?? 'sem-email'}
          usuario={usuario}
          aoAtualizar={aoAtualizar}
        />
      </section>

      {/*
        Quem entrou pelo Google nunca escolheu senha: o formulário abaixo não
        teria o que pedir no campo "senha atual". No lugar dele, a explicação
        de como esta conta entra — uma tela que some sem dizer por quê deixa a
        pessoa procurando o que não existe.
      */}
      {!usuario.temSenha ? (
        <section className="cartao">
          <h2>Senha</h2>

          <p className="explicacao">
            Esta conta entra pelo Google, então ela não tem senha para trocar.
            Continue usando o botão “Continuar com o Google” na tela de entrada.
          </p>
        </section>
      ) : (
        <section className="cartao">
          <h2>Trocar senha</h2>

          <p className="explicacao">
            A senha atual é pedida mesmo com você já conectado — assim ninguém que
            encontre o computador destravado troca a sua senha.
          </p>

          <form onSubmit={salvarSenha}>
            <div className="linha-de-campos">
              <label className="campo">
                <span>Senha atual</span>
                <input
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              <label className="campo">
                <span>Nova senha</span>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
            </div>

            {erroDaSenha && <p className="mensagem-erro">{erroDaSenha}</p>}
            {senhaTrocada && <p className="mensagem-ok">Senha trocada.</p>}

            <button type="submit" disabled={trocando}>
              {trocando ? 'Trocando…' : 'Trocar senha'}
            </button>
          </form>
        </section>
      )}
    </>
  );
}

export default Perfil;
