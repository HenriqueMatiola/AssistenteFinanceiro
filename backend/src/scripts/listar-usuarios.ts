/**
 * Lista os usuários cadastrados.  Uso:  npm run listar-usuarios
 * Mostra só o começo do hash — o suficiente para conferir que a senha foi
 * guardada embaralhada, sem despejar o hash inteiro na tela. Conta que entra
 * pelo Google não tem hash nenhum, e aparece marcada como tal.
 */
import { prisma } from '../prisma.ts';

const usuarios = await prisma.usuario.findMany({ orderBy: { id: 'asc' } });

if (usuarios.length === 0) {
  console.log('\nNenhum usuário cadastrado. Rode: npm run criar-usuario\n');
} else {
  console.log(`\n${usuarios.length} usuário(s) no banco:\n`);
  for (const u of usuarios) {
    const entrada = u.senhaHash
      ? `senha: ${u.senhaHash.slice(0, 20)}…`
      : `Google${u.googleId ? '' : ' (sem senha e sem vínculo)'}`;

    console.log(`  #${u.id}  ${u.login.padEnd(15)} ${u.nome.padEnd(20)} ${entrada}`);
  }
  console.log('');
}

await prisma.$disconnect();
