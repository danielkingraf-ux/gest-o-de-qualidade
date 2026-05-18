-- 021 — Adiciona 'colagem' como módulo válido em acabamento_registros
-- Executar no Supabase SQL Editor

alter table public.acabamento_registros
  drop constraint if exists acabamento_registros_modulo_check;

alter table public.acabamento_registros
  add constraint acabamento_registros_modulo_check
  check (modulo in ('escolhas', 'corte_vinco', 'revisao_final', 'colagem'));
