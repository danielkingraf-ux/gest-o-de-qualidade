# Plataforma de Controle de Qualidade
## Documento de Planejamento — v1.0

---

## 1. Visão Geral

Sistema web para digitalização e rastreabilidade do controle de qualidade em dois setores: **Início de Produção** e **Produto Acabado**. Substitui o preenchimento manual de planilhas, gera relatórios automaticamente, e permite comunicação de alertas entre analistas — tudo rastreado pela Ordem de Produção (OP) em tempo real.

**Princípio central:** o esforço maior é da aplicação, não do usuário. Qualquer pessoa sem experiência em computador deve conseguir operar o sistema.

---

## 2. Princípios de Interface (UX)

- **Formulários em etapas (wizard):** a analista vê uma coisa de cada vez. Cada tela faz uma pergunta só, com botão de avançar/voltar.
- **Contadores visuais para defeitos:** botões grandes de + e − para registrar cada tipo de defeito. Sem digitação de números.
- **Seleção por toque:** máquina, operador, analista, turno — todos por lista ou botão grande. Nenhum campo de texto livre onde houver opção fixa.
- **QR Code por OP:** cada lote recebe um QR Code imprimível. A analista escaneia com celular ou tablet e o formulário já abre preenchido com a OP correta.
- **Cores como linguagem:** verde = aprovado, amarelo = aprovado c/ restrição, vermelho = reprovado, cinza = em andamento. Visível à distância.
- **Confirmação antes de enviar:** resumo de tudo que foi preenchido antes do envio final, com botão "Confirmar" e "Corrigir".
- **Compatível com tablet e celular:** touch-first, botões com área mínima de toque de 48px.

---

## 3. Usuários e Perfis de Acesso

| Perfil | O que pode fazer |
|---|---|
| **Analista — Início de Produção** | Registrar análises de Off-set, UV, Hot Stamping. Criar e visualizar alertas. |
| **Analista — Produto Acabado** | Registrar laudos e análises por classe de defeito (NBR 6425). Criar e visualizar alertas. |
| **Supervisor** | Visualizar todos os registros, alertas e relatórios. Encerrar alertas. Aprovar reinspeções. |
| **Gestão / Diretoria** | Dashboard em tempo real com todas as OPs. Somente leitura. Sem necessidade de navegação. |

---

## 4. Módulo: Início de Produção

### 4.1 Impressão Off-set

**Cabeçalho (seleção por lista ou QR Code):**
- Data (automática)
- OP
- Máquina
- Operador
- Analista (vinculado ao login — preenchido automaticamente)
- Turno (Manhã / Tarde / Noite)

**Desvios (contador + / −):**
- Cor
- Manchas
- Pintas
- Fiapos
- Registro
- Falha verniz
- Falha texto
- Texto fechado

**Resultado:**
- Quantidade de cartuchos reprovados
- Total de amostras em unidades
- Status: Aprovado / Aprovado c/ restrição / Reprovado

---

### 4.2 Lançamento de Escolhas (vinculado à OP da Off-set)

- Quantidade total da OP por unidades
- Quantidade total de folhas impressas
- Quantidade de folhas revisadas (pilha)
- Quantidade de escolhas em unidades
- Status (Aprovado / Aprovado c/ restrição / Reprovado / Reimpressão)
- Analista responsável (automático via login)

---

### 4.3 Impressão UV

**Cabeçalho:**
- Data (automática)
- OP *(novo — não existia na planilha)*
- Máquina
- Operador
- Analista (automático via login)
- Turno

**Desvios (contador + / −):**
- Cor
- Registro
- Falha verniz
- Acabamento áspero

**Resultado:**
- Quantidade de cartuchos reprovados
- Total de amostras em unidades
- Status: Aprovado / Aprovado c/ restrição / Reprovado

---

### 4.4 Hot Stamping

**Cabeçalho:**
- Data (automática)
- OP *(novo — não existia na planilha)*
- Máquina
- Operador
- Analista (automático via login)
- Turno

**Desvios (contador + / −):**
- Falha
- Registro
- Entupimento de texto
- Ausência

**Resultado:**
- Quantidade de cartuchos reprovados
- Total de amostras em unidades
- Status: Aprovado / Aprovado c/ restrição / Reprovado

---

## 5. Módulo: Produto Acabado

### 5.1 Laudo de Análise (FORM 058)

**Identificação:**
- Cliente
- Código do produto
- OP
- Nº do laudo (gerado automaticamente pela plataforma)
- Desenho técnico
- Descrição do material
- Versão
- Nº de facas
- Cartão
- Analista(s) (automático via login)
- Data (automática)

**Amostragem:**
- Nº de amostras
- Quantidade total da OP
- Quantidade analisada
- Nº de análises efetuadas

**Testes físicos (resultado encontrado vs. limite):**
- Espessura (mm)
- Gramatura (g/m²)
- Comprimento (mm)
- Largura (mm)
- Altura (mm)

**Campo livre:**
- Observações

**Foto do defeito (opcional):**
- Câmera do dispositivo ou upload de imagem
- Associada ao laudo e à OP

---

### 5.2 Análise por Classe de Defeito (NBR 6425)

O plano de amostragem é calculado automaticamente pela plataforma com base no tamanho do lote. A analista informa apenas os defeitos encontrados — a plataforma determina o aceite ou reprova por classe conforme a norma.

