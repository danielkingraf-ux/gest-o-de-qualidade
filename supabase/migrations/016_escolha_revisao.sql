-- 016 — Controle de Escolha/Revisão
-- Estrutura isolada para registrar material enviado para escolha/revisão.

create table if not exists public.escolha_revisao_registros (
  id                          uuid primary key default gen_random_uuid(),
  op                          text not null,
  cliente                     text,
  produto                     text,
  origem_escolha              text not null,
  setor_detectado             text not null,
  motivo_escolha              text not null,
  tipo_defeito                text not null,
  classificacao_defeito       text not null,
  quantidade_enviada          int not null,
  responsavel_envio_id        uuid references auth.users(id) on delete set null,
  responsavel_envio_nome      text,
  entrada_at                  timestamptz not null default now(),
  status                      text not null default 'aberta'
                              check (status in (
                                'aberta',
                                'em_revisao',
                                'parcialmente_revisada',
                                'finalizada',
                                'bloqueada',
                                'liberada'
                              )),
  responsavel_revisao_id      uuid references auth.users(id) on delete set null,
  responsavel_revisao_nome    text,
  quantidade_revisada         int not null default 0,
  quantidade_boa_recuperada   int not null default 0,
  quantidade_refugada         int not null default 0,
  quantidade_pendente         int not null default 0,
  revisao_at                  timestamptz,
  observacao                  text,
  destino_material_bom        text check (
                                destino_material_bom is null
                                or destino_material_bom in (
                                  'volta_corte_vinco',
                                  'volta_destaque',
                                  'volta_colagem',
                                  'liberado_expedicao',
                                  'fica_bloqueado',
                                  'outro'
                                )
                              ),
  outro_destino               text,
  created_by                  uuid references auth.users(id) on delete set null,
  updated_by                  uuid references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint escolha_quantidade_enviada_positive check (quantidade_enviada > 0),
  constraint escolha_quantidades_non_negative check (
    quantidade_revisada >= 0
    and quantidade_boa_recuperada >= 0
    and quantidade_refugada >= 0
    and quantidade_pendente >= 0
  ),
  constraint escolha_revisada_consistente check (
    quantidade_revisada = quantidade_boa_recuperada + quantidade_refugada
  ),
  constraint escolha_pendente_consistente check (
    quantidade_pendente = quantidade_enviada - quantidade_revisada
  ),
  constraint escolha_revisada_nao_excede_enviada check (
    quantidade_boa_recuperada + quantidade_refugada <= quantidade_enviada
  ),
  constraint escolha_fechamento_sem_pendencia check (
    status not in ('finalizada', 'liberada')
    or (
      quantidade_pendente = 0
      and quantidade_boa_recuperada + quantidade_refugada = quantidade_enviada
    )
  ),
  constraint escolha_liberada_com_destino check (
    status <> 'liberada'
    or destino_material_bom is not null
  )
);

create index if not exists idx_escolha_revisao_op on public.escolha_revisao_registros(op);
create index if not exists idx_escolha_revisao_status on public.escolha_revisao_registros(status);
create index if not exists idx_escolha_revisao_entrada on public.escolha_revisao_registros(entrada_at desc);
create index if not exists idx_escolha_revisao_envio on public.escolha_revisao_registros(responsavel_envio_id);
create index if not exists idx_escolha_revisao_revisao on public.escolha_revisao_registros(responsavel_revisao_id);

drop trigger if exists escolha_revisao_updated_at on public.escolha_revisao_registros;
create trigger escolha_revisao_updated_at
  before update on public.escolha_revisao_registros
  for each row execute function public.touch_updated_at();

alter table public.escolha_revisao_registros enable row level security;

drop policy if exists "escolha_revisao_select" on public.escolha_revisao_registros;
create policy "escolha_revisao_select"
  on public.escolha_revisao_registros for select
  to authenticated
  using (
    public.current_user_role() = any (array[
      'administrador',
      'direcao',
      'supervisao',
      'supervisor',
      'analista_qualidade',
      'analista',
      'revisao_escolha',
      'auxiliar',
      'consulta_auditoria'
    ]::text[])
  );

drop policy if exists "escolha_revisao_insert" on public.escolha_revisao_registros;
create policy "escolha_revisao_insert"
  on public.escolha_revisao_registros for insert
  to authenticated
  with check (
    public.current_user_role() = any (array['administrador', 'analista_qualidade', 'analista']::text[])
    and created_by = auth.uid()
  );

drop policy if exists "escolha_revisao_update" on public.escolha_revisao_registros;
create policy "escolha_revisao_update"
  on public.escolha_revisao_registros for update
  to authenticated
  using (public.current_user_role() = any (array['administrador', 'revisao_escolha', 'auxiliar']::text[]))
  with check (public.current_user_role() = any (array['administrador', 'revisao_escolha', 'auxiliar']::text[]));

-- Sem policy de delete: registros de escolha/revisão são preservados.
