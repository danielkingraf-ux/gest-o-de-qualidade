-- Perfis NQA por cliente (tabela de produção Kingraf)
-- Fonte: tabela física "N.Q.A USADOS" — aprovada pela qualidade

-- Garante unicidade por nome para evitar duplicatas
alter table public.nqa_profiles
  drop constraint if exists nqa_profiles_name_unique;
alter table public.nqa_profiles
  add constraint nqa_profiles_name_unique unique (name);

-- Insere os 18 perfis de clientes
-- Observações especiais:
--   GRUPO DIMED  → Nível I (tabela simples normal)
--   IPEC         → Nível III (inspeção severa)
--   ADCOS menor  → AQL 10 (adicionado à tabela NBR 5426)
--   THYFER       → cartelas com vincos estourados usam NQA 1.0 (perfil separado)
insert into public.nqa_profiles (name, description, aql_critical, aql_major, aql_minor, inspection_level)
values
  ('ADCOS',         'NQA padrão ADCOS',                                  '1.0',  '4.0',  '10',  'II'),
  ('BOTICA',        'NQA padrão Botica',                                  '0.40', '1.5',  '4.0', 'II'),
  ('CHROMAVIS',     'NQA padrão Chromavis',                               '0.40', '1.5',  '4.0', 'II'),
  ('FABER CASTELL', 'NQA padrão Faber Castell',                           '0.40', '1.5',  '4.0', 'II'),
  ('LECLAIR',       'NQA padrão Leclair',                                 '0.40', '1.5',  '4.0', 'II'),
  ('SCHWAN',        'NQA padrão Schwan',                                  '0.40', '1.5',  '4.0', 'II'),
  ('BARION',        'NQA padrão Barion',                                  '0.40', '1.5',  '4.0', 'II'),
  ('DELLY',         'NQA padrão Delly',                                   '0.65', '1.5',  '4.0', 'II'),
  ('DIVERSOS',      'NQA para clientes diversos / genérico',              '1.0',  '4.0',  '6.5', 'II'),
  ('GRUPO DIMED',   'NQA Grupo Dimed — Tabela Simples Normal Nível I',    '0.25', '1.5',  '4.0', 'I'),
  ('HERBARIUM',     'NQA padrão Herbarium',                               '0.65', '2.5',  '6.5', 'II'),
  ('IPEC',          'IPEC — Inspeção Severa Nível III',                   '0.25', '1.0',  '4.0', 'III'),
  ('KLAREX',        'NQA padrão Klarex',                                  '1.0',  '4.0',  '6.5', 'II'),
  ('LIFESIL',       'NQA padrão Lifesil',                                 '1.0',  '4.0',  '6.5', 'II'),
  ('NASHA',         'NQA padrão Nasha',                                   '0.40', '2.5',  '4.0', 'II'),
  ('RACCO',         'NQA padrão Racco',                                   '0.25', '1.5',  '4.0', 'II'),
  ('SALLVE',        'NQA padrão Sallve',                                  '0.25', '1.5',  '4.0', 'II'),
  ('SYSMEX',        'NQA padrão Sysmex',                                  '1.5',  '2.5',  '4.0', 'II'),
  ('THYFER — Vincos Estourados', 'Cartelas Thyfer: NQA 1.0 para todos os vincos estourados', '1.0', '1.0', '1.0', 'II')
on conflict (name) do nothing;
