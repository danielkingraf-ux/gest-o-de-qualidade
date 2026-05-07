-- ============================================================
-- Migração 009: Rastreabilidade de OP — unidades, pilhas, reimpressões
-- Executar no Supabase SQL Editor
-- ============================================================

-- 1. Novos campos em orders para rastreabilidade de unidades
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS unidades_por_folha  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS folhas_por_pilha    integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS rodadas_realizadas  integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.unidades_por_folha IS 'Quantas embalagens saem de uma folha. Chave de conversão folha→unidade.';
COMMENT ON COLUMN orders.folhas_por_pilha    IS 'Folhas por pilha padrão desta OP.';
COMMENT ON COLUMN orders.rodadas_realizadas  IS 'Número de rodadas executadas (incrementa a cada reimpressão aprovada).';

-- 2. Tabela de reimpressões
CREATE TABLE IF NOT EXISTS op_reimpressoes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  inspection_id    uuid        REFERENCES inspections(id),
  numero_rodada    integer     NOT NULL,
  quantidade_unid  integer     NOT NULL,
  motivo           text        NOT NULL,
  solicitada_por   uuid        NOT NULL REFERENCES auth.users(id),
  aprovada_por     uuid        REFERENCES auth.users(id),
  status           text        NOT NULL DEFAULT 'pendente'
                               CHECK (status IN ('pendente', 'aprovada', 'recusada', 'executada')),
  machine_id       uuid        REFERENCES machines(id),
  operator_id      uuid        REFERENCES operators(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS op_reimpressoes_order_id_idx ON op_reimpressoes(order_id);
CREATE INDEX IF NOT EXISTS op_reimpressoes_status_idx   ON op_reimpressoes(status);

CREATE TRIGGER op_reimpressoes_updated_at
  BEFORE UPDATE ON op_reimpressoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. RLS para op_reimpressoes
ALTER TABLE op_reimpressoes ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados lêem
CREATE POLICY "Autenticado lê op_reimpressoes" ON op_reimpressoes
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Analista cria solicitação (somente para si mesmo)
CREATE POLICY "Analista solicita reimpressao" ON op_reimpressoes
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND solicitada_por = auth.uid()
  );

-- Supervisor aprova/recusa/gerencia tudo
CREATE POLICY "Supervisor gerencia op_reimpressoes" ON op_reimpressoes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'supervisor'
    )
  );
