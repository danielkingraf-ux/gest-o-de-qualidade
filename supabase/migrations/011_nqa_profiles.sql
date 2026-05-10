-- Perfis NQA para amostragem NBR 5426
create table if not exists public.nqa_profiles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  aql_critical  text not null default '0.065',
  aql_major     text not null default '1.0',
  aql_minor     text not null default '4.0',
  inspection_level text not null default 'II',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- trigger updated_at (a função update_updated_at_column() já existe no banco)
drop trigger if exists nqa_profiles_updated_at on public.nqa_profiles;
create trigger nqa_profiles_updated_at
  before update on public.nqa_profiles
  for each row execute function update_updated_at_column();

-- RLS
alter table public.nqa_profiles enable row level security;
drop policy if exists "nqa_profiles_select_authenticated" on public.nqa_profiles;
drop policy if exists "nqa_profiles_manage_supervisor" on public.nqa_profiles;
create policy "nqa_profiles_select_authenticated" on public.nqa_profiles
  for select using (auth.uid() is not null);
create policy "nqa_profiles_manage_supervisor" on public.nqa_profiles
  for all using (public.current_user_role() = 'supervisor')
  with check (public.current_user_role() = 'supervisor');

-- Perfis padrão
insert into public.nqa_profiles (name, description, aql_critical, aql_major, aql_minor)
values
  ('Padrão Geral',      'Perfil padrão para embalagens gerais',         '0.065', '1.0',  '4.0'),
  ('Farmacêutico',      'Alta exigência para embalagens farmacêuticas', '0.065', '0.65', '2.5'),
  ('Alimentício',       'Embalagens para alimentos',                    '0.065', '1.0',  '2.5'),
  ('Cosméticos',        'Embalagens cosméticas',                        '0.10',  '1.5',  '4.0')
on conflict do nothing;
