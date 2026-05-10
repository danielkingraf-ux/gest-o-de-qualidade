-- Inspeções por pallet — Kingraf Produto Acabado
-- Sub-lote fixo: 50.000 unidades por pallet
-- Fórmula de caixas: √(total_caixas_sublote) + 1 (arredondado para cima)

create table if not exists public.pallet_inspections (
  id                    uuid primary key default gen_random_uuid(),
  op                    text not null,
  order_id              uuid references public.orders(id) on delete set null,
  pallet_number         int not null default 1,

  -- Analista e máquina
  analyst_id            text,
  machine_id            text,
  analyst_name          text,
  machine_name          text,

  -- Configuração da embalagem
  units_per_box         int not null,
  boxes_per_pallet      int not null,

  -- Cálculo da amostragem (sub-lote fixo 50.000)
  total_boxes_sublote   int not null,    -- ceil(50000 / units_per_box)
  boxes_to_inspect      int not null,    -- ceil(√total_boxes_sublote + 1)
  boxes_list            int[] not null default '{}',
  sample_size           int not null,    -- tamanho de amostra NBR 5426

  -- Perfil NQA utilizado
  nqa_profile_id        uuid references public.nqa_profiles(id) on delete set null,
  nqa_profile_name      text,
  aql_critical          text not null default '0.065',
  aql_major             text not null default '1.0',
  aql_minor             text not null default '4.0',
  inspection_level      text not null default 'II',

  -- Contagem de defeitos NQA
  defects_critical      int not null default 0,
  defects_major         int not null default 0,
  defects_minor         int not null default 0,
  defects_detail        jsonb not null default '{}',   -- mapa chave→contagem de todos os tipos

  -- Resultado
  result                text not null check (result in ('APPROVED', 'REJECTED', 'RESTRICTED')),
  observations          text,

  -- Auditoria
  completed_at          timestamptz not null default now(),
  created_by_user_id    uuid references auth.users(id) on delete set null,

  unique (op, pallet_number)
);

comment on table public.pallet_inspections is
  'Registro de inspeção por pallet de produto acabado. Sub-lote fixo de 50.000 unidades.';

-- Índices
create index if not exists pallet_inspections_op_idx on public.pallet_inspections (op);
create index if not exists pallet_inspections_order_id_idx on public.pallet_inspections (order_id);
create index if not exists pallet_inspections_result_idx on public.pallet_inspections (result);
create index if not exists pallet_inspections_completed_at_idx on public.pallet_inspections (completed_at desc);

-- RLS
alter table public.pallet_inspections enable row level security;

create policy "Authenticated users can read pallet_inspections"
  on public.pallet_inspections for select
  to authenticated using (true);

create policy "Authenticated users can insert pallet_inspections"
  on public.pallet_inspections for insert
  to authenticated with check (true);

create policy "Supervisors can update pallet_inspections"
  on public.pallet_inspections for update
  to authenticated using (current_user_role() = 'supervisor');

create policy "Supervisors can delete pallet_inspections"
  on public.pallet_inspections for delete
  to authenticated using (current_user_role() = 'supervisor');
