-- 027 - Limpeza pontual: remove a inspecao duplicada da OP 19714 (rodada 1)
--
-- Contexto: a OP 19714 tem duas linhas IDENTICAS de 'producao_inicial' rodada 1
-- (duplo-save com 36s de diferenca), ambas REJECTED, aprovadas 37.816 / rodadas 45.000.
-- A migration 026 ja blinda o CALCULO (deduplica por rodada), mas a linha duplicada
-- continua no banco inflando qualquer agregacao que nao deduplique. Aqui removemos
-- a copia mais recente, mantendo a original (7b5b36b0..., criada as 03:18:07).
--
-- SEGURANCA: execute o SELECT primeiro e confira que retorna EXATAMENTE 1 linha
-- (a duplicata 7097218a...) antes de rodar o DELETE.
--
-- Executar no Supabase SQL Editor.

-- 1) Confira o que sera apagado (deve retornar 1 linha):
-- select id, created_at, status,
--        observations::jsonb->>'numero_rodada' as rodada,
--        observations::jsonb #>> '{saldo_unidades,aprovadas}' as aprovadas
-- from public.inspections
-- where id = '7097218a-8be7-4e11-940f-b388106d897f';

-- 2) Remova a duplicata:
delete from public.inspections
where id = '7097218a-8be7-4e11-940f-b388106d897f';

-- 3) Verifique que sobrou so 1 inspecao de rodada 1 para a OP:
-- select count(*) as linhas_rodada_1
-- from public.inspections
-- where upper(btrim(op)) = '19714'
--   and btrim(observations) like '{%'
--   and observations::jsonb->>'process_area' = 'producao_inicial'
--   and coalesce(observations::jsonb->>'numero_rodada','1') = '1';
-- Esperado: 1
