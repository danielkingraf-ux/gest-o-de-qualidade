-- 015 — Perfis de acesso, auditoria e aprovações críticas
-- Execute no Supabase SQL Editor.

-- Amplia o domínio de perfis mantendo compatibilidade com registros antigos.
alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check
  check (
    role in (
      'administrador',
      'direcao',
      'supervisao',
      'analista_qualidade',
      'revisao_escolha',
      'expedicao',
      'consulta_auditoria',
      'analista',
      'supervisor',
      'auxiliar'
    )
  );

alter table public.user_profiles
  add column if not exists can_approve_critical_actions boolean not null default false;

create or replace function public.current_user_can_approve_critical_actions()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select can_approve_critical_actions
    from public.user_profiles
    where user_id = auth.uid()
      and active = true
    limit 1
  ), false)
$$;

-- Reaplica políticas que antes reconheciam apenas o papel legado "supervisor".
drop policy if exists "user_profiles_select_own_or_supervisor" on public.user_profiles;
create policy "user_profiles_select_own_or_supervisor" on public.user_profiles
  for select
  using (
    auth.uid() = user_id
    or public.current_user_role() = 'administrador'
  );

drop policy if exists "user_profiles_insert_supervisor" on public.user_profiles;
create policy "user_profiles_insert_supervisor" on public.user_profiles
  for insert
  with check (public.current_user_role() = 'administrador');

drop policy if exists "user_profiles_update_supervisor" on public.user_profiles;
create policy "user_profiles_update_supervisor" on public.user_profiles
  for update
  using (public.current_user_role() = 'administrador')
  with check (public.current_user_role() = 'administrador');

drop policy if exists "user_profiles_delete_supervisor" on public.user_profiles;
create policy "user_profiles_delete_supervisor" on public.user_profiles
  for delete
  using (public.current_user_role() = 'administrador');

drop policy if exists "Supervisor gerencia orders" on public.orders;
create policy "Supervisor gerencia orders" on public.orders
  for all
  using (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  )
  with check (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  );

drop policy if exists "Supervisor gerencia todas as solicitações" on public.edit_requests;
drop policy if exists "Supervisor gerencia todas as solicitaÃ§Ãµes" on public.edit_requests;
create policy "Supervisor gerencia todas as solicitações" on public.edit_requests
  for all
  using (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  )
  with check (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  );

drop policy if exists "inspections_update_supervisor_or_owner_30min" on public.inspections;
create policy "inspections_update_supervisor_or_owner_30min" on public.inspections
  for update
  using (
    public.current_user_role() = 'administrador'
    or (
      created_by_user_id = auth.uid()
      and created_at >= now() - interval '30 minutes'
    )
  )
  with check (
    public.current_user_role() = 'administrador'
    or (
      created_by_user_id = auth.uid()
      and created_at >= now() - interval '30 minutes'
    )
  );

drop policy if exists "inspections_delete_supervisor" on public.inspections;

drop policy if exists "analysts_insert_supervisor" on public.analysts;
create policy "analysts_insert_supervisor" on public.analysts
  for insert
  with check (public.current_user_role() = 'administrador');

drop policy if exists "analysts_update_supervisor" on public.analysts;
create policy "analysts_update_supervisor" on public.analysts
  for update
  using (public.current_user_role() = 'administrador')
  with check (public.current_user_role() = 'administrador');

drop policy if exists "analysts_delete_supervisor" on public.analysts;
create policy "analysts_delete_supervisor" on public.analysts
  for delete
  using (public.current_user_role() = 'administrador');

drop policy if exists "nqa_profiles_manage_supervisor" on public.nqa_profiles;
create policy "nqa_profiles_manage_supervisor" on public.nqa_profiles
  for all
  using (public.current_user_role() = 'administrador')
  with check (public.current_user_role() = 'administrador');

drop policy if exists "Supervisors can update pallet_inspections" on public.pallet_inspections;
create policy "Supervisors can update pallet_inspections"
  on public.pallet_inspections for update
  to authenticated
  using (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  )
  with check (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  );

drop policy if exists "Supervisors can delete pallet_inspections" on public.pallet_inspections;

drop policy if exists "acabamento_delete" on public.acabamento_registros;

