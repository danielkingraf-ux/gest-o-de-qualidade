-- Plataforma de Controle de Qualidade - evolucao sugerida do banco
-- Este script e idempotente para preparar o schema atual para a reformulacao.
-- A aplicacao atual ainda grava em public.inspections.observations para manter compatibilidade.

alter table if exists public.inspections
  add column if not exists process_type text,
  add column if not exists sector text,
  add column if not exists shift text,
  add column if not exists payload jsonb,
  add column if not exists closed_at timestamptz;

create index if not exists inspections_op_idx
  on public.inspections (op);

create index if not exists inspections_process_type_idx
  on public.inspections (process_type);

create index if not exists inspections_created_at_idx
  on public.inspections (created_at desc);

create table if not exists public.quality_alerts (
  id uuid primary key default gen_random_uuid(),
  op text not null,
  level text not null check (level in ('alert', 'critical')),
  status text not null default 'open' check (status in ('open', 'closed')),
  message text not null,
  close_note text,
  created_by uuid references auth.users(id),
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists quality_alerts_op_idx
  on public.quality_alerts (op);

create index if not exists quality_alerts_status_idx
  on public.quality_alerts (status);

create table if not exists public.quality_alert_reads (
  alert_id uuid not null references public.quality_alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

create table if not exists public.quality_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references public.inspections(id) on delete cascade,
  op text not null,
  storage_path text not null,
  caption text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists quality_photos_op_idx
  on public.quality_photos (op);

create table if not exists public.reinspections (
  id uuid primary key default gen_random_uuid(),
  original_inspection_id uuid references public.inspections(id) on delete cascade,
  op text not null,
  requested_by uuid references auth.users(id),
  inspected_by uuid references auth.users(id),
  status text not null default 'IN_PROGRESS',
  result text,
  notes text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists reinspections_op_idx
  on public.reinspections (op);
