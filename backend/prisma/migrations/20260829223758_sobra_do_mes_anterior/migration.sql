-- AlterTable
ALTER TABLE "operacoes" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TABLE "operacoes" RENAME CONSTRAINT "investimentos_pkey" TO "operacoes_pkey";

-- AlterTable
ALTER TABLE "transacoes" ADD COLUMN     "eh_sobra_do_mes_anterior" BOOLEAN NOT NULL DEFAULT false;

-- RenameForeignKey
ALTER TABLE "operacoes" RENAME CONSTRAINT "investimentos_usuario_id_fkey" TO "operacoes_usuario_id_fkey";
