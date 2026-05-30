-- =====================================================================
-- RESET DA APLICAÇÃO — Kingraf Gestão de Qualidade
-- =====================================================================
-- Use no Supabase → SQL Editor.
-- Limpa os dados para começar os testes do zero.
--
-- ⚠️  AÇÃO IRREVERSÍVEL. Faça um backup antes se tiver dados importantes
--     (Supabase → Database → Backups, ou exporte as tabelas).
--
-- Estrutura:
--   PARTE 1 — Dados operacionais (REGISTROS + OPs)   → executa por padrão
--   PARTE 2 — Logs e auditoria                        → opcional (descomente)
--   PARTE 3 — Cadastros que alimentam os FILTROS      → opcional (descomente)
--   PARTE 4 — Conferência (contagem final)            → executa por padrão
--
-- O que NUNCA é apagado aqui: logins/perfis (user_profiles, auth.users)
-- e o repositório de documentos (documents).
-- =====================================================================


-- =====================================================================
-- PARTE 1 — DADOS OPERACIONAIS (limpa todos os registros + as OPs)
-- Isso zera: inspeções, acabamento, pallets, revisão, reimpressões,
-- solicitações de edição, fotos de defeito, chat de turno e as Ordens
-- de Produção (esvazia o filtro de OP em toda a aplicação).
-- A ordem respeita as dependências (filhos antes dos pais).
-- =====================================================================
BEGIN;

-- Filhos / dependentes primeiro
DELETE FROM public.defect_photos;
DELETE FROM public.op_reimpressoes;
DELETE FROM public.edit_requests;
DELETE FROM public.pallet_inspections;
DELETE FROM public.escolha_revisao_registros;
DELETE FROM public.acabamento_registros;
DELETE FROM public.inspections;

-- Chat de turno (mensagens e marcações de leitura)
DELETE FROM public.shift_log_reads;
DELETE FROM public.shift_logs;

-- Ordens de Produção por último (esvazia o filtro de OP)
DELETE FROM public.orders;

COMMIT;


-- =====================================================================
-- PARTE 2 — LOGS E AUDITORIA  (OPCIONAL)
-- Descomente o bloco abaixo se quiser zerar também os registros de
-- auditoria e consentimento de LGPD.
-- =====================================================================
-- BEGIN;
--   DELETE FROM public.privacy_audit_logs;
--   DELETE FROM public.permission_audit_logs;
--   DELETE FROM public.critical_action_requests;
--   DELETE FROM public.privacy_acknowledgements;   -- força aceite de LGPD de novo no próximo login
-- COMMIT;


-- =====================================================================
-- PARTE 3 — CADASTROS QUE ALIMENTAM OS FILTROS  (OPCIONAL)
-- ⚠️  Descomente SÓ se quiser realmente zerar os filtros de
-- Operador / Máquina / Analista / Perfis NQA / Tipos de defeito.
-- Depois disso será preciso recadastrar tudo no Admin antes de operar.
-- (NÃO mexe em logins nem em perfis de usuário.)
-- =====================================================================
-- BEGIN;
--   DELETE FROM public.analysts;
--   DELETE FROM public.operators;
--   DELETE FROM public.machines;
--   DELETE FROM public.nqa_profiles;
--   DELETE FROM public.defect_types;
-- COMMIT;


-- =====================================================================
-- PARTE 4 — CONFERÊNCIA (deve voltar tudo zerado nas operacionais)
-- =====================================================================
SELECT 'orders'                   AS tabela, COUNT(*) AS registros FROM public.orders
UNION ALL SELECT 'inspections',              COUNT(*) FROM public.inspections
UNION ALL SELECT 'acabamento_registros',     COUNT(*) FROM public.acabamento_registros
UNION ALL SELECT 'pallet_inspections',       COUNT(*) FROM public.pallet_inspections
UNION ALL SELECT 'escolha_revisao_registros',COUNT(*) FROM public.escolha_revisao_registros
UNION ALL SELECT 'op_reimpressoes',          COUNT(*) FROM public.op_reimpressoes
UNION ALL SELECT 'edit_requests',            COUNT(*) FROM public.edit_requests
UNION ALL SELECT 'defect_photos',            COUNT(*) FROM public.defect_photos
UNION ALL SELECT 'shift_logs',               COUNT(*) FROM public.shift_logs
UNION ALL SELECT 'shift_log_reads',          COUNT(*) FROM public.shift_log_reads
-- cadastros (continuam preenchidos a menos que você rode a PARTE 3)
UNION ALL SELECT 'operators  (cadastro)',    COUNT(*) FROM public.operators
UNION ALL SELECT 'machines   (cadastro)',    COUNT(*) FROM public.machines
UNION ALL SELECT 'analysts   (cadastro)',    COUNT(*) FROM public.analysts
ORDER BY tabela;
