-- Foto de perfil, guardada como data URI na própria linha do usuário.
-- Nula enquanto ninguém escolheu foto: aí a interface mostra as iniciais.
ALTER TABLE "usuarios" ADD COLUMN "foto" TEXT;
