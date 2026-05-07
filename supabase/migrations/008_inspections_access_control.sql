-- ============================================================
-- Migração 008: Regras de acesso para registros de inspeção
-- Executar no Supabase SQL Editor
-- ============================================================

-- Garante autoria quando a aplicação inserir sem created_by_user_id.
create or replace function public.set_inspection_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_user_id is null then
    new.created_by_user_id = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_set_created_by on public.inspections;
create trigger inspections_set_created_by
  before insert on public.inspections
  for each row execute function public.set_inspection_created_by();

alter table public.inspections enable row level security;

drop policy if exists "inspections_select_authenticated" on public.inspections;
drop policy if exists "inspections_insert_authenticated" on public.inspections;
drop policy if exists "inspections_update_supervisor_or_owner_30min" on public.inspections;
drop policy if exists "inspections_delete_supervisor" on public.inspections;

-- Todos os usuários autenticados podem consultar registros.
create policy "inspections_select_authenticated" on public.inspections
  for select using (auth.uid() is not null);

-- Todos os usuários autenticados podem criar registros operacionais.
create policy "inspections_insert_authenticated" on public.inspections
  for insert with check (auth.uid() is not null);

-- Supervisão edita qualquer registro.
-- Analista edita apenas o próprio registro até 30 minutos após a criação.
create policy "inspections_update_supervisor_or_owner_30min" on public.inspections
  for update
  using (
    public.current_user_role() = 'supervisor'
    or (
      created_by_user_id = auth.uid()
      and created_at >= now() - interval '30 minutes'
    )
  )
  with check (
    public.current_user_role() = 'supervisor'
    or (
      created_by_user_id = auth.uid()
      and created_at >= now() - interval '30 minutes'
    )
  );

-- Exclusão somente pela supervisão.
create policy "inspections_delete_supervisor" on public.inspections
  for delete using (public.current_user_role() = 'supervisor');
