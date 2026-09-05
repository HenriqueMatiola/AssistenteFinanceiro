import { useEffect, useState, type FormEvent } from 'react';
import {
  pedirCodigoDeEmail,
  confirmarEmail,
  ErroDaApi,
  type Usuario,
} from '../api.ts';

interface Props {
  usuario: Usuario;
  /** Avisa o App de que o e-mail foi confirmado, para a faixa sumir. */
  aoAtualizar: (usuario: Usuario) => void;
}

/**
 * O passo a passo de confirmar o e-mail: pedir o código, digitar, pronto.
 *
 * Componente próprio, e não um trecho dentro do Perfil, porque são quatro
 * estados de tela (nada pedido / código enviado / erro / confirmado) e três
 * chamadas — dentro do Perfil isso seria mais estado do que a tela inteira
 * tem hoje.
 */
function ConfirmacaoDeEmail({ usuario, aoAtualizar }: Props) {
  const [codigo, setCodigo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Segundos que faltam para poder pedir outro código.
   *
   * A contagem é da tela, não do servidor: ela existe para o botão explicar
   * por que está desligado. Quem burlar o relógio do navegador só vai levar o
   * 429 do backend, que é quem de fato manda.
   */
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return;
    const relogio = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(relogio);
  }, [espera]);

  async function pedirCodigo() {
    setErro(null);
    setAviso(null);
    setOcupado(true);

    try {
      const { email, validadeEmMinutos } = await pedirCodigoDeEmail();
      setEnviado(true);
      setEspera(60);
      setAviso(
        `Código enviado para ${email}. Ele vale por ${validadeEmMinutos} minutos — ` +
          'se não aparecer, olhe no spam.'
      );
    } catch (e) {
      // O 429 traz na mensagem quantos segundos faltam; a contagem da tela
      // saiu do ar (recarregou a página, por exemplo). Religamos ela.
      if (e instanceof ErroDaApi && e.status === 429) setEspera(60);
      setErro(e instanceof Error ? e.message : 'Não consegui enviar o código.');
    } finally {
      setOcupado(false);
    }
  }

  async function enviarCodigo(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    setOcupado(true);

    try {
      aoAtualizar(await confirmarEmail(codigo));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui confirmar.');
      // A senha some do campo quando erra; o código, não: quem digitou 5 de 6
      // dígitos certos quer corrigir o último, e não recomeçar.
    } finally {
      setOcupado(false);
    }
  }

  if (usuario.emailVerificado) {
    return (
      <p className="mensagem-ok">E-mail confirmado.</p>
    );
  }

  // Contas antigas, criadas antes de o cadastro pedir e-mail.
  if (!usuario.email) {
    return (
      <p className="explicacao">
        Esta conta ainda não tem e-mail. Cadastre um acima e salve para poder
        confirmá-lo.
      </p>
    );
  }

  return (
    <div className="confirmacao">
      <p className="explicacao">
        {enviado
          ? 'Digite abaixo o código de 6 dígitos que chegou no seu e-mail.'
          : `Vamos mandar um código de 6 dígitos para ${usuario.email}. ` +
            'Digitá-lo de volta é o que prova que a caixa é sua.'}
      </p>

      {enviado && (
        <form className="confirmacao__form" onSubmit={enviarCodigo}>
          <label className="campo campo--sozinho">
            <span>Código</span>
            <input
              className="confirmacao__codigo"
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              /* Teclado numérico no celular sem recusar quem cola com espaço:
                 type="number" traria setinhas e engoliria o zero à esquerda. */
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={7}
              required
            />
          </label>

          <button type="submit" disabled={ocupado || codigo.trim().length < 6}>
            {ocupado ? 'Conferindo…' : 'Confirmar'}
          </button>
        </form>
      )}

      {erro && <p className="mensagem-erro">{erro}</p>}
      {aviso && <p className="mensagem-aviso">{aviso}</p>}

      <button
        type="button"
        className="botao--discreto"
        onClick={pedirCodigo}
        disabled={ocupado || espera > 0}
      >
        {espera > 0
          ? `Reenviar em ${espera}s`
          : enviado
            ? 'Enviar outro código'
            : 'Enviar código'}
      </button>
    </div>
  );
}

export default ConfirmacaoDeEmail;
