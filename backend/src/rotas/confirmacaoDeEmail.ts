/**
 * Rotas da confirmação de e-mail: pedir o código e conferir o código.
 *
 * As duas exigem login. A confirmação não é uma porta de entrada — é a pessoa
 * já dentro do app provando que a caixa de e-mail que ela cadastrou é dela.
 * Fosse rota pública, qualquer um poderia disparar e-mail para qualquer
 * endereço em nome deste servidor.
 */
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { ErroDeValidacao } from '../validacao.ts';
import { CAMPOS_DO_USUARIO, paraUsuarioPublico } from '../usuarioPublico.ts';
import { envioDeEmailEstaConfigurado, enviarCodigoDeConfirmacao } from '../email.ts';
import {
  gerarCodigo,
  hashDoCodigo,
  codigoConfere,
  validarCodigoDigitado,
  expiracaoAPartirDe,
  segundosParaPoderReenviar,
  problemaComOCodigo,
  mensagemDoProblema,
  MAXIMO_DE_TENTATIVAS,
  VALIDADE_EM_MINUTOS,
} from '../codigoPorEmail.ts';

export const rotasDeConfirmacaoDeEmail = Router();

/**
 * Sorteia um código, guarda o hash dele e manda os dígitos por e-mail.
 *
 * Pedir de novo substitui o código anterior — é o que "reenviar" quer dizer — e
 * zera as tentativas junto: o teto existe para travar quem chuta, não para
 * punir quem digitou errado e pediu outro.
 */
rotasDeConfirmacaoDeEmail.post('/codigo', async (req, res) => {
  try {
    if (!envioDeEmailEstaConfigurado()) {
      res.status(503).json({
        erro: 'O envio de e-mail não está configurado neste servidor.',
      });
      return;
    }

    const usuarioId = idDoUsuarioLogado(req);

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        nome: true,
        email: true,
        emailVerificadoEm: true,
        codigoDeEmailEnviadoEm: true,
      },
    });

    if (!usuario) {
      res.status(401).json({ erro: 'Usuário não encontrado.' });
      return;
    }

    // Contas criadas antes do campo `email` existir não têm endereço nenhum.
    if (!usuario.email) {
      res.status(400).json({ erro: 'Cadastre um e-mail no Perfil antes de confirmá-lo.' });
      return;
    }

    if (usuario.emailVerificadoEm) {
      res.status(400).json({ erro: 'Seu e-mail já está confirmado.' });
      return;
    }

    const espera = segundosParaPoderReenviar(usuario.codigoDeEmailEnviadoEm);

    if (espera > 0) {
      // 429 = "pediu demais, espere". O número vai junto para a tela poder
      // mostrar a contagem em vez de só recusar.
      res.status(429).json({
        erro: `Aguarde ${espera} segundo${espera === 1 ? '' : 's'} para pedir outro código.`,
        segundos: espera,
      });
      return;
    }

    const codigo = gerarCodigo();

    /*
     * Grava ANTES de enviar, de propósito.
     *
     * Se o Gmail demorar e a pessoa clicar duas vezes, o segundo clique já
     * encontra o `codigoDeEmailEnviadoEm` gravado e esbarra na espera acima —
     * em vez de disparar um segundo e-mail. O preço é um código órfão no banco
     * quando o envio falha, o que não atrapalha: ele expira sozinho e o
     * próximo pedido o substitui.
     */
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        codigoDeEmailHash: await hashDoCodigo(codigo),
        codigoDeEmailExpiraEm: expiracaoAPartirDe(),
        codigoDeEmailTentativas: 0,
        codigoDeEmailEnviadoEm: new Date(),
      },
    });

    try {
      await enviarCodigoDeConfirmacao(usuario.email, usuario.nome, codigo);
    } catch (erro) {
      // O e-mail não saiu: nada de deixar a pessoa esperando um código que
      // nunca vai chegar. Liberamos o reenvio na hora, apagando a marca de
      // envio, e contamos a verdade.
      await prisma.usuario.update({
        where: { id: usuarioId },
        data: { codigoDeEmailEnviadoEm: null },
      });

      console.error('Falha ao enviar o código de confirmação:', erro);
      res.status(502).json({
        erro: 'Não consegui enviar o e-mail agora. Tente de novo em instantes.',
      });
      return;
    }

    res.json({
      // O endereço volta para a tela poder dizer "enviamos para fulano@…" —
      // é o que faz a pessoa perceber que digitou o e-mail errado.
      email: usuario.email,
      validadeEmMinutos: VALIDADE_EM_MINUTOS,
    });
  } catch (erro) {
    console.error('Falha ao gerar o código de confirmação:', erro);
    res.status(500).json({ erro: 'Erro interno ao gerar o código.' });
  }
});

/** Confere o código digitado e, se bater, marca o e-mail como confirmado. */
rotasDeConfirmacaoDeEmail.post('/confirmar', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const digitado = validarCodigoDigitado((req.body as { codigo?: unknown }).codigo);

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        emailVerificadoEm: true,
        codigoDeEmailHash: true,
        codigoDeEmailExpiraEm: true,
        codigoDeEmailTentativas: true,
      },
    });

    if (!usuario) {
      res.status(401).json({ erro: 'Usuário não encontrado.' });
      return;
    }

    if (usuario.emailVerificadoEm) {
      res.status(400).json({ erro: 'Seu e-mail já está confirmado.' });
      return;
    }

    // A porteira: código ausente, vencido ou queimado nem chega a ser comparado.
    const problema = problemaComOCodigo({
      hash: usuario.codigoDeEmailHash,
      expiraEm: usuario.codigoDeEmailExpiraEm,
      tentativas: usuario.codigoDeEmailTentativas,
    });

    if (problema) {
      res.status(400).json({ erro: mensagemDoProblema(problema) });
      return;
    }

    if (!(await codigoConfere(digitado, usuario.codigoDeEmailHash!))) {
      // `increment`, e não "tentativas + 1" calculado aqui: dois palpites
      // simultâneos contariam como um só se cada um somasse por conta própria.
      const { codigoDeEmailTentativas } = await prisma.usuario.update({
        where: { id: usuarioId },
        data: { codigoDeEmailTentativas: { increment: 1 } },
        select: { codigoDeEmailTentativas: true },
      });

      const restantes = MAXIMO_DE_TENTATIVAS - codigoDeEmailTentativas;

      res.status(400).json({
        erro:
          restantes > 0
            ? `Código incorreto. ${restantes} tentativa${restantes === 1 ? '' : 's'} restante${restantes === 1 ? '' : 's'}.`
            : 'Código incorreto e sem mais tentativas. Peça um novo código.',
      });
      return;
    }

    // Confirmado. O código sai do banco junto: ele já cumpriu o papel, e
    // guardá-lo só deixaria um hash de graça para quem invadisse o banco.
    const atualizado = await prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        emailVerificadoEm: new Date(),
        codigoDeEmailHash: null,
        codigoDeEmailExpiraEm: null,
        codigoDeEmailTentativas: 0,
        codigoDeEmailEnviadoEm: null,
      },
      select: CAMPOS_DO_USUARIO,
    });

    res.json({ usuario: paraUsuarioPublico(atualizado) });
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }

    console.error('Falha ao confirmar o e-mail:', erro);
    res.status(500).json({ erro: 'Erro interno ao confirmar o e-mail.' });
  }
});
