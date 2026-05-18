-- 022 — Adiciona archived_at em pallet_inspections
-- Permite marcar pallets como concluídos após finalizar análise de produto acabado
-- sem deletar o registro (QR codes continuam funcionando)
-- Executar no Supabase SQL Editor

alter table public.pallet_inspections
  add column if not exists archived_at timestamptz default null;

create index if not exists idx_pallet_archived
  on public.pallet_inspections (op, archived_at)
  where archived_at is null;
