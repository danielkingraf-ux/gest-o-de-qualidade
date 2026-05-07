-- ============================================================
-- Migracao 004: Area de atuacao para maquinas e operadores
-- Executar no Supabase SQL Editor
-- ============================================================

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'producao_inicial'
  CHECK (area IN ('producao_inicial', 'produto_acabado', 'ambos'));

ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'producao_inicial'
  CHECK (area IN ('producao_inicial', 'produto_acabado', 'ambos'));

CREATE INDEX IF NOT EXISTS machines_area_idx ON machines(area);
CREATE INDEX IF NOT EXISTS operators_area_idx ON operators(area);
