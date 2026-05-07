-- ============================================================
-- Migração 006: Repositório de documentos para visualização
-- Executar no Supabase SQL Editor
-- ============================================================

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text not null default 'Outro',
  size         text,
  url          text not null,
  file_path    text,
  origin       text,
  description  text,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.documents
  add column if not exists file_path text,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
  before update on public.documents
  for each row execute function update_updated_at_column();

create index if not exists documents_type_idx on public.documents(type);
create index if not exists documents_created_at_idx on public.documents(created_at desc);

alter table public.documents enable row level security;

drop policy if exists "Autenticado lê documents" on public.documents;
drop policy if exists "Autenticado cria documents" on public.documents;
drop policy if exists "Autenticado atualiza documents" on public.documents;
drop policy if exists "Autenticado exclui documents" on public.documents;

create policy "Autenticado lê documents" on public.documents
  for select using (auth.uid() is not null);

create policy "Autenticado cria documents" on public.documents
  for insert with check (auth.uid() is not null);

create policy "Autenticado atualiza documents" on public.documents
  for update using (auth.uid() is not null);

create policy "Autenticado exclui documents" on public.documents
  for delete using (auth.uid() is not null);

-- Bucket privado. A aplicação gera URLs assinadas temporárias para visualização.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

drop policy if exists "Autenticado lê arquivos documents" on storage.objects;
drop policy if exists "Autenticado envia arquivos documents" on storage.objects;
drop policy if exists "Autenticado atualiza arquivos documents" on storage.objects;
drop policy if exists "Autenticado exclui arquivos documents" on storage.objects;

create policy "Autenticado lê arquivos documents" on storage.objects
  for select using (
    bucket_id = 'documents' and auth.uid() is not null
  );

create policy "Autenticado envia arquivos documents" on storage.objects
  for insert with check (
    bucket_id = 'documents' and auth.uid() is not null
  );

create policy "Autenticado atualiza arquivos documents" on storage.objects
  for update using (
    bucket_id = 'documents' and auth.uid() is not null
  );

create policy "Autenticado exclui arquivos documents" on storage.objects
  for delete using (
    bucket_id = 'documents' and auth.uid() is not null
  );
