-- ============================================================
-- Migracao 025: Generalizar defect_photos para multiplas tabelas
-- Substitui inspection_id (FK fixa) por record_id + record_table
-- Suporta: inspections, acabamento_registros, pallet_inspections
-- Executar no Supabase SQL Editor APOS a migracao 024
-- ============================================================

-- 1. Adicionar colunas genericas
alter table public.defect_photos
  add column if not exists record_id    uuid,
  add column if not exists record_table text;

-- 2. Migrar dados existentes
update public.defect_photos
  set record_id    = inspection_id,
      record_table = 'inspections'
  where inspection_id is not null
    and record_id is null;

-- 3. Tornar colunas genericas obrigatorias
alter table public.defect_photos
  alter column record_id    set not null,
  alter column record_table set not null;

-- 4. Remover FK e coluna antiga
alter table public.defect_photos
  drop constraint if exists defect_photos_inspection_id_fkey;

alter table public.defect_photos
  drop column if exists inspection_id;

-- 5. Indices para busca por registro
drop index if exists defect_photos_inspection_idx;
create index if not exists defect_photos_record_idx
  on public.defect_photos(record_table, record_id);

-- 6. Constraint check para tabelas validas
alter table public.defect_photos
  add constraint defect_photos_record_table_check
    check (record_table in ('inspections', 'acabamento_registros', 'pallet_inspections'));
