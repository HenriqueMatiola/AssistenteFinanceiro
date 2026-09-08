-- Libera as contas que já existiam quando o app passou a EXIGIR o e-mail
-- confirmado para funcionar.
--
-- Sem isto, ligar a exigência jogaria na tela de confirmação todo mundo que já
-- usa o app — gente que não fez nada de errado e que, do nada, perderia o
-- acesso aos próprios lançamentos. A regra passa a valer daqui para frente:
-- quem chegar a partir de agora confirma; quem já estava dentro, segue.
--
-- Nenhuma coluna muda: esta migration é só dados. Ela existe como migration, e
-- não como um UPDATE rodado à mão, porque o mesmo remendo precisa acontecer em
-- toda cópia do banco (a sua, a de produção) exatamente uma vez.
--
-- Só marca quem TEM e-mail. Numa conta sem endereço nenhum — as criadas antes
-- de o cadastro pedir um — não há o que dar por confirmado: dizer que o e-mail
-- dela está verificado seria gravar uma mentira no banco. Essas vão cadastrar
-- um endereço no Perfil e confirmá-lo, que é o único caminho honesto.
--
-- A data gravada é a de AGORA, e não a de criação da conta. Ela não diz "foi
-- quando a pessoa provou" — nenhuma delas provou nada. Diz "foi quando o
-- sistema passou a tratar como confirmado", que é o fato que de fato ocorreu.

UPDATE "usuarios"
SET "email_verificado_em" = NOW()
WHERE "email" IS NOT NULL
  AND "email_verificado_em" IS NULL;
