/**
 * Como um erro vira uma resposta HTTP.
 *
 * Toda rota termina num `catch` que precisa decidir a mesma coisa: a culpa foi
 * de quem pediu (400) ou nossa (500)? Ter a decisão num lugar só evita que uma
 * rota exponha o erro interno na tela do usuário enquanto as outras não.
 */
import type { Response } from 'express';
import { ErroDeValidacao } from './validacao.ts';

/**
 * @param contexto Texto que completa "Erro interno ao …" — ex: "criar a
 *                 recorrência". Aparece na resposta e no log do servidor.
 */
export function responderErro(res: Response, erro: unknown, contexto: string): void {
  if (erro instanceof ErroDeValidacao) {
    // A mensagem da validação é escrita para ser lida por quem usa o app,
    // então pode ir para a tela inteira.
    res.status(400).json({ erro: erro.message });
    return;
  }

  // Já um erro inesperado pode conter detalhe de banco ou caminho de arquivo:
  // ele vai para o log do servidor, e o usuário recebe só o aviso genérico.
  console.error(`${contexto}:`, erro);
  res.status(500).json({ erro: `Erro interno ao ${contexto}.` });
}
