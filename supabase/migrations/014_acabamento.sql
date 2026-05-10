-- 014 - Modulo de Acabamento
-- Registros das 3 estacoes: Revisao de Escolhas, Corte e Vinco, Revisao Final

alter table public.user_profiles
drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
add constraint user_profiles_role_check
check (role in ('analista', 'supervisor', 'auxiliar'));

create table if not exists public.acabamento_registros (
  id                 uuid        primary key default gen_random_uuid(),
  op                 text        not null,
  modulo             text        not null
                                   check (modulo in ('escolhas', 'corte_vinco', 'revisao_final')),
  auxiliar_user_id   uuid        not null references auth.users(id) on delete restrict,
  qty_revisadas      int         not null default 0,
  qty_aprovadas      int         not null default 0,
  qty_reprovadas     int         not null default 0,
  defects            jsonb       not null default '{}'::jsonb,
  faca_defects       jsonb,
  unidades_por_folha int,
  notes              text,
  timestamp          timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index if not exists idx_acabamento_op      on public.acabamento_registros (op);
create index if not exists idx_acabamento_modulo  on public.acabamento_registros (modulo);
create index if not exists idx_acabamento_user    on public.acabamento_registros (auxiliar_user_id);
create index if not exists idx_acabamento_ts      on public.acabamento_registros (timestamp desc);

alter table public.acabamento_registros enable row level security;

drop policy if exists "acabamento_select" on public.acabamento_registros;
drop policy if exists "acabamento_insert" on public.acabamento_registros;
drop policy if exists "acabamento_update" on public.acabamento_registros;
drop policy if exists "acabamento_delete" on public.acabamento_registros;

create policy "acabamento_select"
  on public.acabamento_registros for select
  to authenticated
  using (true);

create policy "acabamento_insert"
  on public.acabamento_registros for insert
  to authenticated
  with check (auxiliar_user_id = auth.uid());

create policy "acabamento_update"
  on public.acabamento_registros for update
  to authenticated
  using (
    auxiliar_user_id = auth.uid()
    and created_at > now() - interval '30 minutes'
  )
  with check (
    auxiliar_user_id = auth.uid()
    and created_at > now() - interval '30 minutes'
  );

create policy "acabamento_delete"
  on public.acabamento_registros for delete
  to authenticated
  using (public.current_user_role() = 'supervisor');
