// Ponto único de acesso ao banco. Todo o resto do backend importa daqui.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL não definida. Copie backend/.env.example para backend/.env.'
  );
}

// O adapter é a ponte entre o Prisma e o driver que realmente fala com o
// PostgreSQL (a biblioteca pg). Ele cuida do pool de conexões.
const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
