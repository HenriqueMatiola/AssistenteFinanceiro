# Assistente Financeiro Pessoal — Plano de Implementação

Baseado em: `docs/superpowers/specs/2026-08-18-assistente-financeiro-design.md`

Cada etapa é pequena e testável antes de seguir para a próxima. Nada é
implementado até você aprovar este plano.

## Etapa 0 — Setup do projeto
- Criar repositório com pastas separadas: `backend/` (Node.js) e
  `frontend/` (React)
- Subir um PostgreSQL local (ex: via Docker) só para desenvolvimento
- Backend respondendo uma rota de teste ("hello world")
- Frontend mostrando uma tela em branco conectando no backend
- **Teste de validação**: abrir o frontend no navegador e ver a
  resposta do backend na tela

## Etapa 1 — Usuários e Login
- Criar tabela `usuarios` no banco (nome, login, senha com hash)
- Criar as duas contas (Henrique e pai) manualmente no banco
- Endpoint de login no backend (verifica usuário/senha, retorna um
  token de sessão)
- Tela de Login no frontend
- **Teste de validação**: login funciona com as duas contas e falha
  com senha errada; cada sessão fica amarrada a um usuário

## Etapa 2 — Transações (Lançamentos)
- Criar tabela `transacoes` (usuário, data, valor, categoria, tipo)
- Endpoints: criar transação, listar transações do usuário logado
- Tela de Lançamentos: lista + formulário de adicionar
- **Teste de validação**: usuário A nunca vê transações do usuário B

## Etapa 3 — Dashboard (Home)
- Endpoint que calcula total de entradas, saídas e saldo do mês atual
- Endpoint que agrupa gastos por categoria (para o gráfico)
- Tela de Dashboard com os totais e o gráfico
- **Teste de validação**: os números batem com as transações lançadas
  manualmente na Etapa 2

## Etapa 4 — Recorrências e Projeção
- Criar tabela `recorrencias` (usuário, descrição, valor, categoria,
  dia do mês, tipo)
- Motor de projeção: para um mês futuro, soma recorrências + transações
  futuras já lançadas
- Endpoint de projeção (recebe intervalo de meses, devolve saldo
  projetado por mês)
- Tela de Projeção
- **Teste de validação (unitário)**: cenário com 1 recorrência + 1
  lançamento pontual futuro gera o saldo esperado

## Etapa 5 — Lançamentos completos

Acrescentada em 29/08/2026, depois de comparar o app com a planilha que o
Henrique já usava no Notion. Sem estes campos o app registra menos coisa do
que a planilha que ele veio substituir.

- Campo **descrição** no lançamento ("Netflix", "Cabelo") — antes só havia
  categoria, então não dava para distinguir dois itens do mesmo grupo
- **Situação**: a pagar/pago, a receber/recebido — separa o previsto do
  realizado
- **Forma de pagamento** (Pix, cada cartão) e agrupamento por ela: é o que
  responde "quanto vem na fatura deste cartão?"
- **Fixo ou variável** no gasto
- **Parcelamento**: lançar "12x de R$91,54" cria as 12 transações, uma por
  mês, ligadas por um mesmo grupo — e a Projeção já as enxerga
- Dashboard no formato de balanço: sobra do mês anterior + entradas − saídas
  = disponível
- **Teste de validação (unitário)**: as datas das parcelas respeitam meses
  curtos (31/01 parcelado gera 28/02 e depois 31/03, sem arrastar o dia)

## Etapa 6 — Investimentos
- Criar tabela `investimentos` (usuário, ativo, data de compra,
  quantidade, valor pago)
- Endpoint que busca cotação atual via API externa e calcula
  lucro/prejuízo em tempo real
- Tela de Investimentos
- **Teste de validação**: comprar um ativo, checar se lucro/prejuízo
  bate com a cotação retornada pela API

## Etapa 7 — Polimento do MVP
- Tratamento de erros nas telas (ex: formulário inválido, API de
  cotação fora do ar)
- Revisão visual dos gráficos e responsividade para celular
- **Teste de validação**: usar o app do início ao fim, no celular e no
  computador, sem travar

## Fora deste plano
- Agente de WhatsApp (fase 2) — planejado, mas com plano próprio
  quando chegar a hora
- Hospedagem em produção — decidir e configurar depois do MVP validado
  localmente
