-- CreateTable
CREATE TABLE "recorrencias" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo" "TipoTransacao" NOT NULL,
    "dia_do_mes" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recorrencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recorrencias_usuario_id_ativa_idx" ON "recorrencias"("usuario_id", "ativa");

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
