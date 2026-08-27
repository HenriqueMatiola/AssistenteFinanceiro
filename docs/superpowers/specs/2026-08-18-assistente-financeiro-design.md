# Assistente Financeiro Pessoal — Design (MVP)

## Visão geral

Web app pessoal para organizar finanças (gastos, ganhos, investimentos),
com visão do mês atual, projeção dos próximos meses, e uma aba dedicada
a investimentos com cotação atualizada automaticamente.

Uso inicial: 2 usuários (Henrique e seu pai), cada um com login próprio
e dados isolados entre si. Acesso via navegador, tanto por computador
quanto por celular.

Objetivo duplo: (1) ferramenta real de uso pessoal, (2) projeto de
aprendizado de desenvolvimento full-stack.

Fora de escopo nesta fase: agente de WhatsApp que alimenta o banco de
dados via mensagem (fase 2, planejada mas não desenhada aqui).

## Stack

- **Frontend**: React
- **Backend**: Node.js (framework leve, ex. Express)
- **Banco de dados**: PostgreSQL
- **Hospedagem**: a definir na fase de implementação (nuvem, baixo custo/gratuita para este porte)

As três camadas se comunicam via HTTP/API, o que já deixa o sistema
pronto para receber, no futuro, o agente de WhatsApp como "mais um
cliente" batendo na mesma API/backend.

## Telas / Funcionalidades (MVP)

1. **Login** — autenticação simples por usuário/senha. Cada usuário só
   enxerga seus próprios dados.
2. **Dashboard (Home)** — resumo do mês atual: total de entradas, total
   de saídas, saldo, gráfico de gastos por categoria.
3. **Lançamentos** — lista de transações (gasto ou ganho) com filtro, e
   formulário para adicionar nova transação (data, valor, categoria,
   tipo).
4. **Projeção** — visão dos próximos meses, somando:
   - contas recorrentes automáticas (ex: aluguel, assinaturas)
   - itens pontuais futuros lançados manualmente (ex: parcela de compra)
5. **Investimentos** — lista de ativos comprados (data de compra, valor
   pago, cotação atual, lucro/prejuízo calculado), com cotação buscada
   ao vivo via API externa a cada acesso (não fica armazenada como
   valor fixo).

## Modelo de dados

- **Usuários** — id, nome, login, senha (hash)
- **Transações** — id, usuário, data, valor, categoria, tipo (gasto/ganho)
- **Recorrências** — id, usuário, descrição, valor, categoria, dia do
  mês, tipo (gasto/ganho) — usada pelo motor de Projeção
- **Investimentos** — id, usuário, ativo (ticker/nome), data de compra,
  quantidade, valor pago — cotação atual é buscada em tempo real, não
  persistida

Relações: todas as tabelas de dado (Transações, Recorrências,
Investimentos) referenciam um Usuário, garantindo isolamento entre
Henrique e seu pai.

## Motor de projeção

Para cada mês futuro solicitado, a projeção soma:
1. Todas as Recorrências ativas do usuário, aplicadas naquele mês
2. Todas as Transações futuras já lançadas manualmente com data naquele mês

O resultado é o saldo projetado (entradas − saídas) por mês.

## Cotação de investimentos

Ao abrir a aba de Investimentos, o backend busca a cotação atual de
cada ativo em uma API externa (ex: para ações e criptomoedas) e
calcula lucro/prejuízo comparando com o valor pago no momento da
compra. Nenhuma cotação é armazenada permanentemente — sempre exibida
"ao vivo".

## Testes

- Backend: testes de unidade para o motor de projeção (recorrência +
  pontual) e para o cálculo de lucro/prejuízo de investimentos
- Isolamento entre usuários: teste garantindo que um usuário nunca
  acessa dados de outro

## Fora de escopo (planejado para depois)

- Agente de WhatsApp que recebe mensagens de gasto/ganho e alimenta o
  banco de dados automaticamente
