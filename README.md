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
| `cd backend && npm test` | Roda os testes de unidade (motor de projeção). Não precisa de banco nem servidor |
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
| `POST /api/transacoes` | **Protegida.** Cria um lançamento. Com `parcelas: 12`, cria as 12 de uma vez. Devolve sempre uma lista. O dono vem do token, nunca do corpo |
| `PATCH /api/transacoes/:id` | **Protegida.** Marca como pago/recebido: `{status: "CONCLUIDA"}` |
| `DELETE /api/transacoes/:id` | **Protegida.** Apaga o lançamento; com `?todasAsParcelas=true`, apaga a compra parcelada inteira |
| `GET /api/resumo` | **Protegida.** Balanço do mês: sobra do mês anterior, entradas, saídas, saldo, disponível, e a quebra entre realizado e pendente. `?mes=2026-08` |
| `GET /api/resumo/categorias` | **Protegida.** Gastos do mês somados por categoria, do maior para o menor |
| `GET /api/resumo/formas-de-pagamento` | **Protegida.** Gastos do mês por forma de pagamento — a fatura de cada cartão |
| `GET /api/recorrencias` | **Protegida.** Lista as recorrências do usuário, ativas e desligadas |
| `POST /api/recorrencias` | **Protegida.** Cria uma recorrência `{descricao, valor, categoria, tipo, diaDoMes}` |
| `PATCH /api/recorrencias/:id` | **Protegida.** Liga ou desliga: `{ativa: true|false}` |
| `DELETE /api/recorrencias/:id` | **Protegida.** Apaga a recorrência de vez |
| `GET /api/projecao` | **Protegida.** Saldo projetado por mês. `?inicio=2026-09&meses=6` (padrão: 6 meses a partir do mês que vem) |

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
- **Entradas e saídas do mês contam tudo que está lançado, pago ou não.** É
  o que responde "como o mês fecha se tudo acontecer como planejado". A
  quebra por situação vai junto, em `realizado` e `pendente`.
- **Num parcelamento, o valor informado é o de CADA parcela**, não o total.
  É o número que aparece na fatura, e evita a sobra de centavo que uma
  divisão como 100 ÷ 3 deixaria.
- **A parcela não arrasta o dia encurtado**: uma compra em 31/01 gera 28/02
  e depois 31/03, não 28/03 — cada parcela sai da data original.
- **A projeção nunca cobre o mês corrente.** Uma conta deste mês que já foi
  paga está lançada em `transacoes`; somar a recorrência dela por cima
  contaria o mesmo dinheiro duas vezes. O mês atual é assunto do Dashboard,
  que só olha o que de fato aconteceu.
- **O motor de projeção não conhece banco nem HTTP**
  ([backend/src/projecao.ts](backend/src/projecao.ts)): recebe números e
  devolve números. É o que permite testá-lo com `npm test` sem subir nada.
- Rotas protegidas são montadas em grupo
  (`app.use('/api/transacoes', exigirLogin, ...)`) para que nenhuma rota nova
  nasça desprotegida por esquecimento.

## Estado atual

Etapas 0 a 5 concluídas:

- **0–1** — repositório, PostgreSQL no Docker, login com hash e JWT
- **2** — tabela `transacoes` e tela de Lançamentos
- **3** — Dashboard: totais do mês e gráfico de gastos por categoria
- **4** — tabela `recorrencias`, motor de projeção (com testes) e tela de Projeção
- **5** — lançamentos completos: descrição, situação (a pagar/pago), forma de
  pagamento, fixo/variável, parcelamento automático e balanço com sobra do
  mês anterior

Próxima: Etapa 6 — Investimentos.
