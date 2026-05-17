-- 020 — Adiciona operador(es) e máquina nos registros de acabamento
-- Executar no Supabase SQL Editor

alter table public.acabamento_registros
  add column if not exists operator_ids  uuid[]  default null,
  add column if not exists machine_id    uuid    references public.machines(id) on delete set null default null;

create index if not exists idx_acabamento_machine
  on public.acabamento_registros (machine_id)
  where machine_id is not null;
