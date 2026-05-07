-- Diagnostico: Verificar estrutura da tabela user_profiles
-- Executar query por query no Supabase SQL Editor

-- QUERY 1: Ver todas as colunas disponíveis
select column_name, data_type 
from information_schema.columns 
where table_name = 'user_profiles'
order by ordinal_position;

-- QUERY 2: Ver todos os usuários (primeiros 10)
select * from public.user_profiles limit 10;

-- QUERY 3: Encontrar seu usuário pelo nome
select id, user_id, name, role, active from public.user_profiles 
where name ilike '%daniel%';

-- QUERY 4: Ver usuários na tabela auth.users para obter email
select id, email from auth.users 
where email = 'daniel.oliveira@kingraf.com.br';

-- QUERY 5: RESTAURAR SEU ACESSO DE ADMINISTRADOR (use o user_id da QUERY 4)
update public.user_profiles
set role = 'admin', active = true
where user_id = 'COLOQUE_USER_ID_AQUI';

-- QUERY 6: Verifique se funcionou - listar todos os admins
select id, user_id, name, role, active from public.user_profiles where role = 'admin';
