-- ============================================================
-- Migracao 019: Views de integridade para rastreabilidade de OP
-- Executar no Supabase SQL Editor
-- ============================================================

create or replace function public.is_valid_jsonb(input_text text)
returns boolean
language plpgsql
immutable
as $$
begin
  if input_text is null then
    return true;
  end if;

  perform input_text::jsonb;
  return true;
exception when others then
  return false;
end;
$$;

-- Registros de inspecao somente quando:
-- - inspections.order_id aponta para orders.id
-- - inspections.op esta sincronizada com orders.op
-- - observations vazio/texto legado ou JSON valido quando comeca com "{"
create or replace view public.validated_inspections
with (security_invoker = true) as
select
  i.*,
  o.op as order_op,
  o.cliente as order_cliente,
  o.produto as order_produto,
  o.qtd_total as order_qtd_total,
  case
    when i.observations is null or btrim(i.observations) = '' then true
    when left(btrim(i.observations), 1) <> '{' then true
    when public.is_valid_jsonb(i.observations) then true
    else false
  end as observations_valid_json,
  case
    when i.observations is null or btrim(i.observations) = '' then null::jsonb
    when left(btrim(i.observations), 1) = '{'
      and public.is_valid_jsonb(i.observations)
      then i.observations::jsonb
    else null::jsonb
  end as observations_json
from public.inspections i
join public.orders o
  on o.id = i.order_id
 and upper(btrim(o.op)) = upper(btrim(i.op))
where
  i.order_id is not null
  and (
    i.observations is null
    or btrim(i.observations) = ''
    or left(btrim(i.observations), 1) <> '{'
    or public.is_valid_jsonb(i.observations)
  );

-- Inspecoes de pallet somente quando vinculadas a uma OP existente e coerente.
create or replace view public.validated_pallet_inspections
with (security_invoker = true) as
select
  p.*,
  o.op as order_op,
  o.cliente as order_cliente,
  o.produto as order_produto,
  o.qtd_total as order_qtd_total
from public.pallet_inspections p
join public.orders o
  on o.id = p.order_id
 and upper(btrim(o.op)) = upper(btrim(p.op))
where p.order_id is not null;

-- Diagnostico operacional: retorna registros que nao devem entrar em filtros/relatorios.
create or replace function public.get_order_integrity_issues()
returns table (
  source_table text,
  record_id uuid,
  op text,
  order_id uuid,
  issue text,
  created_at timestamptz
)
language sql
stable
security invoker
as $$
  select
    'inspections'::text,
    i.id,
    i.op,
    i.order_id,
    case
      when i.order_id is null then 'missing_order_id'
      when o.id is null then 'order_not_found'
      when upper(btrim(o.op)) <> upper(btrim(i.op)) then 'op_mismatch'
      when left(btrim(coalesce(i.observations, '')), 1) = '{'
        and not public.is_valid_jsonb(i.observations) then 'invalid_observations_json'
      else 'unknown'
    end,
    i.created_at
  from public.inspections i
  left join public.orders o on o.id = i.order_id
  where
    i.order_id is null
    or o.id is null
    or upper(btrim(o.op)) <> upper(btrim(i.op))
    or (
      left(btrim(coalesce(i.observations, '')), 1) = '{'
      and not public.is_valid_jsonb(i.observations)
    )

  union all

  select
    'pallet_inspections'::text,
    p.id,
    p.op,
    p.order_id,
    case
      when p.order_id is null then 'missing_order_id'
      when o.id is null then 'order_not_found'
      when upper(btrim(o.op)) <> upper(btrim(p.op)) then 'op_mismatch'
      else 'unknown'
    end,
    p.completed_at
  from public.pallet_inspections p
  left join public.orders o on o.id = p.order_id
  where
    p.order_id is null
    or o.id is null
    or upper(btrim(o.op)) <> upper(btrim(p.op));
$$;

grant select on public.validated_inspections to authenticated;
grant select on public.validated_pallet_inspections to authenticated;
grant execute on function public.is_valid_jsonb(text) to authenticated;
grant execute on function public.get_order_integrity_issues() to authenticated;
