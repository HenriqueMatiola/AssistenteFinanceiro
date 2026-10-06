-- As opções que cada pessoa já usou nos campos de texto livre.
--
-- O app deixa de trazer lista pronta de categoria e de forma de pagamento: as
-- de cada um são outras, e uma lista de fábrica só enche o campo de opções que
-- ninguém escolheu. A lista nasce vazia e cresce conforme a pessoa lança.
--
-- Apagar uma sugestão não mexe nos lançamentos que a usaram — o gasto em
-- "Mercado" continua em "Mercado". Por isso esta tabela não se liga a
-- `transacoes`: ela é só a memória do campo de digitar.

-- CreateEnum
CREATE TYPE "CampoComSugestao" AS ENUM ('CATEGORIA', 'FORMA_DE_PAGAMENTO', 'PESSOA');

-- CreateTable
CREATE TABLE "sugestoes" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "campo" "CampoComSugestao" NOT NULL,
    "valor" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugestoes_pkey" PRIMARY KEY ("id")
);

-- Rede de segurança contra a mesma opção entrar duas vezes. A comparação que
-- de fato vale ignora maiúsculas e acontece no código, senão "Mercado" e
-- "mercado" virariam duas linhas na lista.
CREATE UNIQUE INDEX "sugestoes_usuario_id_campo_valor_key"
  ON "sugestoes"("usuario_id", "campo", "valor");

ALTER TABLE "sugestoes" ADD CONSTRAINT "sugestoes_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Semeia com o que cada pessoa JÁ usou, para a lista não nascer vazia em quem
-- já vinha usando o app. Vem dos próprios lançamentos, recorrências e acertos.
INSERT INTO "sugestoes" ("usuario_id", "campo", "valor")
SELECT DISTINCT ON (usuario_id, lower(valor)) usuario_id, 'CATEGORIA'::"CampoComSugestao", valor
FROM (
  SELECT usuario_id, categoria AS valor FROM "transacoes" WHERE eh_sobra_do_mes_anterior = false
  UNION ALL
  SELECT usuario_id, categoria FROM "recorrencias"
) AS t
WHERE valor IS NOT NULL AND btrim(valor) <> '';

INSERT INTO "sugestoes" ("usuario_id", "campo", "valor")
SELECT DISTINCT ON (usuario_id, lower(valor)) usuario_id, 'FORMA_DE_PAGAMENTO'::"CampoComSugestao", valor
FROM (
  SELECT usuario_id, forma_de_pagamento AS valor FROM "transacoes"
  UNION ALL
  SELECT usuario_id, forma_de_pagamento FROM "recorrencias"
) AS t
WHERE valor IS NOT NULL AND btrim(valor) <> '';

INSERT INTO "sugestoes" ("usuario_id", "campo", "valor")
SELECT DISTINCT ON (usuario_id, lower(pessoa)) usuario_id, 'PESSOA'::"CampoComSugestao", pessoa
FROM "acertos"
WHERE pessoa IS NOT NULL AND btrim(pessoa) <> '';
