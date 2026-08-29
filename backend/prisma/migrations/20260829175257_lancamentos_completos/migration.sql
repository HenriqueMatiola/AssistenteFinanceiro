-- CreateEnum
CREATE TYPE "StatusTransacao" AS ENUM ('PENDENTE', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "ClassificacaoGasto" AS ENUM ('FIXO', 'VARIAVEL');

-- AlterTable
ALTER TABLE "recorrencias" ADD COLUMN     "classificacao" "ClassificacaoGasto",
ADD COLUMN     "forma_de_pagamento" TEXT;

-- AlterTable
ALTER TABLE "transacoes" ADD COLUMN     "classificacao" "ClassificacaoGasto",
ADD COLUMN     "forma_de_pagamento" TEXT,
ADD COLUMN     "grupo_de_parcelas" UUID,
ADD COLUMN     "parcela_atual" INTEGER,
ADD COLUMN     "parcelas_totais" INTEGER,
ADD COLUMN     "status" "StatusTransacao" NOT NULL DEFAULT 'CONCLUIDA';

-- A coluna `descricao` é obrigatória, mas já existem lançamentos na tabela.
-- Criar direto como NOT NULL faria a migration falhar, e um default fixo
-- ("Sem descrição") apagaria a única informação que essas linhas têm.
-- Então: cria aceitando nulo, herda a categoria como descrição, e só então
-- torna obrigatória. Quem lançou "Mercado" fica com descrição "Mercado", que
-- é exatamente o que a pessoa quis dizer antes de o campo existir.
ALTER TABLE "transacoes" ADD COLUMN "descricao" TEXT;
UPDATE "transacoes" SET "descricao" = "categoria" WHERE "descricao" IS NULL;
ALTER TABLE "transacoes" ALTER COLUMN "descricao" SET NOT NULL;

-- CreateIndex
CREATE INDEX "transacoes_grupo_de_parcelas_idx" ON "transacoes"("grupo_de_parcelas");
