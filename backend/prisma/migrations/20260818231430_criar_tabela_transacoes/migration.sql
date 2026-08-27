-- CreateEnum
CREATE TYPE "TipoTransacao" AS ENUM ('GASTO', 'GANHO');

-- CreateTable
CREATE TABLE "transacoes" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo" "TipoTransacao" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transacoes_usuario_id_data_idx" ON "transacoes"("usuario_id", "data");

-- AddForeignKey
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
