-- Quando o dinheiro de fato se move, se não for no dia do lançamento.
--
-- Uma compra feita em 05/10 e paga em 10/11 passa a ter as duas datas. É o
-- vencimento que decide em qual mês o lançamento pesa no balanço: o Dashboard
-- responde "quanto me resta este mês", e para isso vale o dia em que o dinheiro
-- sai do bolso, não o dia da compra.
--
-- A coluna nasce NULA em tudo que já existe, e nulo quer dizer "no mesmo dia
-- da data". Por isso nenhum lançamento antigo muda de mês: o balanço de todos
-- os meses já fechados continua dando exatamente o que dava antes.
--
-- Nenhuma coluna "data efetiva" é criada de propósito. Ela seria a cópia de um
-- número que já dá para calcular, e cópia de dado é dado que um dia discorda da
-- origem. As consultas resolvem com um OR entre "sem vencimento, vale a data" e
-- "com vencimento, vale o vencimento".

-- AlterTable
ALTER TABLE "transacoes" ADD COLUMN "vencimento" DATE;

-- As consultas por mês passam a olhar as duas colunas. Este índice cobre o lado
-- do vencimento; o índice que já existia em (usuario_id, data) cobre o outro.
CREATE INDEX "transacoes_usuario_id_vencimento_idx" ON "transacoes"("usuario_id", "vencimento");
