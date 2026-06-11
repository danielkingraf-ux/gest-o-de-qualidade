-- ============================================================================
-- APLICAR_AGORA.sql  —  Rode este arquivo inteiro no Supabase SQL Editor
-- ============================================================================
-- Junta as mudanças de banco pendentes da sessão. As partes 1 e 2 são SEGURAS
-- e idempotentes (pode rodar mais de uma vez). As partes DESTRUTIVAS (3 e 4)
-- ficam comentadas no fim — descomente só se for esse o objetivo.
--
-- Ordem: 1) soma de parciais (030)  2) cadastro de problemas de escolha (028)
-- ============================================================================


-- ============================================================================
-- PARTE 1 — Migration 030: soma apontamentos PARCIAIS da impressão e descarta
--           só duplo-saves (mesma rodada + mesmo saldo em janela de 5 min).
--           SUBSTITUI a migration 026: a 026 mantinha só o registro mais
--           recente por rodada e descartaria parciais por turno, que são
--           legítimos. NÃO aplicar a 026.
-- ============================================================================
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
          total := total + coalesce((obs #>> '{saldo_unidades,aprovadas}')::int, 0);
        end if;
      end if;
    exception when others then
      null;
    end;
  end loop;

  return total;
end;
$$;


-- ============================================================================
-- PARTE 2 — Migration 028: cadastro de problemas/motivos da escolha
-- ============================================================================
create table if not exists public.escolha_problemas (
  id         uuid        primary key default gen_random_uuid(),
  etapa      text        not null check (etapa in ('corte_vinco', 'colagem', 'produto_acabado', 'todos')),
  label      text        not null,
  ativo      boolean     not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_escolha_problemas_etapa on public.escolha_problemas (etapa);
create unique index if not exists uq_escolha_problemas_etapa_label
  on public.escolha_problemas (etapa, lower(label));

alter table public.escolha_problemas enable row level security;

drop policy if exists "escolha_problemas_select" on public.escolha_problemas;
drop policy if exists "escolha_problemas_write" on public.escolha_problemas;

create policy "escolha_problemas_select"
  on public.escolha_problemas for select
  to authenticated
  using (true);

create policy "escolha_problemas_write"
  on public.escolha_problemas for all
  to authenticated
  using (public.current_user_role() in ('supervisor', 'administrador'))
  with check (public.current_user_role() in ('supervisor', 'administrador'));

insert into public.escolha_problemas (etapa, label) values
  ('corte_vinco', 'Vinco Estourado'),
  ('corte_vinco', 'Falha no Corte'),
  ('corte_vinco', 'Variação'),
  ('corte_vinco', 'Vinco Fraco'),
  ('colagem', 'Fundo Virado'),
  ('colagem', 'Falta de Cola'),
  ('colagem', 'Cola Fraca'),
  ('colagem', 'Queimado Correia'),
  ('colagem', 'Rasgado'),
  ('colagem', 'Modelo Misturado'),
  ('produto_acabado', 'Mancha'),
  ('produto_acabado', 'Rasgado'),
  ('produto_acabado', 'Amassado'),
  ('produto_acabado', 'Registro'),
  ('produto_acabado', 'Sujeira'),
  ('produto_acabado', 'Falha de Colagem'),
  ('produto_acabado', 'Falha de Verniz'),
  ('produto_acabado', 'Vinco Estourado'),
  ('produto_acabado', 'Modelo Misturado'),
  ('todos', 'Outros')
on conflict do nothing;


-- ============================================================================
-- Verificação rápida (opcional) — confira que tudo entrou:
-- ============================================================================
-- select 'problemas cadastrados' as info, count(*) from public.escolha_problemas;
-- select public.kg_initial_process_good_qty('19714') as boa_impressao_19714; -- esperado: 37816 (se a 19714 existir)


-- ============================================================================
-- PARTE 3 (DESTRUTIVA — NÃO roda automaticamente) — limpar a duplicata da 19714
-- Descomente as 2 linhas abaixo só se quiser remover a inspeção duplicada.
-- ============================================================================
-- delete from public.inspections
-- where id = '7097218a-8be7-4e11-940f-b388106d897f';


-- ============================================================================
-- PARTE 4 (DESTRUTIVA — NÃO roda automaticamente) — zerar dados de teste
-- Para começar do zero, use o arquivo separado scripts/RESET_TEST_DATA.sql
-- (ele apaga inspeções, acabamento, pallets, etc.). NÃO está incluído aqui
-- de propósito, pra você não zerar a base sem querer ao rodar este arquivo.
-- ============================================================================
