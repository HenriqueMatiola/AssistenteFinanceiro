-- A tabela `investimentos` guardava uma COMPRA por linha. Ela passa a guardar
-- uma OPERAÇÃO (compra ou venda), o que é o que permite ter histórico de
-- vendas e calcular preço médio depois de uma venda parcial.
--
-- Feita à mão, e não gerada pelo Prisma, porque o caminho automático seria
-- recriar a tabela — e havia posições reais registradas nela. Aqui a tabela é
-- renomeada e as linhas existentes viram compras, sem perder nada.

-- CreateEnum
CREATE TYPE "TipoDeOperacao" AS ENUM ('COMPRA', 'VENDA');

-- CreateEnum
CREATE TYPE "ClasseDeAtivo" AS ENUM ('ACAO', 'FII', 'CRIPTO', 'ETF', 'OUTRO');

-- A tabela muda de nome junto com o significado.
ALTER TABLE "investimentos" RENAME TO "operacoes";

-- Tudo que existia foi uma compra.
ALTER TABLE "operacoes" ADD COLUMN "tipo" "TipoDeOperacao" NOT NULL DEFAULT 'COMPRA';

-- A classe do ativo é deduzida do próprio código, que é a única informação
-- disponível: na B3, papéis terminados em 11 são fundos; o resto com sufixo
-- .SA são ações; pares contra o dólar são cripto. Quem discordar reclassifica
-- editando a operação.
ALTER TABLE "operacoes" ADD COLUMN "classe" "ClasseDeAtivo";
UPDATE "operacoes" SET "classe" = CASE
  WHEN "ativo" LIKE '%11.SA' THEN 'FII'::"ClasseDeAtivo"
  WHEN "ativo" LIKE '%.SA'   THEN 'ACAO'::"ClasseDeAtivo"
  WHEN "ativo" LIKE '%-USD'  THEN 'CRIPTO'::"ClasseDeAtivo"
  ELSE 'OUTRO'::"ClasseDeAtivo"
END;
ALTER TABLE "operacoes" ALTER COLUMN "classe" SET NOT NULL;

-- Os nomes deixam de falar só de compra.
ALTER TABLE "operacoes" RENAME COLUMN "data_da_compra" TO "data";
ALTER TABLE "operacoes" RENAME COLUMN "valor_pago" TO "valor";

-- O apelido sai: o ticker já identifica o ativo.
ALTER TABLE "operacoes" DROP COLUMN "apelido";

-- O índice acompanha a consulta que a carteira faz: as operações de um
-- usuário, por ativo, na ordem em que aconteceram.
DROP INDEX IF EXISTS "investimentos_usuario_id_idx";
CREATE INDEX "operacoes_usuario_id_ativo_data_idx" ON "operacoes"("usuario_id", "ativo", "data");
