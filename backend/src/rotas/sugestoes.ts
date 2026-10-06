/**
 * Rotas das sugestões dos campos de texto livre.
 *
 * Só duas: listar e apagar. Não existe rota de CRIAR, de propósito — quem
 * alimenta a lista são as rotas de lançar, quando recebem uma categoria ou
 * forma nova. Uma rota própria para isso seria um segundo caminho para o mesmo
 * dado, e um dia os dois discordariam.
 *
 * Montado atrás de `exigirLogin`, então toda consulta filtra pelo usuário.
 */
import { Router } from 'express';
import { prisma } from '../prisma.ts';
import { idDoUsuarioLogado } from '../auth.ts';
import { responderErro } from '../respostas.ts';
import { validarId } from '../validacao.ts';
import { listarSugestoes } from '../sugestoes.ts';

export const rotasDeSugestoes = Router();

/**
 * GET /api/sugestoes
 * As três listas de uma vez: são poucas dezenas de linhas no total, e a tela
 * de Lançamentos precisa de duas delas ao mesmo tempo.
 */
rotasDeSugestoes.get('/', async (req, res) => {
  try {
    res.json({ sugestoes: await listarSugestoes(idDoUsuarioLogado(req)) });
  } catch (erro) {
    responderErro(res, erro, 'listar as sugestões');
  }
});

/**
 * DELETE /api/sugestoes/:id
 *
 * Tira a opção do campo de digitar. NÃO mexe nos lançamentos que a usaram: o
 * que foi gasto em "Mercado" continua em "Mercado" — some só a oferta.
 *
 * O `deleteMany` filtrando por usuário faz o papel de duas coisas ao mesmo
 * tempo: apaga e garante que ninguém apague a lista de outra pessoa
 * adivinhando o id. Quando não apaga nada, o id não existe ou não era dele, e
 * a resposta é a mesma 404 nos dois casos.
 */
rotasDeSugestoes.delete('/:id', async (req, res) => {
  try {
    const { count } = await prisma.sugestao.deleteMany({
      where: { id: validarId(req.params.id), usuarioId: idDoUsuarioLogado(req) },
    });

    if (count === 0) {
      res.status(404).json({ erro: 'Sugestão não encontrada.' });
      return;
    }

    res.status(204).end();
  } catch (erro) {
    responderErro(res, erro, 'apagar a sugestão');
  }
});
