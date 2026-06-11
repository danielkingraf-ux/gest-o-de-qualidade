-- 031 - Colagem: boas recuperadas da escolha entram no saldo disponivel
--
-- Regra de negocio (confirmada com a operacao): a colagem pode revisar a
-- escolha acumulada (impressao + corte/vinco) ANTES de colar. As boas
-- recuperadas voltam pro fluxo (entram no "rodado" da colagem) e nao precisam
-- ir a Revisao Final; o refugo da revisao sai definitivamente; o que nao foi
-- revisado segue a Revisao Final.
--
-- Problema corrigido: o trigger de fluxo fisico (migration 025) calculava o
-- disponivel da colagem APENAS como aprovadas do C/V - ja rodado. Quando o
-- operador somava as boas recuperadas ao Rodado (como a tela instrui), o
-- trigger bloqueava o save. Agora:
--
--   disponivel(colagem) = aprovadas(C/V)
--                       + boas_revisadas (outras linhas de colagem da OP)
--                       + boas_revisadas (da propria linha sendo gravada)
--                       - ja_rodado (outras linhas de colagem)
--
-- E valida tambem que a revisao da escolha nao excede a escolha existente:
--
--   boas_revisadas + refugo_revisao (linha nova)
--     <= escolha(impressao) + escolha(C/V) - ja resolvido em outras linhas
--
-- Requer a migration 030 (kg_initial_process_good_qty com soma de parciais).
-- Executar no Supabase SQL Editor (idempotente).

-- Soma de uma chave inteira do jsonb defects nas linhas de um modulo da OP.
create or replace function public.kg_acabamento_defects_int_sum(
  p_op text,
  p_modulo text,
  p_key text,
  p_exclude_id uuid default null
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.kg_jsonb_int(coalesce(defects, '{}'::jsonb), p_key)), 0)
    from public.acabamento_registros
   where upper(btrim(op)) = upper(btrim(p_op))
     and modulo = p_modulo
     and (p_exclude_id is null or id <> p_exclude_id);
$$;

-- Escolha gerada pela impressao (em_escolha), com a mesma regra de parciais
-- da migration 030: soma tudo, ignora duplo-save identico em janela de 5 min.
create or replace function public.kg_initial_process_escolha_qty(p_op text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rec        record;
  obs        jsonb;
  sig        text;
  total      int := 0;
  seen_sigs  text[] := array[]::text[];
  seen_times timestamptz[] := array[]::timestamptz[];
  is_dup     boolean;
  i          int;
begin
  for rec in
    select created_at, observations
    from public.inspections
    where upper(btrim(op)) = upper(btrim(p_op))
      and observations is not null
      and btrim(observations) like '{%'
    order by created_at asc
  loop
    begin
      obs := rec.observations::jsonb;
      if obs ->> 'process_area' = 'producao_inicial' and obs ? 'saldo_unidades' then
        sig := coalesce(obs ->> 'numero_rodada', '1') || '|' || (obs -> 'saldo_unidades')::text;

        is_dup := false;
        for i in 1 .. coalesce(array_length(seen_sigs, 1), 0) loop
          if seen_sigs[i] = sig
             and abs(extract(epoch from (rec.created_at - seen_times[i]))) <= 300 then
            is_dup := true;
            exit;
          end if;
        end loop;

        if not is_dup then
          seen_sigs  := seen_sigs  || sig;
          seen_times := seen_times || rec.created_at;
          total := total + coalesce((obs #>> '{saldo_unidades,em_escolha}')::int, 0);
        end if;
      end if;
    exception when others then
      null;
    end;
  end loop;

  return total;
end;
$$;

-- Trigger de fluxo fisico com as boas recuperadas no disponivel da colagem.
create or replace function public.kg_validate_acabamento_physical_flow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_good     int := 0;
  already_ran       int := 0;
  available         int := 0;
  refugo            int := 0;
  expected_good     int := 0;
  boas_rev_nova     int := 0;
  refugo_rev_nova   int := 0;
  escolha_existente int := 0;
  escolha_resolvida int := 0;
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
    boas_rev_nova   := public.kg_jsonb_int(coalesce(new.defects, '{}'::jsonb), 'boas_revisadas');
    refugo_rev_nova := public.kg_jsonb_int(coalesce(new.defects, '{}'::jsonb), 'refugo_revisao');

    -- Revisao da escolha nao pode exceder a escolha pendente:
    -- escolha gerada (impressao + C/V) - ja resolvida em outras linhas de colagem.
    if boas_rev_nova > 0 or refugo_rev_nova > 0 then
      escolha_existente := public.kg_initial_process_escolha_qty(new.op)
                         + public.kg_acabamento_stage_qty(new.op, 'corte_vinco', 'qty_reprovadas', null);
      escolha_resolvida := public.kg_acabamento_defects_int_sum(new.op, 'colagem', 'boas_revisadas', new.id)
                         + public.kg_acabamento_defects_int_sum(new.op, 'colagem', 'refugo_revisao', new.id);
      if boas_rev_nova + refugo_rev_nova > greatest(0, escolha_existente - escolha_resolvida) then
        raise exception 'Boas revisadas + refugo da revisao (% un.) excedem a escolha pendente (% un.).',
          boas_rev_nova + refugo_rev_nova, greatest(0, escolha_existente - escolha_resolvida)
          using errcode = '23514';
      end if;
    end if;

    -- Disponivel = aprovadas do C/V + boas recuperadas (outras linhas + esta linha).
    previous_good := public.kg_acabamento_stage_qty(new.op, 'corte_vinco', 'qty_aprovadas', null)
                   + public.kg_acabamento_defects_int_sum(new.op, 'colagem', 'boas_revisadas', new.id)
                   + boas_rev_nova;
    already_ran := public.kg_acabamento_stage_qty(new.op, 'colagem', 'qty_revisadas', new.id);
  end if;

  available := greatest(0, previous_good - already_ran);

  if new.qty_revisadas > available then
    raise exception 'Quantidade rodada maior que o saldo disponivel da etapa anterior. Disponivel: % un. (ja processado nesta etapa: % un.).',
      available, already_ran
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_acabamento_physical_flow on public.acabamento_registros;
create trigger trg_validate_acabamento_physical_flow
before insert or update on public.acabamento_registros
for each row execute function public.kg_validate_acabamento_physical_flow();
