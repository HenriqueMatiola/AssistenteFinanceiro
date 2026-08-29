-- AlterTable
ALTER TABLE "transacoes" ADD COLUMN     "recorrencia_id" INTEGER;

-- CreateIndex
CREATE INDEX "transacoes_recorrencia_id_data_idx" ON "transacoes"("recorrencia_id", "data");

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_recorrencia_id_fkey" FOREIGN KEY ("recorrencia_id") REFERENCES "recorrencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
