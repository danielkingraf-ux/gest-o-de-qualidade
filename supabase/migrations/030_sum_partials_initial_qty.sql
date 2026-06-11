-- 030 - Soma apontamentos PARCIAIS da impressao; descarta so duplo-saves
--
-- SUBSTITUI a estrategia da migration 026 (que mantinha apenas a inspecao mais
-- recente de cada numero_rodada). Regra de negocio confirmada com a operacao:
-- a mesma rodada pode ter VARIOS apontamentos legitimos (parciais por turno),
-- que devem ser SOMADOS. A 026 descartaria producao real.
--
-- O que ainda e descartado: o duplo-save — registro da mesma rodada com o
-- MESMO saldo_unidades gravado em janela de 5 minutos (caso real da OP 19714,
-- duas linhas identicas com 36s de diferenca). Com isso a OP 19714 fecha certo
-- mesmo sem rodar a limpeza pontual da migration 027.
--
-- Mesma regra implementada no front em utils/inspectionDedup.ts — manter os
-- dois lados em sincronia se a janela mudar.
--
-- Executar no Supabase SQL Editor (pode rodar mais de uma vez; substitui a
-- versao anterior da funcao, seja a original da 025 ou a da 026).

create or replace function public.kg_initial_process_good_qty(p_op text)
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
        -- Assinatura do registro: rodada + saldo completo.
        sig := coalesce(obs ->> 'numero_rodada', '1') || '|' || (obs -> 'saldo_unidades')::text;

        -- Duplo-save: mesma assinatura ja mantida ha menos de 5 minutos.
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
          total := total + coalesce((obs #>> '{saldo_unidades,aprovadas}')::int, 0);
        end if;
      end if;
    exception when others then
      -- Registros antigos podem ter texto livre em observations.
      null;
    end;
  end loop;

  return total;
end;
$$;
