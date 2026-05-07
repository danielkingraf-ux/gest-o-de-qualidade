-- ============================================================
-- Migracao 006: Restaura acesso de administrador
-- Executar no Supabase SQL Editor
-- ============================================================

-- PASSO 1: Verificar a restrição de roles permitidos
select constraint_name, check_clause
from information_schema.check_constraints
where constraint_name like '%role%';

-- PASSO 2: Ver os valores de role que já existem
select distinct role from public.user_profiles;

-- PASSO 3: Atualizar role para supervisor (permissões totais)
update public.user_profiles
set role = 'supervisor', active = true
where user_id = 'b332d6a8-33e7-43ad-a8c2-e9d55089ff00';

-- PASSO 4: Verificar se funcionou
select id, user_id, name, role, active from public.user_profiles 
where user_id = 'b332d6a8-33e7-43ad-a8c2-e9d55089ff00';
