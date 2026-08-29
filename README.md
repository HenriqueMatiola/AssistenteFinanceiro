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
| `GET /api/resumo` | **Protegida.** Balanço do mês: sobra anterior, entradas, saídas, saldo, disponível, e a composição em realizado / lançado-pendente / previsto pelas recorrências. `?mes=2026-08` |
| `GET /api/resumo/categorias` | **Protegida.** Gastos do mês somados por categoria, do maior para o menor |
| `GET /api/resumo/formas-de-pagamento` | **Protegida.** Gastos do mês por forma de pagamento — a fatura de cada cartão |
| `GET /api/recorrencias` | **Protegida.** Lista as recorrências do usuário, ativas e desligadas |
| `POST /api/recorrencias` | **Protegida.** Cria uma recorrência `{descricao, valor, categoria, tipo, diaDoMes}` |
| `PATCH /api/recorrencias/:id` | **Protegida.** Liga ou desliga: `{ativa: true|false}` |
| `DELETE /api/recorrencias/:id` | **Protegida.** Apaga a recorrência de vez |
| `GET /api/recorrencias/previstas` | **Protegida.** As recorrências que ainda não viraram lançamento no mês, com a data prevista. `?mes=2026-08` |
| `POST /api/recorrencias/:id/lancar` | **Protegida.** Transforma a previsão de um mês em lançamento de verdade, vinculado à recorrência. `{mes, valor?}`; 409 se já foi lançada |
| `GET /api/investimentos` | **Protegida.** A carteira: posição por ativo com preço médio e cotação ao vivo, resumo por tipo de ativo e total |
| `GET /api/investimentos/operacoes` | **Protegida.** Histórico de compras e vendas. Filtros: `?mes=2026-08` e `?tipo=VENDA` |
| `POST /api/investimentos` | **Protegida.** Registra uma operação `{ativo, tipo, data, quantidade, valor, classe?}`. Recusa vender mais do que se tem |
| `DELETE /api/investimentos/:id` | **Protegida.** Apaga uma operação do histórico |
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
- **O balanço soma lançamentos MAIS as recorrências ainda não lançadas.**
  Uma conta cadastrada como recorrência já pesa no mês antes de virar
  lançamento — senão um mês recém-começado pareceria vazio tendo aluguel e
  salário garantidos.
- **O vínculo `recorrenciaId` é o que evita contar duas vezes.** Enquanto
  não existe lançamento vinculado no mês, vale a previsão; assim que ele
  existe, a previsão daquele mês para de contar. Por isso lançar uma conta
  prevista não muda o total do mês.
- **A tela de Lançamentos mostra previsões e lançamentos na mesma lista**,
  ordenados por data. As previstas vêm marcadas e trazem o botão de marcar
  como paga, que é o que as converte em lançamento.
- **O banco guarda OPERAÇÕES, não posições.** Cada compra e cada venda é
  uma linha; a posição de um ativo é a soma delas. É o que permite ter
  histórico e calcular preço médio depois de uma venda parcial.
- **Preço médio segue o método brasileiro**: comprar recalcula a média;
  vender tira a quantidade e o custo proporcional, mas NÃO mexe na média —
  vender metade não torna a outra metade mais cara. O lucro da venda vira
  "realizado", separado do lucro "no papel" de quem ainda segura o ativo.
- **No celular, as tabelas viram cartões.** Numa tela de 390px uma tabela
  de sete colunas só cabe rolando de lado, e quem rola perde justamente a
  última coluna, onde ficam os botões. Cada célula carrega o próprio
  rótulo em `data-rotulo`, que o CSS exibe quando não há cabeçalho.
- **Um 401 encerra a sessão e volta ao login.** Sem isso, um token
  expirado deixaria todas as telas mostrando "Erro 401" sem saída óbvia.
- **Nenhuma cotação é gravada.** Preço guardado envelhece em minutos e
  passaria a mentir sobre o patrimônio; ele é buscado a cada abertura da
  tela, com cache de 30 s em memória só para não virar rajada.
- **A fonte de cotação (Yahoo Finance) fica atrás de uma interface** em
  `backend/src/cotacoes.ts`. É uma API não oficial e pode sair do ar:
  trocar de provedor deve ser reescrever um arquivo só.
- **Ativo cotado em outra moeda é convertido para reais** pela taxa do dia
  (`USDBRL=X`). Sem isso, comparar um preço em dólar com um valor pago em
  reais daria um "lucro" que é só a diferença de câmbio.
- **Ativo sem cotação fica fora dos DOIS lados do total.** Somar o valor
  pago sem o valor atual correspondente inventaria um prejuízo do tamanho
  da posição.
- **Mês passado não recebe previsão.** Previsão é sobre o que ainda vai
  acontecer; estimar um mês encerrado esconderia o lançamento esquecido.
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

MVP completo — todas as sete etapas do plano estão feitas:

- **0–1** — repositório, PostgreSQL no Docker, login com hash e JWT
- **2** — tabela `transacoes` e tela de Lançamentos
- **3** — Dashboard: totais do mês e gráfico por categoria
- **4** — recorrências, motor de projeção (com testes) e tela de Projeção
- **5** — lançamentos completos: descrição, situação, forma de pagamento,
  fixo/variável, parcelamento automático e balanço com sobra do mês anterior
- **6** — Investimentos: operações de compra e venda, preço médio, carteira
  com cotação ao vivo, resumo por tipo de ativo e histórico filtrável
- **7** — polimento: identidade visual própria, barra lateral, trilha de
  meses, tabelas que viram cartões no celular e tratamento de sessão expirada

Além do plano: o balanço passou a incluir as recorrências previstas, sem
dupla contagem.

## O que vem depois

- Agente de WhatsApp (fase 2), com plano próprio
- Hospedagem em produção
