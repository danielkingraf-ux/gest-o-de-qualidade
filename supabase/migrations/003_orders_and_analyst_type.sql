-- ============================================================
-- Migração 003: Tabela de Ordens de Produção + tipo de analista
-- Executar no Supabase SQL Editor
-- ============================================================

-- 1. Tipo de analista (impressão ou acabamento)
ALTER TABLE analysts
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'impressao'
  CHECK (tipo IN ('impressao', 'acabamento', 'ambos'));

-- 2. Tabela de Ordens de Produção
CREATE TABLE IF NOT EXISTS orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op              text NOT NULL UNIQUE,          -- ex: "OP-2024-001"
  cliente         text NOT NULL DEFAULT '',
  produto         text NOT NULL DEFAULT '',
  descricao       text,
  qtd_total       integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'em_producao'
                  CHECK (status IN ('em_producao', 'concluido', 'suspenso')),
  created_by_user_id uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS orders_op_idx     ON orders(op);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);

-- 3. Vincular inspections à order (mantém op como texto p/ compatibilidade)
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id);

CREATE INDEX IF NOT EXISTS inspections_order_id_idx ON inspections(order_id);

-- 4. RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Todos os usuários autenticados lêem ordens
CREATE POLICY "Autenticado lê orders" ON orders
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Todos criam ordens
CREATE POLICY "Autenticado cria orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Supervisor atualiza/exclui ordens
CREATE POLICY "Supervisor gerencia orders" ON orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'supervisor'
    )
  );
