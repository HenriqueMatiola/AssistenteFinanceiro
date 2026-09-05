/**
 * "Esqueci minha senha": código de 6 dígitos para o e-mail cadastrado.
 *
 * As duas rotas são PÚBLICAS — quem esqueceu a senha não consegue fazer login
 * para provar quem é. Quem prova é a caixa de e-mail: só quem a abre lê o
 * código. Por serem públicas, elas respondem sempre a mesma coisa, exista ou
 * não a conta procurada (veja o comentário em `/codigo`).
 *
 * Conta criada pelo Google entra por aqui igual: ela não tem senha para
 * recuperar, então o fluxo CRIA a primeira. Depois disso ela entra pelos dois
 * caminhos — o botão do Google continua funcionando.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.ts';
import { gerarToken } from '../auth.ts';
import { ErroDeValidacao } from '../validacao.ts';
import { validarEmail, validarSenha } from '../credenciais.ts';
import { CAMPOS_DO_USUARIO, paraUsuarioPublico } from '../usuarioPublico.ts';
import { envioDeEmailEstaConfigurado, enviarCodigoDeSenha } from '../email.ts';
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

const CUSTO_DO_HASH = 10;

export const rotasDeRecuperacaoDeSenha = Router();

/**
 * A mesma resposta para todo mundo.
 *
 * Conta inexistente, pedido rápido demais, e-mail que não saiu: tudo devolve
 * isto. A rota é aberta e anônima — se ela dissesse "não achei esse e-mail",
 * qualquer um poderia usá-la para descobrir quem tem conta aqui, um endereço
 * por vez.
 *
 * O cadastro, sim, diz "esse e-mail já está em uso": lá a informação é
 * necessária para a pessoa entender por que o cadastro falhou. Aqui não há
 * nada que a pessoa certa precise saber além de "olhe seu e-mail".
 */
const RESPOSTA_NEUTRA = {
  mensagem: 'Se houver uma conta com esse e-mail, o código já está a caminho.',
  validadeEmMinutos: VALIDADE_EM_MINUTOS,
};

/** Manda o código de recuperação para o e-mail informado. */
rotasDeRecuperacaoDeSenha.post('/codigo', async (req, res) => {
  try {
    // Um 503 aqui não vaza nada sobre conta nenhuma: ele fala do servidor.
    if (!envioDeEmailEstaConfigurado()) {
      res.status(503).json({
        erro: 'O envio de e-mail não está configurado neste servidor.',
      });
      return;
    }

    // Formato inválido é recusado na cara dura: "isso não é um e-mail" não
    // conta nada sobre quem tem conta.
    const email = validarEmail((req.body as { email?: unknown }).email);

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true, nome: true, senhaHash: true, codigoDeSenhaEnviadoEm: true },
    });

    // Não existe conta com esse e-mail. Silêncio, e a mesma resposta de sempre.
    if (!usuario) {
      res.json(RESPOSTA_NEUTRA);
      return;
    }

    // Pediu rápido demais. Também sai pela resposta neutra: um 429 aqui
    // avisaria "essa conta existe, e alguém acabou de pedir um código".
    if (segundosParaPoderReenviar(usuario.codigoDeSenhaEnviadoEm) > 0) {
      res.json(RESPOSTA_NEUTRA);
      return;
    }

    const codigo = gerarCodigo();

    // Grava antes de enviar, como na confirmação de e-mail: dois cliques
    // seguidos esbarram no intervalo em vez de virar dois e-mails.
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        codigoDeSenhaHash: await hashDoCodigo(codigo),
        codigoDeSenhaExpiraEm: expiracaoAPartirDe(),
        codigoDeSenhaTentativas: 0,
        codigoDeSenhaEnviadoEm: new Date(),
      },
    });

    try {
      await enviarCodigoDeSenha(email, usuario.nome, codigo, usuario.senhaHash === null);
    } catch (erro) {
      /*
       * O e-mail não saiu. Aqui a resposta neutra cobra o seu preço: quem
       * pediu de verdade não fica sabendo da falha e vai achar que o código
       * está a caminho.
       *
       * Ainda assim é o certo — um "não consegui enviar" só apareceria para
       * e-mails que EXISTEM, e seria exatamente o oráculo que a resposta
       * neutra evita. O que dá para fazer é liberar o reenvio na hora e
       * registrar no log do servidor, que é onde alguém vai procurar.
       */
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { codigoDeSenhaEnviadoEm: null },
      });

      console.error('Falha ao enviar o código de recuperação de senha:', erro);
    }

    res.json(RESPOSTA_NEUTRA);
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }

    console.error('Falha ao gerar o código de recuperação:', erro);
    res.status(500).json({ erro: 'Erro interno ao enviar o código.' });
  }
});

