-- ============================================================
-- Migração 007: Controles iniciais de LGPD
-- Executar no Supabase SQL Editor
-- ============================================================

-- Aceite de aviso de privacidade por usuário e versão.
create table if not exists public.privacy_acknowledgements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  notice_version  text not null,
  accepted_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (user_id, notice_version)
);

create index if not exists privacy_ack_user_idx on public.privacy_acknowledgements(user_id);

-- Auditoria de eventos sensíveis de privacidade.
create table if not exists public.privacy_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  action         text not null,
  resource_type  text not null,
  resource_id    text,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index if not exists privacy_audit_user_idx on public.privacy_audit_logs(user_id);
create index if not exists privacy_audit_created_at_idx on public.privacy_audit_logs(created_at desc);
create index if not exists privacy_audit_resource_idx on public.privacy_audit_logs(resource_type, resource_id);

-- Inventário base de tratamento. A aplicação também exibe uma versão fixa em tela.
create table if not exists public.data_processing_inventory (
  id            uuid primary key default gen_random_uuid(),
  title         text not null unique,
  data_fields   text not null,
  purpose       text not null,
  legal_basis   text not null default 'Execução de rotinas internas, legítimo interesse e obrigação legal/contratual',
  retention     text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists data_processing_inventory_updated_at on public.data_processing_inventory;
create trigger data_processing_inventory_updated_at
  before update on public.data_processing_inventory
  for each row execute function update_updated_at_column();

insert into public.data_processing_inventory (title, data_fields, purpose, retention)
values
  ('Usuários e perfis', 'Nome, e-mail corporativo, papel de acesso e status', 'Autenticação, autorização e responsabilização de ações', 'Enquanto houver vínculo operacional ou necessidade de auditoria'),
  ('Inspeções e análises', 'OP, máquina, operador, analista, desvios, amostras, status e observações', 'Rastreabilidade da qualidade, indicadores, aprovações e relatórios', 'Conforme política interna de qualidade e obrigações legais/contratuais'),
  ('Chat e passagem de turno', 'Autor, horário, turno, mensagem e confirmações de leitura', 'Comunicação operacional e evidência de ciência entre turnos', 'Conforme necessidade operacional e auditoria interna'),
  ('Documentos', 'Nome, categoria, origem, descrição, arquivo e usuário responsável', 'Disponibilização controlada de documentos internos', 'Enquanto vigente ou necessário para histórico')
on conflict do nothing;

alter table public.privacy_acknowledgements enable row level security;
alter table public.privacy_audit_logs enable row level security;
alter table public.data_processing_inventory enable row level security;

drop policy if exists "privacy_ack_select_own_or_supervisor" on public.privacy_acknowledgements;
drop policy if exists "privacy_ack_insert_own" on public.privacy_acknowledgements;
drop policy if exists "privacy_audit_insert_authenticated" on public.privacy_audit_logs;
drop policy if exists "privacy_audit_select_supervisor" on public.privacy_audit_logs;
drop policy if exists "data_inventory_select_authenticated" on public.data_processing_inventory;
drop policy if exists "data_inventory_manage_supervisor" on public.data_processing_inventory;

create policy "privacy_ack_select_own_or_supervisor" on public.privacy_acknowledgements
  for select using (
    auth.uid() = user_id or public.current_user_role() = 'supervisor'
  );

create policy "privacy_ack_insert_own" on public.privacy_acknowledgements
  for insert with check (auth.uid() = user_id);

create policy "privacy_audit_insert_authenticated" on public.privacy_audit_logs
  for insert with check (auth.uid() is not null);

create policy "privacy_audit_select_supervisor" on public.privacy_audit_logs
  for select using (public.current_user_role() = 'supervisor');

create policy "data_inventory_select_authenticated" on public.data_processing_inventory
  for select using (auth.uid() is not null);

create policy "data_inventory_manage_supervisor" on public.data_processing_inventory
  for all using (public.current_user_role() = 'supervisor')
  with check (public.current_user_role() = 'supervisor');

-- Garante que documentos internos não fiquem públicos no Storage.
update storage.buckets
set public = false
where id = 'documents';
