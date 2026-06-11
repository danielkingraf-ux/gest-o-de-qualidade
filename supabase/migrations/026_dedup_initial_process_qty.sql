-- 026 - Deduplica inspecoes da impressao por rodada ao somar a "boa" disponivel
--
-- *** OBSOLETA — NAO APLICAR. Substituida pela migration 030. ***
-- Esta versao mantinha apenas a inspecao mais recente de cada rodada, o que
-- descartaria apontamentos PARCIAIS legitimos da mesma rodada (turnos
-- diferentes). A 030 soma os parciais e descarta apenas duplo-saves.
--
-- Problema: kg_initial_process_good_qty (migration 025) somava TODAS as inspecoes
-- 'producao_inicial' da OP sem deduplicar por numero_rodada. Quando existe mais de
-- uma linha para a mesma rodada (ex.: duplo-save), a "boa" da impressao era contada
-- em dobro, e a trava de fluxo fisico (trg_validate_acabamento_physical_flow)
-- liberava o Corte/Vinco a rodar o dobro do que de fato existe.
--
-- Caso real: OP 19714, rodada 1 com 2 linhas identicas (aprovadas 37.816 cada) =>
-- a funcao retornava 75.632 em vez de 37.816.
--
-- Correcao: manter apenas a inspecao MAIS RECENTE de cada numero_rodada (espelha a
-- deduplicacao que o front ja faz em AcabamentoCortesVincoView / OPTraceView).
-- Mantem a seguranca por-linha contra registros antigos com texto livre em observations.
--
-- Executar no Supabase SQL Editor.

create or replace function public.kg_initial_process_good_qty(p_op text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rec    record;
  obs    jsonb;
  rodada text;
  total  int := 0;
  seen   text[] := array[]::text[];
begin
  for rec in
    select observations
    from public.inspections
    where upper(btrim(op)) = upper(btrim(p_op))
      and observations is not null
      and btrim(observations) like '{%'
    order by created_at desc          -- mais recente primeiro
  loop
    begin
      obs := rec.observations::jsonb;
      if obs ->> 'process_area' = 'producao_inicial' then
        rodada := coalesce(obs ->> 'numero_rodada', '1');
        -- so a primeira ocorrencia (mais recente) de cada rodada conta
        if not (rodada = any(seen)) then
          seen  := seen || rodada;
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
