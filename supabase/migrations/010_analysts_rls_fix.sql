-- ============================================================
-- Migração 010: Corrige RLS da tabela analysts
-- Executar no Supabase SQL Editor
-- ============================================================

-- Garante que RLS está ativo
ALTER TABLE public.analysts ENABLE ROW LEVEL SECURITY;

-- Remove policies antigas se existirem
DROP POLICY IF EXISTS "Autenticado lê analistas" ON public.analysts;
DROP POLICY IF EXISTS "Supervisor gerencia analistas" ON public.analysts;
DROP POLICY IF EXISTS "analysts_select_authenticated" ON public.analysts;
DROP POLICY IF EXISTS "analysts_insert_supervisor" ON public.analysts;
DROP POLICY IF EXISTS "analysts_update_supervisor" ON public.analysts;
DROP POLICY IF EXISTS "analysts_delete_supervisor" ON public.analysts;

-- Leitura: todos os usuários autenticados
CREATE POLICY "analysts_select_authenticated" ON public.analysts
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Inserção: apenas supervisor
CREATE POLICY "analysts_insert_supervisor" ON public.analysts
  FOR INSERT
  WITH CHECK (public.current_user_role() = 'supervisor');

-- Atualização: apenas supervisor
CREATE POLICY "analysts_update_supervisor" ON public.analysts
  FOR UPDATE
  USING (public.current_user_role() = 'supervisor')
  WITH CHECK (public.current_user_role() = 'supervisor');

-- Exclusão: apenas supervisor
CREATE POLICY "analysts_delete_supervisor" ON public.analysts
  FOR DELETE
  USING (public.current_user_role() = 'supervisor');
