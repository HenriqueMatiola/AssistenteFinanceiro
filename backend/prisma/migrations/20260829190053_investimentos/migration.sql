-- CreateTable
CREATE TABLE "investimentos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "ativo" TEXT NOT NULL,
    "apelido" TEXT,
    "data_da_compra" DATE NOT NULL,
    "quantidade" DECIMAL(18,8) NOT NULL,
    "valor_pago" DECIMAL(12,2) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investimentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investimentos_usuario_id_idx" ON "investimentos"("usuario_id");

-- AddForeignKey
ALTER TABLE "investimentos" ADD CONSTRAINT "investimentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
