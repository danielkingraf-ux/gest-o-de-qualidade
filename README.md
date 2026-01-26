# Sistema de Gestão de Qualidade

Este é um aplicativo de gestão de qualidade desenvolvido em React com TypeScript e Vite, utilizando Supabase como backend.

## Funcionalidades

- **Dashboard**: Visualização de dados com gráficos interativos
- **Inspeções**: Registro e acompanhamento de inspeções de qualidade
- **Registros**: Gerenciamento de registros de produção
- **Documentação**: Acesso a documentação do sistema
- **Histórico**: Visualização do histórico de atividades
- **Administração**: Gerenciamento de usuários, máquinas e operadores
- **Chat**: Comunicação em tempo real sobre qualidade
- **Relatórios**: Geração de relatórios em PDF

## Executar Localmente

**Pré-requisitos:** Node.js

1. Instale as dependências:
   `npm install`

2. Configure as variáveis de ambiente no arquivo [.env.local](.env.local):
   - `VITE_SUPABASE_URL`: URL do seu projeto Supabase
   - `VITE_SUPABASE_ANON_KEY`: Chave anônima do Supabase

3. Execute o aplicativo:
   `npm run dev`

## Deploy na Vercel

Este projeto usa **Vite**, então as variáveis devem começar com `VITE_`.

Em **Settings → Environment Variables**, crie:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Depois faça um **Redeploy** para aplicar as variáveis no runtime.

## Build para Produção

`npm run build`

## Tecnologias Utilizadas

- React 19
- TypeScript
- Vite
- Supabase
- Recharts
- jsPDF
- Lucide React
