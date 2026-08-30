-- Entrar com o Google.
--
-- `senha_hash` deixa de ser obrigatório: uma conta criada pelo Google nunca
-- escolheu senha. As contas que já existem continuam com a delas.
--
-- `google_id` guarda o `sub` do ID token — o identificador estável da conta
-- Google, que não muda quando a pessoa troca de e-mail lá.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "senha_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_google_id_key" ON "usuarios"("google_id");
