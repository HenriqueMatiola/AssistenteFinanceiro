# Assistente Financeiro Pessoal

Web app pessoal para organizar gastos, ganhos e investimentos.

- Spec: [docs/superpowers/specs/2026-08-18-assistente-financeiro-design.md](docs/superpowers/specs/2026-08-18-assistente-financeiro-design.md)
- Plano de implementação: [docs/superpowers/specs/2026-08-18-assistente-financeiro-plano.md](docs/superpowers/specs/2026-08-18-assistente-financeiro-plano.md)

## Estrutura

```
backend/    API em Node.js + Express + TypeScript
frontend/   Interface em React + Vite + TypeScript
docs/       Spec e plano
docker-compose.yml   PostgreSQL local para desenvolvimento
```

## Pré-requisitos

- Node.js 22+
- Docker Desktop

## Primeira vez

```bash
# 1. Copiar os modelos de configuração
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Gerar o segredo dos tokens e colocar em backend/.env (JWT_SECRET)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Instalar dependências
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..

# 4. Criar as tabelas do banco (com o Docker já rodando)
cd backend && npx prisma migrate dev && cd ..

# 5. Criar seu usuário (repita para cada pessoa)
cd backend && npm run criar-usuario && cd ..
```

## Rodando no dia a dia

Precisa de **três coisas no ar**. O banco fica em segundo plano; backend e
frontend pedem um terminal cada.

```bash
# Terminal 1 (na raiz) — banco de dados
docker compose up -d

# Terminal 2 — backend em http://localhost:3001
cd backend && npm run dev

# Terminal 3 — frontend em http://localhost:5173
cd frontend && npm run dev
```

Depois abra <http://localhost:5173> no navegador.

## Comandos úteis

| Comando | O que faz |
|---|---|
| `docker compose up -d` | Sobe o PostgreSQL |
| `docker compose down` | Para o PostgreSQL (mantém os dados) |
| `docker compose down -v` | Para e **apaga os dados** do banco |
| `docker compose ps` | Mostra se o banco está rodando e saudável |
| `docker exec -it assfinanceiro-db psql -U assfin -d assfinanceiro` | Abre o terminal SQL do banco |
| `cd backend && npm run typecheck` | Verifica os tipos do backend |
| `cd backend && npm run criar-usuario` | Cria um usuário (pergunta nome, login e senha) |
| `cd backend && npm run listar-usuarios` | Lista os usuários cadastrados |
| `cd backend && npx prisma migrate dev --name X` | Cria e aplica uma migration após mudar o schema |
| `cd backend && npx prisma studio` | Abre um navegador visual das tabelas |
| `cd frontend && npm run build` | Compila o frontend para produção |

## Rotas do backend

| Rota | O que devolve |
|---|---|
| `GET /api/hello` | Mensagem de teste — prova que a API está no ar |
| `GET /api/health` | Faz uma consulta real no PostgreSQL e informa se o banco respondeu |
| `POST /api/login` | Recebe `{login, senha}` e devolve `{token, usuario}` |
| `GET /api/eu` | **Protegida.** Devolve o usuário dono do token enviado em `Authorization: Bearer <token>` |
| `GET /api/transacoes` | **Protegida.** Lista os lançamentos do usuário do token. Filtros opcionais: `?mes=2026-08` e `?tipo=GASTO` |
| `POST /api/transacoes` | **Protegida.** Cria um lançamento `{data, valor, categoria, tipo}`. O dono vem do token, nunca do corpo |

## Banco de dados

As tabelas são descritas em [backend/prisma/schema.prisma](backend/prisma/schema.prisma).
Depois de alterar o schema, rode `npx prisma migrate dev --name <descricao>`: o
Prisma gera um arquivo SQL em `backend/prisma/migrations/` (versionado no Git) e
o aplica no banco.

## Decisões que valem lembrar

- **Dinheiro** é `DECIMAL(12,2)` no banco, nunca `Float`: em ponto flutuante,
  `0.1 + 0.2` dá `0.30000000000000004` e o erro acumula a cada soma.
- **Datas de transação** usam o tipo `DATE` (sem hora) e trafegam como texto
  `"AAAA-MM-DD"`. Com hora e fuso, um lançamento pode pular de dia — e de mês.
- **O dono de um registro sempre vem do token**, nunca do corpo da requisição.
- Rotas protegidas são montadas em grupo
  (`app.use('/api/transacoes', exigirLogin, ...)`) para que nenhuma rota nova
  nasça desprotegida por esquecimento.

## Estado atual

Etapas 0, 1 e 2 concluídas: repositório, banco local, login com hash e JWT,
tabela `transacoes` e tela de Lançamentos (lista com filtros + formulário).
Próxima: Etapa 3 — Dashboard.
