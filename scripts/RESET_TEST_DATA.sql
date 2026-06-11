-- ============================================================================
-- RESET_TEST_DATA.sql  —  Zera os dados transacionais para testar o fluxo do zero
-- ============================================================================
-- NÃO é uma migration. Não fica em supabase/migrations/ de propósito: é um script
-- manual e DESTRUTIVO. Rode no SQL Editor (role postgres) com consciência.
--
-- APAGA (dados de produção/teste do dia a dia):
--   inspections, acabamento_registros, escolha_revisao_registros,
--   pallet_inspections, op_reimpressoes, defect_photos, edit_requests,
--   ocorrencias_op (+ comentários), shift_logs (+ leituras)
--
-- PRESERVA (cadastro/configuração — você NÃO quer recriar isso):
--   user_profiles (LOGINS), machines, operators, analysts,
--   nqa_profiles, client_nqa_profiles, documents, data_processing_inventory,
--   orders  ← catálogo de OPs (apagar é OPCIONAL, bloco no final)
--
-- Recomendado: rode o passo 0 (contagem) ANTES e DEPOIS pra conferir.
-- ============================================================================

-- 0) Fotografia de antes (rode sozinho primeiro):
-- select 'inspections' t, count(*) from inspections
-- union all select 'acabamento_registros', count(*) from acabamento_registros
-- union all select 'escolha_revisao_registros', count(*) from escolha_revisao_registros
-- union all select 'pallet_inspections', count(*) from pallet_inspections
-- union all select 'op_reimpressoes', count(*) from op_reimpressoes
-- union all select 'ocorrencias_op', count(*) from ocorrencias_op
-- union all select 'shift_logs', count(*) from shift_logs;

-- 1) Limpeza transacional. TRUNCATE de tudo numa tacada só resolve as FKs
--    mútuas; RESTART IDENTITY zera sequences; CASCADE cobre filhos esquecidos.
truncate table
  public.acabamento_registros,
  public.escolha_revisao_registros,
  public.defect_photos,
  public.pallet_inspections,
  public.op_reimpressoes,
  public.edit_requests,
  public.ocorrencias_op_comentarios,
  public.ocorrencias_op,
  public.shift_log_reads,
  public.shift_logs,
  public.inspections,
  public.orders            -- catálogo de OPs: limpa os números antigos dos FILTROS de OP
restart identity cascade;

-- 2) Confere que zerou:
select 'inspections' t, count(*) from inspections
union all select 'orders', count(*) from orders
union all select 'acabamento_registros', count(*) from acabamento_registros
union all select 'escolha_revisao_registros', count(*) from escolha_revisao_registros
union all select 'pallet_inspections', count(*) from pallet_inspections
union all select 'op_reimpressoes', count(*) from op_reimpressoes
union all select 'ocorrencias_op', count(*) from ocorrencias_op
union all select 'shift_logs', count(*) from shift_logs;

-- Obs.: depois de rodar, RECARREGUE o app (F5). As telas leem as OPs no carregamento;
-- com a página já aberta, o filtro só atualiza após o reload.

-- ============================================================================
-- ALTERNATIVA — limpar SÓ as OPs (sem apagar o resto)
-- Use se você quer apenas tirar os números antigos dos filtros de OP, mantendo
-- as inspeções/registros. (Em geral você vai querer o reset completo acima.)
-- ============================================================================
-- truncate table public.orders restart identity cascade;
