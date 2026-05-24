-- ============================================================
-- Migracao 024: Fotos de defeito associadas a inspecoes
-- Executar no Supabase SQL Editor
-- ============================================================

-- Tabela de metadados das fotos
create table if not exists public.defect_photos (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  file_path     text not null,
  file_name     text not null,
  file_size     int,
  defect_type   text,
  caption       text,
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists defect_photos_inspection_idx on public.defect_photos(inspection_id);
create index if not exists defect_photos_created_at_idx on public.defect_photos(created_at desc);

-- RLS
alter table public.defect_photos enable row level security;

drop policy if exists "Autenticado le defect_photos" on public.defect_photos;
drop policy if exists "Autenticado cria defect_photos" on public.defect_photos;
drop policy if exists "Autenticado exclui defect_photos" on public.defect_photos;

create policy "Autenticado le defect_photos" on public.defect_photos
  for select using (auth.uid() is not null);

create policy "Autenticado cria defect_photos" on public.defect_photos
  for insert with check (auth.uid() is not null);

create policy "Autenticado exclui defect_photos" on public.defect_photos
  for delete using (auth.uid() is not null);

-- Bucket privado para fotos de defeito
insert into storage.buckets (id, name, public)
values ('defect-photos', 'defect-photos', false)
on conflict (id) do update set public = false;

-- Politicas de storage
drop policy if exists "Autenticado le arquivos defect-photos" on storage.objects;
drop policy if exists "Autenticado envia arquivos defect-photos" on storage.objects;
drop policy if exists "Autenticado exclui arquivos defect-photos" on storage.objects;

create policy "Autenticado le arquivos defect-photos" on storage.objects
  for select using (
    bucket_id = 'defect-photos' and auth.uid() is not null
  );

create policy "Autenticado envia arquivos defect-photos" on storage.objects
  for insert with check (
    bucket_id = 'defect-photos' and auth.uid() is not null
  );

create policy "Autenticado exclui arquivos defect-photos" on storage.objects
  for delete using (
    bucket_id = 'defect-photos' and auth.uid() is not null
  );
