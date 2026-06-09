-- 028 - Cadastro de problemas/motivos da escolha (editável pelo supervisor)
--
-- As listas de "Problema / motivo da escolha" que aparecem como sugestão em
-- Corte/Vinco, Colagem e Produto Acabado passam a vir desta tabela. O código
-- mantém uma lista padrão de fallback, então o app funciona mesmo antes de rodar
-- esta migration; depois dela, o supervisor gerencia pelo Admin.
--
-- Executar no Supabase SQL Editor.

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

-- Todos os autenticados leem (as telas usam como sugestão)
create policy "escolha_problemas_select"
  on public.escolha_problemas for select
  to authenticated
  using (true);

-- Só supervisor/admin gerencia
create policy "escolha_problemas_write"
  on public.escolha_problemas for all
  to authenticated
  using (public.current_user_role() in ('supervisor', 'administrador'))
  with check (public.current_user_role() in ('supervisor', 'administrador'));

-- Seed com as listas atuais (idempotente)
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
