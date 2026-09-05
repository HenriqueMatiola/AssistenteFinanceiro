-- "Esqueci minha senha": código de 6 dígitos enviado para o e-mail cadastrado.
--
-- As quatro colunas repetem a forma das `codigo_de_email_*`, e não as
-- reaproveitam de propósito: um código pedido para confirmar o endereço não
-- pode virar autorização para trocar a senha.
--
-- Numa conta criada pelo Google (`senha_hash` nulo) este é o caminho para ela
-- ganhar uma senha — o e-mail prova quem é do mesmo jeito.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "codigo_de_senha_hash" TEXT,
ADD COLUMN     "codigo_de_senha_expira_em" TIMESTAMP(3),
ADD COLUMN     "codigo_de_senha_tentativas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codigo_de_senha_enviado_em" TIMESTAMP(3);
