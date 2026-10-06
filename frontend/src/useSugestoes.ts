import { useCallback, useEffect, useState } from 'react';
import {
  excluirSugestao,
  listarSugestoes,
  SUGESTOES_VAZIAS,
  type SugestoesPorCampo,
} from './api.ts';

/**
 * As opções já usadas nos campos de texto livre, para as telas que os têm.
 *
 * Mora num hook porque três telas precisam da mesma coisa — Lançamentos,
 * Recorrências e A receber e a pagar — e porque a lista muda sozinha: salvar um
 * lançamento com uma categoria nova acrescenta uma opção, e é a tela que pede
 * para recarregar depois disso.
 *
 * Falha em silêncio de propósito. Se a busca não voltar, o campo fica sem
 * sugestões — que é exatamente como ele começa numa conta nova. Digitar
 * continua funcionando, e um erro vermelho no formulário por causa de uma
 * lista de conveniência assustaria à toa.
 */
export function useSugestoes() {
  const [sugestoes, setSugestoes] = useState<SugestoesPorCampo>(SUGESTOES_VAZIAS);

  const recarregar = useCallback(() => {
    listarSugestoes()
      .then(setSugestoes)
      .catch(() => {
        /* sem sugestões, o campo ainda aceita qualquer coisa digitada */
      });
  }, []);

  useEffect(recarregar, [recarregar]);

  /**
   * Tira a opção da lista.
   *
   * Some da tela na hora, antes da resposta do servidor: é a pessoa apagando
   * algo que ela mesma acabou de ver, e esperar o ida-e-volta só faria o "x"
   * parecer quebrado. Se o servidor recusar, a lista volta ao que ele diz.
   */
  const excluir = useCallback(
    (id: number) => {
      setSugestoes((atuais) => ({
        CATEGORIA: atuais.CATEGORIA.filter((s) => s.id !== id),
        FORMA_DE_PAGAMENTO: atuais.FORMA_DE_PAGAMENTO.filter((s) => s.id !== id),
        PESSOA: atuais.PESSOA.filter((s) => s.id !== id),
      }));

      excluirSugestao(id).catch(recarregar);
    },
    [recarregar]
  );

  return { sugestoes, excluir, recarregar };
}
