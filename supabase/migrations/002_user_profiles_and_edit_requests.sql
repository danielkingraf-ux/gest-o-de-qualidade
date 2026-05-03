-- ============================================================
-- Migração 002: Perfis de usuário, papéis e solicitações de edição
-- Executar no Supabase SQL Editor
-- ============================================================

-- 1. Tabela de perfis (vincula auth.users a papel no sistema)
create table if not exists user_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null unique,
  name          text not null,
  role          text not null default 'analista' check (role in ('analista', 'supervisor')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Atualiza updated_at automaticamente
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function update_updated_at_column();

-- Índice para busca por user_id
create index if not exists user_profiles_user_id_idx on user_profiles(user_id);

-- ============================================================
-- 2. Colunas de rastreabilidade em inspections
-- ============================================================
alter table inspections
  add column if not exists created_by_user_id uuid references auth.users(id),
  add column if not exists edited_at           timestamptz,
  add column if not exists edited_by_user_id   uuid references auth.users(id);

-- ============================================================
-- 3. Tabela de solicitações de edição (após janela de 30 min)
-- ============================================================
create table if not exists edit_requests (
  id               uuid primary key default gen_random_uuid(),
  inspection_id    uuid references inspections(id) on delete cascade not null,
  requested_by     uuid references auth.users(id) not null,
  reason           text not null,
  proposed_changes jsonb not null default '{}',
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists edit_requests_inspection_idx on edit_requests(inspection_id);
create index if not exists edit_requests_status_idx     on edit_requests(status);
create index if not exists edit_requests_requested_by_idx on edit_requests(requested_by);

-- ============================================================
-- 4. RLS (Row Level Security) básico
-- ============================================================
alter table user_profiles  enable row level security;
alter table edit_requests  enable row level security;

-- user_profiles: cada usuário lê o próprio perfil; supervisor lê todos
create policy "Lê próprio perfil" on user_profiles
  for select using (auth.uid() = user_id);

create policy "Supervisor lê todos os perfis" on user_profiles
  for select using (
    exists (
      select 1 from user_profiles up
      where up.user_id = auth.uid() and up.role = 'supervisor'
    )
  );

create policy "Supervisor gerencia perfis" on user_profiles
  for all using (
    exists (
      select 1 from user_profiles up
      where up.user_id = auth.uid() and up.role = 'supervisor'
    )
  );

-- edit_requests: analista vê/cria as próprias; supervisor vê e atualiza todas
create policy "Analista gerencia próprias solicitações" on edit_requests
  for all using (requested_by = auth.uid());

create policy "Supervisor gerencia todas as solicitações" on edit_requests
  for all using (
    exists (
      select 1 from user_profiles up
      where up.user_id = auth.uid() and up.role = 'supervisor'
    )
  );

-- ============================================================
-- 5. Inserir perfil supervisor inicial (ajuste o email)
-- ATENÇÃO: substitua 'supervisor@kingraf.com.br' pelo email real
-- ============================================================
-- insert into user_profiles (user_id, name, role)
-- select id, 'Supervisor', 'supervisor'
-- from auth.users
-- where email = 'supervisor@kingraf.com.br'
-- on conflict (user_id) do nothing;