drop policy if exists "Supervisor gerencia op_reimpressoes" on public.op_reimpressoes;
drop policy if exists "Supervisao visualiza op_reimpressoes" on public.op_reimpressoes;
create policy "Supervisao visualiza op_reimpressoes"
  on public.op_reimpressoes for select
  to authenticated
  using (
    auth.uid() is not null
    and public.current_user_role() in ('administrador', 'supervisor', 'supervisao', 'analista_qualidade', 'analista')
  );

drop policy if exists "Aprovador atualiza op_reimpressoes" on public.op_reimpressoes;
create policy "Aprovador atualiza op_reimpressoes"
  on public.op_reimpressoes for update
  to authenticated
  using (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  )
  with check (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  );

drop policy if exists "privacy_ack_select_own_or_supervisor" on public.privacy_acknowledgements;
create policy "privacy_ack_select_own_or_supervisor" on public.privacy_acknowledgements
  for select
  using (
    auth.uid() = user_id
    or public.current_user_role() = 'administrador'
  );

drop policy if exists "privacy_audit_select_supervisor" on public.privacy_audit_logs;
create policy "privacy_audit_select_supervisor" on public.privacy_audit_logs
  for select
  using (public.current_user_role() in ('administrador', 'consulta_auditoria'));

drop policy if exists "data_inventory_manage_supervisor" on public.data_processing_inventory;
create policy "data_inventory_manage_supervisor" on public.data_processing_inventory
  for all
  using (public.current_user_role() = 'administrador')
  with check (public.current_user_role() = 'administrador');

create table if not exists public.permission_audit_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  user_email    text,
  screen        text not null,
  action        text not null,
  record_table  text,
  record_id     text,
  field_name    text,
  old_value     jsonb,
  new_value     jsonb,
  justification text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_permission_audit_user on public.permission_audit_logs(user_id);
create index if not exists idx_permission_audit_record on public.permission_audit_logs(record_table, record_id);
create index if not exists idx_permission_audit_created on public.permission_audit_logs(created_at desc);

create table if not exists public.critical_action_requests (
  id             uuid primary key default gen_random_uuid(),
  action_key     text not null check (
    action_key in (
      'reject_full_op',
      'release_restricted_op',
      'release_rejected_pallet',
      'scrap_large_quantity',
      'change_final_report',
      'close_op_with_divergence',
      'cancel_occurrence'
    )
  ),
  screen         text not null,
  record_table   text,
  record_id      text,
  requested_by   uuid references auth.users(id) on delete set null,
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  justification  text not null,
  payload        jsonb not null default '{}'::jsonb,
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_critical_action_status on public.critical_action_requests(status);
create index if not exists idx_critical_action_requested_by on public.critical_action_requests(requested_by);
create index if not exists idx_critical_action_record on public.critical_action_requests(record_table, record_id);
create index if not exists idx_critical_action_created on public.critical_action_requests(created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_critical_action_requests_updated_at on public.critical_action_requests;
create trigger trg_critical_action_requests_updated_at
before update on public.critical_action_requests
for each row execute function public.touch_updated_at();

alter table public.permission_audit_logs enable row level security;
alter table public.critical_action_requests enable row level security;

drop policy if exists "permission_audit_select" on public.permission_audit_logs;
create policy "permission_audit_select"
  on public.permission_audit_logs for select
  to authenticated
  using (
    public.current_user_role() in ('administrador', 'supervisor', 'supervisao', 'consulta_auditoria')
    or user_id = auth.uid()
  );

drop policy if exists "permission_audit_insert" on public.permission_audit_logs;
create policy "permission_audit_insert"
  on public.permission_audit_logs for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);

drop policy if exists "critical_action_select" on public.critical_action_requests;
create policy "critical_action_select"
  on public.critical_action_requests for select
  to authenticated
  using (
    public.current_user_role() in ('administrador', 'supervisor', 'supervisao', 'consulta_auditoria')
    or requested_by = auth.uid()
  );

drop policy if exists "critical_action_insert" on public.critical_action_requests;
create policy "critical_action_insert"
  on public.critical_action_requests for insert
  to authenticated
  with check (requested_by = auth.uid() or requested_by is null);

drop policy if exists "critical_action_update_review" on public.critical_action_requests;
create policy "critical_action_update_review"
  on public.critical_action_requests for update
  to authenticated
  using (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  )
  with check (
    public.current_user_role() = 'administrador'
    or public.current_user_can_approve_critical_actions()
  );

-- Não há policy de delete: solicitações críticas e logs são preservados.
