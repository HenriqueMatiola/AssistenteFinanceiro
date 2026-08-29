-- Segundo identificador de login: a tela aceita nome de usuário ou e-mail.

-- Nulo permitido: a conta que já existia foi criada antes deste campo e
-- continua entrando pelo nome de usuário. No Postgres, vários NULL não
-- brigam entre si num índice UNIQUE, então isso não impede novas contas.
ALTER TABLE "usuarios" ADD COLUMN "email" TEXT;

-- O e-mail é sempre gravado em minúsculas pelo backend, então o índice
-- simples já garante que ninguém cadastre o mesmo endereço duas vezes.
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");
