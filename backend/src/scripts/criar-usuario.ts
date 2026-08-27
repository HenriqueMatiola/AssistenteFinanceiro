/**
 * Cria um usuário no banco, perguntando os dados no terminal.
 * Uso:  npm run criar-usuario
 *
 * A senha nunca é gravada em arquivo nem passada por argumento de linha de
 * comando (que ficaria no histórico do terminal). Só o hash vai para o banco.
 */
import { createInterface, type Interface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.ts';

// Quanto maior, mais lento (de propósito) fica calcular o hash — o que atrapalha
// quem tentar adivinhar senhas por força bruta. 10 é o padrão recomendado.
const CUSTO_DO_HASH = 10;
const TAMANHO_MINIMO_SENHA = 8;

/** Faz as perguntas: no terminal, uma a uma; fora dele, lendo tudo de uma vez. */
interface Perguntador {
  texto(pergunta: string): Promise<string>;
  senha(pergunta: string): Promise<string>;
  encerrar(): void;
}

/** Modo normal: você digitando no terminal. A senha não aparece na tela. */
function perguntadorInterativo(): Perguntador {
  const rl: Interface = createInterface({ input: stdin, output: stdout, terminal: true });

  return {
    texto: (pergunta) => rl.question(pergunta),

    async senha(pergunta) {
      // Truque: troca temporariamente a função interna que o readline usa para
      // ecoar cada tecla, deixando passar só o texto da pergunta.
      const interno = rl as unknown as { _writeToOutput?: (s: string) => void };
      const ecoOriginal = interno._writeToOutput;

      interno._writeToOutput = (trecho: string) => {
        if (trecho.includes(pergunta) || trecho === '\r\n' || trecho === '\n') {
          stdout.write(trecho);
        }
      };

      try {
        return await rl.question(pergunta);
      } finally {
        interno._writeToOutput = ecoOriginal;
        stdout.write('\n');
      }
    },

    encerrar: () => rl.close(),
  };
}

/** Modo automático: as respostas chegam prontas (ex: por pipe, num teste). */
async function perguntadorDeLista(): Promise<Perguntador> {
  let entrada = '';
  for await (const pedaco of stdin) entrada += pedaco;
  const linhas = entrada.split(/\r?\n/);
  let proxima = 0;

  const responder = async (pergunta: string): Promise<string> => {
    stdout.write(pergunta + '\n');
    return linhas[proxima++] ?? '';
  };

  return { texto: responder, senha: responder, encerrar: () => {} };
}

async function main(): Promise<void> {
  const perguntar = stdin.isTTY ? perguntadorInterativo() : await perguntadorDeLista();

  try {
    console.log('\n=== Criar usuário do Assistente Financeiro ===\n');

    const nome = (await perguntar.texto('Nome (ex: Henrique): ')).trim();
    if (!nome) throw new Error('O nome não pode ficar vazio.');

    const login = (await perguntar.texto('Login (sem espaços, ex: henrique): '))
      .trim()
      .toLowerCase();
    if (!login) throw new Error('O login não pode ficar vazio.');
    if (/\s/.test(login)) throw new Error('O login não pode conter espaços.');

    const senha = await perguntar.senha('Senha: ');
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      throw new Error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
    }

    const confirmacao = await perguntar.senha('Repita a senha: ');
    if (senha !== confirmacao) throw new Error('As senhas não conferem.');

    const senhaHash = await bcrypt.hash(senha, CUSTO_DO_HASH);

    const usuario = await prisma.usuario.create({
      data: { nome, login, senhaHash },
      select: { id: true, nome: true, login: true },
    });

    console.log(`\n✔ Usuário criado: #${usuario.id} ${usuario.nome} (login: ${usuario.login})`);

    const todos = await prisma.usuario.findMany({
      select: { id: true, nome: true, login: true },
      orderBy: { id: 'asc' },
    });
    console.log('\nUsuários no banco agora:');
    for (const u of todos) console.log(`  #${u.id}  ${u.login.padEnd(15)} ${u.nome}`);
    console.log('');
  } finally {
    perguntar.encerrar();
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  // Erro P2002 = violação de restrição UNIQUE (neste caso, login repetido).
  if (typeof erro === 'object' && erro !== null && 'code' in erro && erro.code === 'P2002') {
    console.error('\n✖ Já existe um usuário com esse login.\n');
  } else {
    console.error(`\n✖ ${erro instanceof Error ? erro.message : String(erro)}\n`);
  }
  process.exitCode = 1;
});
