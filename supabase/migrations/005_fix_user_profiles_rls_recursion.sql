-- ============================================================
-- Migracao 005: Corrige recursao infinita nas policies de perfil
-- Executar no Supabase SQL Editor
-- ============================================================

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role
  from public.user_profiles
  where user_id = auth.uid()
    and active = true
  limit 1
$$;

drop policy if exists "Lê próprio perfil" on public.user_profiles;
drop policy if exists "Supervisor lê todos os perfis" on public.user_profiles;
drop policy if exists "Supervisor gerencia perfis" on public.user_profiles;
drop policy if exists "user_profiles_select_own_or_supervisor" on public.user_profiles;
drop policy if exists "user_profiles_insert_supervisor" on public.user_profiles;
drop policy if exists "user_profiles_update_supervisor" on public.user_profiles;
drop policy if exists "user_profiles_delete_supervisor" on public.user_profiles;

create policy "user_profiles_select_own_or_supervisor" on public.user_profiles
  for select
  using (
    auth.uid() = user_id
    or public.current_user_role() = 'supervisor'
  );

create policy "user_profiles_insert_supervisor" on public.user_profiles
  for insert
  with check (
    public.current_user_role() = 'supervisor'
  );

create policy "user_profiles_update_supervisor" on public.user_profiles
  for update
  using (
    public.current_user_role() = 'supervisor'
  )
  with check (
    public.current_user_role() = 'supervisor'
  );

create policy "user_profiles_delete_supervisor" on public.user_profiles
  for delete
  using (
    public.current_user_role() = 'supervisor'
  );

drop policy if exists "Supervisor gerencia orders" on public.orders;

create policy "Supervisor gerencia orders" on public.orders
  for all
  using (
    public.current_user_role() = 'supervisor'
  )
  with check (
    public.current_user_role() = 'supervisor'
  );

drop policy if exists "Supervisor gerencia todas as solicitações" on public.edit_requests;

create policy "Supervisor gerencia todas as solicitações" on public.edit_requests
  for all
  using (
    public.current_user_role() = 'supervisor'
  )
  with check (
    public.current_user_role() = 'supervisor'
  );
