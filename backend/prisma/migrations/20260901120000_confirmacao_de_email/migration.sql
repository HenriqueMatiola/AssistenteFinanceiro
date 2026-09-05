-- Confirmação de e-mail por código de 6 dígitos.
--
-- `email_verificado_em` é a resposta para "esta caixa de e-mail é mesmo desta
-- pessoa?". Nulo quer dizer que ninguém provou nada ainda — é onde ficam TODAS
-- as contas que já existem, inclusive as criadas pelo Google, que passam a ser
-- marcadas no próximo login.
--
-- As outras quatro colunas são o código que está valendo: o hash dele (nunca
-- os dígitos), até quando vale, quantos palpites errados já levou e quando
-- saiu — este último para segurar o intervalo entre reenvios.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "email_verificado_em" TIMESTAMP(3),
ADD COLUMN     "codigo_de_email_hash" TEXT,
ADD COLUMN     "codigo_de_email_expira_em" TIMESTAMP(3),
ADD COLUMN     "codigo_de_email_tentativas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codigo_de_email_enviado_em" TIMESTAMP(3);
