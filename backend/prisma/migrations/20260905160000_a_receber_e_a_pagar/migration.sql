-- A aba "A receber e a pagar": dinheiro emprestado, adiantado ou rateado com
-- alguém, sem data para acontecer.
--
-- Duas tabelas, e não uma coluna "já pago" no acerto: o histórico ("quando foi
-- que eu paguei?") é metade do motivo de a aba existir, e um booleano não
-- guarda quando nem quanto. Cada baixa é uma linha.
--
-- Nada aqui toca em `transacoes`. Emprestar dinheiro não é gasto — é dinheiro
-- que mudou de lugar e volta —, e um acerto sem data não pertence a mês
-- nenhum, então não teria como entrar no balanço sem mentir sobre o mês.

-- CreateEnum
CREATE TYPE "TipoDeAcerto" AS ENUM ('RECEBER', 'PAGAR');

-- CreateTable
CREATE TABLE "acertos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo" "TipoDeAcerto" NOT NULL,
    "pessoa" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "descricao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acertos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baixas" (
    "id" SERIAL NOT NULL,
    "acerto_id" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baixas_pkey" PRIMARY KEY ("id")
);

-- A tela sempre pede "os acertos deste usuário", separando a receber de pagar.
CREATE INDEX "acertos_usuario_id_tipo_idx" ON "acertos"("usuario_id", "tipo");

-- "As baixas deste acerto, em ordem" é a única consulta que existe sobre elas.
CREATE INDEX "baixas_acerto_id_data_idx" ON "baixas"("acerto_id", "data");

-- Apagar o usuário leva os acertos; apagar o acerto leva o histórico dele.
-- Sem o acerto, uma baixa não quer dizer nada.
ALTER TABLE "acertos" ADD CONSTRAINT "acertos_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "baixas" ADD CONSTRAINT "baixas_acerto_id_fkey"
  FOREIGN KEY ("acerto_id") REFERENCES "acertos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
