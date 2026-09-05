/**
 * Rotas do perfil: o que a pessoa muda na própria conta.
 *
 * Duas rotas separadas de propósito. Trocar a senha exige a senha atual e
 * devolve erros próprios; misturar isso com "mudar o nome" faria um punhado de
 * caminhos condicionais dentro de uma rota só.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { ErroDeValidacao } from '../validacao.ts';
import { validarEmail, validarNomeDeExibicao, validarSenha } from '../credenciais.ts';
import { validarFotoDePerfil } from '../foto.ts';
import { CAMPOS_DO_USUARIO, paraUsuarioPublico } from '../usuarioPublico.ts';

const CUSTO_DO_HASH = 10;

export const rotasDePerfil = Router();

/**
 * Atualiza nome, e-mail e foto.
 *
 * Só mexe no que veio no corpo: mandar `{ foto: null }` tira a foto sem tocar
 * no resto, e mandar só `{ nome }` não apaga o e-mail.
 */
rotasDePerfil.patch('/', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const corpo = req.body as { nome?: unknown; email?: unknown; foto?: unknown };

    const dados: {
      nome?: string;
      email?: string;
      foto?: string | null;
      emailVerificadoEm?: Date | null;
      codigoDeEmailHash?: string | null;
      codigoDeEmailExpiraEm?: Date | null;
      codigoDeEmailTentativas?: number;
      codigoDeEmailEnviadoEm?: Date | null;
    } = {};

    if ('nome' in corpo) dados.nome = validarNomeDeExibicao(corpo.nome);
    if ('foto' in corpo) dados.foto = validarFotoDePerfil(corpo.foto);

    if ('email' in corpo) {
      const email = validarEmail(corpo.email);

      // O índice UNIQUE também barraria, mas com uma mensagem de banco. Aqui
      // dizemos o que aconteceu — e o `not` deixa passar o próprio e-mail,
      // senão salvar o formulário sem mexer no campo daria conflito.
      const deOutraPessoa = await prisma.usuario.findFirst({
        where: { email, id: { not: usuarioId } },
        select: { id: true },
      });

      if (deOutraPessoa) {
        res.status(409).json({ erro: 'Esse e-mail já está em uso por outra conta.' });
        return;
      }

      dados.email = email;

      /*
       * E-mail novo é e-mail não confirmado.
       *
       * `emailVerificadoEm` fala do endereço que está na linha AGORA — deixá-lo
       * preenchido depois da troca faria o app jurar que um endereço nunca
       * visto já foi confirmado. O código pendente vai junto: ele foi enviado
       * para a caixa antiga e não prova nada sobre a nova.
       *
       * Trocar pelo mesmo e-mail cai aqui também. Custa uma confirmação a mais
       * a quem salvou o formulário sem mexer no campo — e o preço de errar
       * para o outro lado seria bem pior.
       */
      dados.emailVerificadoEm = null;
      dados.codigoDeEmailHash = null;
      dados.codigoDeEmailExpiraEm = null;
      dados.codigoDeEmailTentativas = 0;
      dados.codigoDeEmailEnviadoEm = null;
    }

    if (Object.keys(dados).length === 0) {
      res.status(400).json({ erro: 'Nada para atualizar.' });
      return;
    }

    const usuario = await prisma.usuario.update({
      where: { id: usuarioId },
      data: dados,
      select: CAMPOS_DO_USUARIO,
    });

    res.json({ usuario: paraUsuarioPublico(usuario) });
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }

    console.error('Falha ao atualizar o perfil:', erro);
    res.status(500).json({ erro: 'Erro interno ao salvar o perfil.' });
  }
});

/**
 * Troca a senha.
 *
 * Pede a senha atual mesmo já havendo token válido: quem senta num computador
 * destravado não deve conseguir trancar o dono para fora da própria conta.
 */
rotasDePerfil.patch('/senha', async (req, res) => {
  try {
    const usuarioId = idDoUsuarioLogado(req);
    const corpo = req.body as { senhaAtual?: unknown; novaSenha?: unknown };

    if (typeof corpo.senhaAtual !== 'string' || !corpo.senhaAtual) {
      res.status(400).json({ erro: 'Informe a senha atual.' });
      return;
    }

    const novaSenha = validarSenha(corpo.novaSenha);

    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { senhaHash: true },
    });

    if (!usuario) {
      res.status(401).json({ erro: 'Usuário não encontrado.' });
      return;
    }

    // Conta criada pelo Google nunca escolheu senha: não há atual para
    // conferir, e trocar por uma nova aqui seria criar, não trocar. A tela de
    // Perfil já esconde o formulário nesse caso; isto fecha a porta de trás.
    if (usuario.senhaHash === null) {
      res.status(400).json({
        erro: 'Esta conta entra pelo Google e não tem senha para trocar.',
      });
      return;
    }

    if (!(await bcrypt.compare(corpo.senhaAtual, usuario.senhaHash))) {
      res.status(400).json({ erro: 'A senha atual não confere.' });
      return;
    }

    if (await bcrypt.compare(novaSenha, usuario.senhaHash)) {
      res.status(400).json({ erro: 'A nova senha é igual à atual.' });
      return;
    }

    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { senhaHash: await bcrypt.hash(novaSenha, CUSTO_DO_HASH) },
    });

    // O token continua valendo: ele guarda o id, e não a senha. Trocar a senha
    // aqui não derruba a sessão de quem acabou de trocá-la.
    res.json({ ok: true });
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) {
      res.status(400).json({ erro: erro.message });
      return;
    }

    console.error('Falha ao trocar a senha:', erro);
    res.status(500).json({ erro: 'Erro interno ao trocar a senha.' });
  }
});