**CLASSE CRÍTICO** — Aceite zero tolerância
- Colagem incorreta
- Pingo de cola

**CLASSE MAIOR**
- Impressão fora de registro
- Vinco
- Hot stamping descentralizado
- Cor fora do padrão

**CLASSE MENOR**
- Mancha
- Pintas
- Decalque
- Relevo descentralizado
- Hot stamping descentralizado

**Por classe e por rodada (até 3 amostras):**
- Nº da amostra (calculado pela plataforma)
- Quantidade de defeitos encontrados (contador + / −)
- Média (calculada automaticamente)
- Status da rodada: Aceita / Reprova (calculado automaticamente)

**Status final do laudo:** calculado automaticamente com base nas três classes.

---

## 6. Rastreabilidade por OP

A OP é o campo central que conecta todos os módulos. Ao consultar qualquer OP, a plataforma exibe:

- Todos os registros de Off-set, UV e Hot Stamping (início de produção)
- Laudo e análise por classe de defeito (produto acabado)
- Comparativo de ocorrências entre início e produto acabado
- Histórico de alertas vinculados à OP (abertos e encerrados)
- Histórico de reinspeções
- Linha do tempo da OP (do primeiro registro ao laudo final)
- QR Code para impressão

---

## 7. Sistema de Alertas

Comunicação estruturada entre analistas e supervisores, vinculada à OP.

**Fluxo:**
1. Qualquer analista ou supervisor abre um alerta vinculado a uma OP
2. Define o nível: **Atenção** ou **Urgente**
3. Descreve a ocorrência (texto livre)
4. Alerta aparece em destaque no dashboard de todos os usuários do setor
5. Cada usuário confirma leitura — registro de quem leu e quando
6. Supervisor ou analista encerra o alerta com observação de fechamento
7. Histórico completo permanece vinculado à OP

**Notificação automática:** ao reprovar uma OP, um alerta é gerado automaticamente para o supervisor.

---

## 8. Dashboard da Direção (tempo real)

Uma única tela, sem navegação, sem relatório para abrir.

**Visão geral:**
- Cards por OP, coloridos por status (verde / amarelo / vermelho / cinza)
- Filtros rápidos: por data, processo, máquina, operador
- Total de OPs analisadas no dia / semana / mês
- Taxa de aprovação geral e por processo
- Alertas ativos em destaque

**Indicadores visíveis sem clique:**
- Ranking dos desvios mais frequentes
- Ranking de ocorrências por máquina
- Ranking de ocorrências por operador
- Tendência por produto (melhora ou piora ao longo das OPs)

---

## 9. Relatórios Automáticos

Gerados sem configuração. A analista finaliza a análise e o relatório já existe.

**Por período (diário / semanal / mensal):**
- Total de amostras analisadas por setor
- Total de desvios por tipo e por classe
- % de desvio por processo
- Comparativo entre processos

**Por OP:**
- Histórico completo de início ao fim
- Todos os desvios encontrados por etapa
- Status de cada processo
- Alertas vinculados
- Histórico de reinspeções

**Exportação:** PDF e Excel

---

## 10. Funcionalidades Adicionais

### 10.1 Cálculo automático NBR 6425
A plataforma consulta a Tabela 2 da norma internamente. A analista informa o tamanho do lote e os defeitos encontrados. O sistema determina automaticamente: tamanho da amostra, número de aceitação, número de rejeição e o veredito por classe.

### 10.2 Foto do defeito
Campo opcional em qualquer análise. A analista tira foto pelo celular/tablet ou faz upload. A imagem fica associada ao laudo e à OP. Consultável no histórico.

### 10.3 QR Code por OP
Cada OP gera um QR Code imprimível. Ao escanear, o formulário abre no processo correto com a OP preenchida. Elimina digitação e erro de número de OP.

### 10.4 Reinspeção rastreada
Quando uma OP é reprovada, o supervisor pode abrir um processo de reinspeção. A plataforma registra: quem reinspecionou, quando, resultado, e vincula ao histórico original da OP.

### 10.5 Indicador de tendência por produto
Gráfico por código de produto mostrando a evolução da qualidade OP a OP em ordem cronológica. Identifica se um problema é pontual ou recorrente.

---

## 11. Melhorias Futuras (fora do escopo atual)

- **Consulta pelo operador:** o operador do processo inicial pode consultar o status de uma OP antes de iniciar a produção, verificando se há alertas ativos.
- **Integração com ERP:** importar OPs automaticamente do sistema de gestão da empresa.
- **App mobile nativo:** versão instalável para uso offline no chão de fábrica.
- **Assinatura digital do laudo:** validação eletrônica pelo responsável técnico.

---

## 12. Arquitetura Técnica Sugerida

| Componente | Tecnologia sugerida |
|---|---|
| Frontend | React (web responsivo, funciona em tablet e celular) |
| Backend | Node.js ou Python (FastAPI) |
| Banco de dados | PostgreSQL |
| Autenticação | Login com usuário e senha, perfis por setor |
| Hospedagem | On-premise (servidor interno) — garante segurança dos dados conforme LGPD |
| QR Code | Geração automática via biblioteca open source |
| Exportação PDF | Geração server-side |

---

*Documento elaborado com base nas planilhas CEP - Análises Produto Acabado 2026 e NOVO - Indicador Controle do Processo, fichas físicas FORM 058 REV.00 e formulário NBR 6425.*

*Versão 1.0 — Planejamento inicial*