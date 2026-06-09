-- 029 - Adiciona etapa 'impressao' à tabela escolha_problemas
--
-- O setor de Impressão (Processo Inicial) também precisa registrar o motivo
-- da escolha por problema específico. Esta migration:
--   1. Amplia o check constraint para incluir 'impressao'
--   2. Semeia os problemas padrão de impressão
--
-- Executar no Supabase SQL Editor.

-- Ampliar o check constraint (Postgres exige drop + recreate)
ALTER TABLE public.escolha_problemas
  DROP CONSTRAINT IF EXISTS escolha_problemas_etapa_check;

ALTER TABLE public.escolha_problemas
  ADD CONSTRAINT escolha_problemas_etapa_check
  CHECK (etapa IN ('corte_vinco', 'colagem', 'produto_acabado', 'todos', 'impressao'));

-- Seed: problemas padrão de impressão
INSERT INTO public.escolha_problemas (etapa, label) VALUES
  ('impressao', 'Mancha'),
  ('impressao', 'Registro'),
  ('impressao', 'Repasse'),
  ('impressao', 'Sujeira'),
  ('impressao', 'Verniz'),
  ('impressao', 'Risco'),
  ('impressao', 'Cor Fora'),
  ('impressao', 'Papel Amassado')
ON CONFLICT DO NOTHING;
