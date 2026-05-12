-- 017 — Vínculo entre Análise Inicial e Controle de Escolha/Revisão

alter table public.escolha_revisao_registros
  add column if not exists origem_registro_tabela text,
  add column if not exists origem_registro_id text,
  add column if not exists origem_tela text,
  add column if not exists origem_problema text;

alter table public.escolha_revisao_registros
  drop constraint if exists escolha_revisao_origem_problema_check;

alter table public.escolha_revisao_registros
  add constraint escolha_revisao_origem_problema_check
  check (
    origem_problema is null
    or origem_problema in ('impressao', 'verniz_uv', 'hot_stamping', 'corte_vinco', 'outro')
  );

create index if not exists idx_escolha_revisao_origem
  on public.escolha_revisao_registros (
    origem_registro_tabela,
    origem_registro_id,
    origem_tela,
    origem_problema
  );

create unique index if not exists uq_escolha_revisao_origem_defeito
  on public.escolha_revisao_registros (
    origem_registro_tabela,
    origem_registro_id,
    tipo_defeito,
    origem_problema
  )
  where origem_registro_tabela is not null
    and origem_registro_id is not null;

-- Sem policy de delete: registros seguem preservados.
