-- 023 — Remove constraint unique(op, pallet_number) de pallet_inspections
-- Necessário para permitir múltiplas análises da mesma OP (pallets arquivados
-- liberam os números para reutilização na próxima análise)
-- Executar no Supabase SQL Editor

alter table public.pallet_inspections
  drop constraint if exists pallet_inspections_op_pallet_number_key;
