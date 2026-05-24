-- 025 - Trava fluxo fisico de quantidades entre etapas
-- Executar no Supabase SQL Editor.

create or replace function public.kg_jsonb_int(payload jsonb, key text)
returns int
language sql
immutable
as $$
  select case
    when payload ? key and (payload ->> key) ~ '^-?[0-9]+$'
      then (payload ->> key)::int
    else 0
  end;
$$;

create or replace function public.kg_initial_process_good_qty(p_op text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rec record;
  obs jsonb;
  total int := 0;
begin
  for rec in
    select observations
    from public.inspections
    where upper(btrim(op)) = upper(btrim(p_op))
      and observations is not null
      and btrim(observations) like '{%'
  loop
    begin
      obs := rec.observations::jsonb;
      if obs ->> 'process_area' = 'producao_inicial' then
        total := total + coalesce((obs #>> '{saldo_unidades,aprovadas}')::int, 0);
      end if;
    exception when others then
      -- Registros antigos podem ter texto livre em observations.
      null;
    end;
  end loop;

  return total;
end;
$$;

create or replace function public.kg_acabamento_stage_qty(
  p_op text,
  p_modulo text,
  p_column text,
  p_exclude_id uuid default null
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  total int := 0;
begin
  if p_column = 'qty_revisadas' then
    select coalesce(sum(qty_revisadas), 0)
      into total
      from public.acabamento_registros
     where upper(btrim(op)) = upper(btrim(p_op))
       and modulo = p_modulo
       and (p_exclude_id is null or id <> p_exclude_id);
  elsif p_column = 'qty_aprovadas' then
    select coalesce(sum(qty_aprovadas), 0)
      into total
      from public.acabamento_registros
     where upper(btrim(op)) = upper(btrim(p_op))
       and modulo = p_modulo
       and (p_exclude_id is null or id <> p_exclude_id);
  else
    raise exception 'Coluna de quantidade invalida: %', p_column;
  end if;

  return total;
end;
$$;

create or replace function public.kg_validate_acabamento_physical_flow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_good int := 0;
  already_ran int := 0;
  available int := 0;
  refugo int := 0;
  expected_good int := 0;
begin
  if new.modulo not in ('corte_vinco', 'colagem') then
    return new;
  end if;

  refugo := public.kg_jsonb_int(coalesce(new.defects, '{}'::jsonb), 'qty_refugo');
  expected_good := new.qty_revisadas - new.qty_reprovadas - refugo;

  if new.qty_revisadas < 0 or new.qty_reprovadas < 0 or new.qty_aprovadas < 0 or refugo < 0 then
    raise exception 'Quantidades nao podem ser negativas.'
      using errcode = '23514';
  end if;

  if expected_good < 0 then
    raise exception 'Escolha + refugo nao pode ser maior que o rodado nesta etapa.'
      using errcode = '23514';
  end if;

  if new.qty_aprovadas <> expected_good then
    raise exception 'Saldo bom invalido. Use boa_etapa = quantidade_rodada - quantidade_escolha - quantidade_refugo.'
      using errcode = '23514';
  end if;

  if new.modulo = 'corte_vinco' then
    previous_good := public.kg_initial_process_good_qty(new.op);
    already_ran := public.kg_acabamento_stage_qty(new.op, 'corte_vinco', 'qty_revisadas', new.id);
  else
    previous_good := public.kg_acabamento_stage_qty(new.op, 'corte_vinco', 'qty_aprovadas', null);
    already_ran := public.kg_acabamento_stage_qty(new.op, 'colagem', 'qty_revisadas', new.id);
  end if;

  available := greatest(0, previous_good - already_ran);

  if new.qty_revisadas > available then
    raise exception 'Quantidade rodada maior que o saldo disponivel da etapa anterior. Recebido: % un.; ja processado nesta etapa: % un.; disponivel: % un.',
      previous_good, already_ran, available
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_acabamento_physical_flow on public.acabamento_registros;
create trigger trg_validate_acabamento_physical_flow
before insert or update on public.acabamento_registros
for each row execute function public.kg_validate_acabamento_physical_flow();