/**
 * Confere o código e troca a senha, num passo só.
 *
 * Um passo, e não dois (conferir o código, depois trocar a senha), porque o
 * caminho de dois exigiria devolver um segundo token temporário no meio — mais
 * uma coisa para guardar, expirar e vazar. Aqui o próprio código é a
 * autorização, e ele morre no mesmo instante em que é usado.
 */
rotasDeRecuperacaoDeSenha.post('/redefinir', async (req, res) => {
  try {
    const corpo = req.body as { email?: unknown; codigo?: unknown; novaSenha?: unknown };

    const email = validarEmail(corpo.email);
    const digitado = validarCodigoDigitado(corpo.codigo);

    // A senha é conferida ANTES do código, de propósito: uma senha curta
    // demais não pode gastar uma das cinco tentativas do código.
    const novaSenha = validarSenha(corpo.novaSenha);

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      select: {
        id: true,
        codigoDeSenhaHash: true,
        codigoDeSenhaExpiraEm: true,
        codigoDeSenhaTentativas: true,
        emailVerificadoEm: true,
      },
    });

    // Conta inexistente responde igualzinho a código errado. Quem chegou aqui
    // com o e-mail de outra pessoa não descobre se ela tem conta.
    if (!usuario) {
      res.status(400).json({ erro: 'Código incorreto ou expirado.' });
      return;
    }

    const problema = problemaComOCodigo({
      hash: usuario.codigoDeSenhaHash,
      expiraEm: usuario.codigoDeSenhaExpiraEm,
      tentativas: usuario.codigoDeSenhaTentativas,
    });

    if (problema) {
      res.status(400).json({ erro: mensagemDoProblema(problema) });
      return;
    }

    if (!(await codigoConfere(digitado, usuario.codigoDeSenhaHash!))) {
      // `increment` do banco, e não uma soma feita aqui: dois palpites
      // simultâneos contariam como um só.
      const { codigoDeSenhaTentativas } = await prisma.usuario.update({
        where: { id: usuario.id },
        data: { codigoDeSenhaTentativas: { increment: 1 } },
        select: { codigoDeSenhaTentativas: true },
      });

      const restantes = MAXIMO_DE_TENTATIVAS - codigoDeSenhaTentativas;
      const plural = restantes === 1 ? '' : 's';

      res.status(400).json({
        erro:
          restantes > 0
            ? `Código incorreto. ${restantes} tentativa${plural} restante${plural}.`
            : 'Código incorreto e sem mais tentativas. Peça um novo código.',
      });
      return;
    }

    const atualizado = await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        senhaHash: await bcrypt.hash(novaSenha, CUSTO_DO_HASH),

        // O código morre aqui: usado uma vez, não vale mais. É o que impede
        // que o mesmo e-mail, aberto de novo semanas depois, troque a senha
        // outra vez.
        codigoDeSenhaHash: null,
        codigoDeSenhaExpiraEm: null,
        codigoDeSenhaTentativas: 0,
        codigoDeSenhaEnviadoEm: null,

        /*
         * De quebra, o e-mail fica confirmado: a pessoa acabou de digitar um
         * código que só chegou naquela caixa — a mesma prova que a tela de
         * confirmação pede. Pedir de novo seria pedir o que já foi feito.
         *
         * O `??` preserva a data de quem já era confirmado, em vez de fingir
         * que a confirmação é de hoje. E o código de confirmação que estivesse
         * pendente sai junto: ele não tem mais o que provar.
         */
        emailVerificadoEm: usuario.emailVerificadoEm ?? new Date(),
        codigoDeEmailHash: null,
        codigoDeEmailExpiraEm: null,
        codigoDeEmailTentativas: 0,
        codigoDeEmailEnviadoEm: null,
      },
      select: CAMPOS_DO_USUARIO,
    });

    /*
     * Já devolve a sessão: quem provou ser dono da caixa de e-mail e acabou de
     * escolher uma senha não precisa digitá-la de novo na tela ao lado. É o
     * mesmo que o cadastro faz.
     *
     * Os tokens antigos dessa conta continuam válidos — eles guardam só o id, e
     * o app não tem lista de sessões para invalidar. Num app com dados de mais
     * gente, o passo seguinte seria um contador de versão de sessão na linha do
     * usuário, conferido a cada requisição.
     */
    res.json({ token: gerarToken(atualizado.id), usuario: paraUsuarioPublico(atualizado) });
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }

    console.error('Falha ao redefinir a senha:', erro);
    res.status(500).json({ erro: 'Erro interno ao redefinir a senha.' });
  }
});
