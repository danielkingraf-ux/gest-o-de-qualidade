# Plano: Rastreabilidade de Unidades por OP — Processo Inicial → Produto Acabado → Relatório da Direção

## Problema central

A OP define uma quantidade pedida (ex: 10.000 unid.). A máquina roda uma quantidade
(pode ser diferente — sobra programada ou reimpressão). A analista inspeciona pilha a pilha.
Defeito de **cor** é contado por folha; **todo o resto** é contado por unidade.
Pilhas podem ser segregadas para escolha ou reprovadas. O que sobra segue para produto acabado.
Se o saldo não fechar, a direção precisa saber **quem operou, em qual máquina, o que saiu errado
e qual ação foi tomada** (escolha, reimpressão, descarte). Esse rastreio percorre toda a cadeia
e culmina em um relatório gerencial.

---

## 1. Conceitos e terminologia

| Termo | Definição |
|---|---|
| **OP** | Ordem de produção. Define produto, cliente, quantidade pedida. |
| **Rodada** | Uma execução da máquina para esta OP. Pode haver mais de uma (ex: reimpressão). |
| **Pilha** | Conjunto físico de folhas empilhadas. Unidade de trabalho da analista. |
| **Pilha verificada** | Pilha que passou pela inspeção formal (pode ser amostragem ou 100%). |
| **Pilha em escolha** | Pilha segregada para revisão unidade a unidade antes de decisão. |
| **Reimpressão** | Nova rodada na máquina para repor unidades perdidas. Requer aprovação do supervisor. |
| **Unidades/folha** | Quantas embalagens saem de uma folha (varia por OP). Chave da conversão folha→unidade. |
| **Quantidade rodada** | Total de folhas que efetivamente entraram na máquina nessa rodada. |
| **Saldo da OP** | Aprovadas + Em escolha + Reprovadas = Rodadas. Deve sempre fechar. |

---

## 2. Modelo de dados

### 2.1 Alterações na tabela `orders`

```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS unidades_por_folha  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS folhas_por_pilha    integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS rodadas_realizadas  integer NOT NULL DEFAULT 0;
```

`unidades_por_folha` é o campo-chave de toda a rastreabilidade.
`rodadas_realizadas` incrementa a cada reimpressão aprovada.

### 2.2 Nova tabela `op_reimpressoes`

Registra cada pedido de reimpressão, quem solicitou, motivo, e o que aconteceu.

```sql
CREATE TABLE IF NOT EXISTS op_reimpressoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  inspection_id    uuid REFERENCES inspections(id),          -- inspeção que gerou o pedido
  numero_rodada    integer NOT NULL,                         -- rodada sendo reimpressa
  quantidade_unid  integer NOT NULL,                         -- unidades a reimprimir
  motivo           text NOT NULL,
  solicitada_por   uuid REFERENCES auth.users(id) NOT NULL,
  aprovada_por     uuid REFERENCES auth.users(id),
  status           text NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente', 'aprovada', 'recusada', 'executada')),
  machine_id       uuid REFERENCES machines(id),
  operator_id      uuid REFERENCES operators(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON op_reimpressoes(order_id);
CREATE INDEX ON op_reimpressoes(status);
```

### 2.3 Payload completo do processo inicial (`inspections.observations`)

```json
{
  "schema_version": 2,
  "process_area": "producao_inicial",
  "process_type": "OFFSET",
  "all_operator_ids": ["uuid-operador"],
  "all_analyst_ids": ["uuid-analista"],
  "numero_rodada": 1,

  "producao": {
    "unidades_por_folha": 10,
    "unidades_op": 10000,
    "quantidade_rodada_folhas": 1050,
    "quantidade_rodada_unidades": 10500,
    "folhas_por_pilha": 500,

    "pilhas_total": 3,
    "pilhas_verificadas": 3,
    "pilhas_aprovadas": 2,
    "pilhas_segregadas_escolha": 1,
    "pilhas_reprovadas": 0
  },

  "defeitos": {
    "por_folha": {
      "cor": 12
    },
    "por_unidade": {
      "manchas": 35,
      "pintas": 10,
      "fiapos": 5,
      "registro": 8,
      "falha_verniz": 3,
      "falha_texto": 1,
      "texto_fechado": 0
    }
  },

  "saldo_unidades": {
    "rodadas":    10500,
    "aprovadas":   4850,
    "em_escolha":  5000,
    "reprovadas":   150,
    "divergencia":    500,
    "alerta_divergencia": true
  },

  "metricas_falha": {
    "cor_folhas_com_defeito": 12,
    "cor_unidades_equivalentes": 120,
    "taxa_cor_por_folha": 1.14,
    "falhas_por_unidade": 62,
    "taxa_unidade": 1.28,
    "taxa_combinada": 2.48
  },

  "reimpressao_solicitada": false,
  "reimpressao_id": null,

  "regra_aprovacao": {
    "mode": "percent",
    "restrictedLimit": 2,
    "rejectLimit": 5
  },

  "status_final": "RESTRICTED",
  "observacoes_analista": ""
}
```

**Invariante do saldo:**
```
aprovadas + em_escolha + reprovadas = quantidade_rodada_unidades
divergencia = rodadas − (aprovadas + em_escolha + reprovadas)
```

### 2.4 Payload do produto acabado

```json
{
  "schema_version": 2,
  "process_area": "produto_acabado",
  "process_type": "ACABAMENTO",
  "all_operator_ids": ["uuid"],
  "all_analyst_ids": ["uuid"],

  "entrada_processo": {
    "op_initial_inspection_id": "uuid",
    "unidades_aprovadas_inicial": 4850,
    "unidades_em_escolha_resolvidas": 4800,
    "unidades_descartadas_escolha": 200,
    "total_entrada": 9650
  },

  "producao": {
    "unidades_por_folha": 10,
    "pilhas_total": 20,
    "pilhas_verificadas": 20,
    "pilhas_aprovadas": 19,
    "pilhas_reprovadas": 1
  },

  "defeitos": {
    "por_unidade": {
      "manchas": 15, "rasgado": 3, "amassado": 5
    }
  },

  "saldo_unidades": {
    "entrada":       9650,
    "aprovadas":     9400,
    "com_restricao":   50,
    "reprovadas":      200,
    "divergencia":      0
  },

  "status_final": "RESTRICTED"
}
```

---

## 3. Lógica de cálculo

### 3.1 Conversão folha → unidade para Cor

```
unidades_perdidas_cor = defeitos.por_folha.cor × unidades_por_folha
```

### 3.2 Taxa de falha combinada

```
total_falhas = unidades_perdidas_cor + Σ(defeitos.por_unidade)
taxa_falha   = (total_falhas / quantidade_rodada_unidades) × 100
```

### 3.3 Saldo de pilhas e unidades

```
unidades_em_escolha = pilhas_segregadas_escolha × folhas_por_pilha × unidades_por_folha
unidades_aprovadas  = quantidade_rodada_unidades − unidades_em_escolha − unidades_reprovadas
divergencia         = quantidade_rodada_unidades − (aprovadas + em_escolha + reprovadas)
```

### 3.4 Status resultante

| Condição | Status |
|---|---|
| `taxa_falha < restrictedLimit` e `divergencia == 0` e sem pilhas em escolha | APPROVED |
| `taxa_falha ∈ [restrictedLimit, rejectLimit)` | RESTRICTED |
| `pilhas_segregadas > 0` | RESTRICTED (escolha pendente) |
| `taxa_falha >= rejectLimit` | REJECTED |
| `divergencia ≠ 0` (qualquer status) | + alerta obrigatório |

### 3.5 Quando a reimpressão é acionada

- Status REJECTED **ou** unidades aprovadas < quantidade mínima entregável da OP
- Analista informa motivo e quantidade necessária
- Supervisor aprova ou recusa via `SupervisorView`
- Se aprovada: cria nova inspeção com `numero_rodada = 2`, vinculada à mesma OP

---

## 4. UI — InspectionView

### 4.1 Bloco OP — campos novos

```
┌──────────────────────────────────────────────────────────────────┐
│  ORDEM DE PRODUÇÃO                                                │
│                                                                   │
│  [Selecionar OP...]      [Unidades/folha  10]  [Folhas/pilha 500] │
│  OP: 2024-001  Cliente: Empresa XYZ  Qtd. pedida: 10.000 unid.   │
│  Rodada: 1ª                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Bloco de produção — campos novos

```
┌──────────────────────────────────────────────────────┐
│  PRODUÇÃO — RODADA 1                                  │
│                                                       │
│  Folhas rodadas:   [1050]   → 10.500 unid. rodadas   │
│  Pilhas na bancada: [  3]                             │
│  Pilhas verificadas:[  3]   ← obrigatório             │
└──────────────────────────────────────────────────────┘
```

`pilhas_verificadas` não pode ser maior que `pilhas_total`.
Se `pilhas_verificadas < pilhas_total`: exibe aviso "Inspeção parcial — amostragem registrada".

### 4.3 Defeitos separados por tipo de contagem

**Por Folha** (somente Cor)
```
  [Cor  −  12  +]   →  equivale a 120 unidades (12 × 10 unid./folha)
```

**Por Unidade** (todos os demais)
```
  [Manchas −35+] [Pintas −10+] [Fiapos −5+] [Registro −8+]
  [Falha Verniz −3+] [Falha Texto −1+] [Texto Fechado −0+] [Refugo −0+]
```

### 4.4 Bloco de pilhas

```
┌───────────────────────────────────────────────────────┐
│  DISTRIBUIÇÃO DE PILHAS                                │
│                                                       │
│  Pilhas aprovadas:     [  2]  → 10.000 unid.          │
│  Pilhas p/ escolha:    [  1]  →  5.000 unid.          │
│  Pilhas reprovadas:    [  0]  →      0 unid.          │
│                                                       │
│  Total verificado:  15.000 unid.  Rodadas: 10.500     │
│  ⚠ Divergência:  500 unidades — revise os campos     │
└───────────────────────────────────────────────────────┘
```

### 4.5 Painel de saldo (calculado em tempo real)

```
┌────────────────────────────────────────────────────────────┐
│  SALDO DA OP                         Rodada 1 de X         │
│                                                            │
│  Qtd. pedida:   10.000   Qtd. rodada:   10.500            │
│                                                            │
│  Aprovadas:      4.850   ██████████░  46%                 │
│  Em escolha:     5.000   ██████████░  48%                 │
│  Reprovadas:       150   █░░░░░░░░░░   1%                 │
│                         ─────────────────                  │
│  Divergência:      500   ⚠ Não fecha                      │
│                                                            │
│  Taxa de falha:  2,48%  →  APROVADO COM RESTRIÇÃO         │
└────────────────────────────────────────────────────────────┘
```

### 4.6 Ação pós-save: solicitar reimpressão

Aparece automaticamente se `status_final == REJECTED` ou `aprovadas < unidades_minimas_op`:

```
┌──────────────────────────────────────────────────────────┐
│  ⚠ QUANTIDADE INSUFICIENTE PARA A OP                     │
│                                                          │
│  Pedido: 10.000  |  Aprovadas até agora: 4.850           │
│  Faltam: 5.150 unidades para fechar a OP                 │
│                                                          │
│  [Solicitar Reimpressão]   Motivo: [____________]        │
│  Qtd. a reimprimir: [5.200]  (inclui margem)             │
│                                                          │
│  Aguarda aprovação do supervisor.                        │
└──────────────────────────────────────────────────────────┘
```

---

## 5. UI — FinishingAnalysisView

### 5.1 Banner de entrada com histórico de rodadas

```
┌─────────────────────────────────────────────────────────────────┐
│  HISTÓRICO DO PROCESSO INICIAL — OP 2024-001                    │
│                                                                 │
│  Rodada 1 · 07/05  · CD2 · EDSON · Analista: MARCIA            │
│    Rodadas: 10.500 unid.  Aprovadas: 4.850  Em escolha: 5.000  │
│    Status: APROVADO COM RESTRIÇÃO                               │
│                                                                 │
│  Rodada 2 · 08/05  · CD2 · EDER  · Analista: MARCIA            │
│    (Reimpressão — aprovada por: SUPERVISOR)                     │
│    Rodadas:  5.200 unid.  Aprovadas: 5.100  Reprovadas: 100     │
│    Status: APROVADO                                             │
│                                                                 │
│  TOTAL DISPONÍVEL PARA ESTE SETOR:  9.950 unid.               │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Painel de saldo do produto acabado

Idêntico ao do processo inicial, mas com `entrada_processo.total_entrada` como base.
Alerta se `total_entrada > unidades_op` (chegou mais do que o pedido — possível troca).

---

## 6. Relatório da Direção

Este relatório não é o laudo técnico. É o relatório gerencial de **accountability e eficiência**.

### 6.1 Estrutura do relatório

```
════════════════════════════════════════════════════════════════
  KINGRAF — RELATÓRIO GERENCIAL DE PRODUÇÃO
  Período: 01/05/2026 a 07/05/2026   Gerado em: 07/05/2026 09:00
════════════════════════════════════════════════════════════════

1. RESUMO EXECUTIVO

  OPs no período:          12
  Unidades pedidas:    98.000
  Unidades entregues:  94.200   (96,1%)
  Unidades perdidas:    3.800   ( 3,9%)
  Reimpressões:             3
  OPs com escolha:          5
  OPs reprovadas:           1

──────────────────────────────────────────────────────────────

2. DETALHAMENTO POR OP

  OP         Cliente     Pedido    Entregue   Perda   Ações
  2024-001   Emp. XYZ    10.000     9.950      50     Escolha
  2024-002   Emp. ABC     8.000     7.200     800     Reimpressão
  2024-003   Emp. DEF     5.000     4.900     100     —
  ...

──────────────────────────────────────────────────────────────

3. PROBLEMAS POR OPERADOR

  Operador   Máquina   OPs   Defeito Principal     Taxa Média   Ações Geradas
  EDSON      CD2        4    Cor (por folha)         1,8%        1 escolha
  EDER       BABY 1     3    Manchas (por unidade)   2,3%        1 reimpressão
  MARCOS     CD3        2    Registro                0,9%        —

  → Indica: EDER / BABY 1 exige atenção. Taxa acima da média do período (1,6%).

──────────────────────────────────────────────────────────────

4. PROBLEMAS POR MÁQUINA

  Máquina   Operadores   OPs   Defeito Recorrente   Taxa   Paradas
  CD2           2         5    Cor                  1,6%      0
  BABY 1        2         4    Manchas              2,1%      0
  CD3           1         2    Registro             0,9%      0

  → Indica: BABY 1 com taxa acima do período. Verificar regulagem.

──────────────────────────────────────────────────────────────

5. REIMPRESSÕES REALIZADAS

  OP         Rodada   Motivo                Solicitante   Aprovador   Qtd.
  2024-002     2      Taxa reprovação 6,2%  EDER          SUPERVISOR  5.200 unid.
  2024-007     2      Cor acima do limite   MARCOS        SUPERVISOR  3.000 unid.
  2024-009     2      Divergência de saldo  EDSON         SUPERVISOR  1.500 unid.

──────────────────────────────────────────────────────────────

6. PROCESSOS DE ESCOLHA

  OP         Pilhas Segregadas   Unidades   Resultado     Operador
  2024-001        1              5.000      4.800 aprov.  EDSON / CD2
  2024-004        2             10.000      9.500 aprov.  EDER / BABY 1
  2024-005        1              2.500      2.200 aprov.  MARCOS / CD3

──────────────────────────────────────────────────────────────

7. INDICADORES CONSOLIDADOS

  Eficiência de produção:    94,1%   (unidades entregues / pedidas)
  Taxa média de defeitos:     1,9%
  Taxa de escolha:            5,1%   (unid. em escolha / total rodado)
  Taxa de reimpressão:        3,1%   (OPs com reimpressão / total OPs)
  Aprovação sem restrição:   75,0%   (OPs com status APPROVED)
════════════════════════════════════════════════════════════════
```

### 6.2 Origem dos dados de cada seção

| Seção | Fonte |
|---|---|
| Resumo executivo | Agrega `inspections` + `op_reimpressoes` por período |
| Detalhamento por OP | `orders` JOIN `inspections` (saldo_unidades) |
| Problemas por operador | `inspections.all_operator_ids` + `metricas_falha` |
| Problemas por máquina | `inspections.machine_id` + `metricas_falha` |
| Reimpressões | `op_reimpressoes` WHERE `status = 'executada'` |
| Processos de escolha | `inspections` WHERE `saldo_unidades.em_escolha > 0` |
| Indicadores | Calculados no frontend a partir das queries acima |

### 6.3 Gatilho de geração

Novo botão **"Relatório Gerencial"** no `DashboardView` (supervisor) com filtro de período.
Também acessível via `ReportsView`.

---

## 7. Alertas automáticos

### 7.1 Alertas em `shift_logs` ao salvar inspeção

| Gatilho | Tipo | Texto gerado |
|---|---|---|
| `taxa_falha > rejectLimit` | `critical` | `[OP:X] REPROVADO — Taxa ${taxa}% · Operador: ${nome} · Máquina: ${maq}` |
| `taxa_falha > restrictedLimit` | `alert` | `[OP:X] Restrição — Taxa ${taxa}% · Operador: ${nome} · Máquina: ${maq}` |
| `pilhas_em_escolha > 0` | `alert` | `[OP:X] ${n} pilha(s) segregada(s) para escolha — ${unid} unid. · Operador: ${nome}` |
| `divergencia ≠ 0` | `alert` | `[OP:X] Divergência de saldo: ${div} unid. não contabilizadas · Analista: ${nome}` |
| `aprovadas < unidades_minimas_op` | `critical` | `[OP:X] Qtd. insuficiente — ${aprovadas}/${pedido} unid. · Reimpressão pode ser necessária` |
| Reimpressão solicitada | `info` | `[OP:X] Reimpressão solicitada por ${nome} — ${qtd} unid. · Aguarda aprovação` |
| Reimpressão aprovada | `info` | `[OP:X] Reimpressão aprovada por ${supervisor} — Rodada ${n} autorizada` |

---

## 8. Sequência de implementação

### Fase 1 — Banco e tipos (1–2 dias)
- [ ] Migration: `orders.unidades_por_folha`, `orders.folhas_por_pilha`, `orders.rodadas_realizadas`
- [ ] Migration: tabela `op_reimpressoes` com RLS
- [ ] Interfaces TypeScript: `ProducaoTracking`, `SaldoUnidades`, `MetricasFalha`, `OpReimpressao`
- [ ] Atualizar `Order` em `types.ts`

### Fase 2 — InspectionView (3–4 dias)
- [ ] Campos `unidades_por_folha`, `folhas_por_pilha`, `quantidade_rodada_folhas` no bloco OP
- [ ] Indicador de rodada (Rodada 1, Rodada 2...)
- [ ] Separar defeitos: bloco "por folha" (só Cor) e bloco "por unidade" (demais)
- [ ] Bloco de distribuição de pilhas com `pilhas_verificadas`
- [ ] Painel de saldo em tempo real (`useMemo`)
- [ ] Alerta inline de divergência
- [ ] Ação pós-save: formulário de reimpressão quando insuficiente
- [ ] Salvar payload completo com todos os novos campos

### Fase 3 — Alertas e reimpressão (1–2 dias)
- [ ] `createAlert` em todos os gatilhos da §7
- [ ] Criar registro em `op_reimpressoes` ao solicitar
- [ ] Aprovar/recusar reimpressão via `SupervisorView`
- [ ] Ao aprovar: incrementar `orders.rodadas_realizadas`

### Fase 4 — FinishingAnalysisView (1–2 dias)
- [ ] Banner com histórico de todas as rodadas da OP
- [ ] Cálculo de `total_entrada` consolidado
- [ ] Alerta de divergência na entrada
- [ ] Painel de saldo do produto acabado
- [ ] Salvar `entrada_processo` no payload

### Fase 5 — Relatório da Direção (2–3 dias)
- [ ] Query de agregação por período (operador, máquina, OP)
- [ ] Novo template PDF gerencial em `reportService`
- [ ] Seções: resumo, por OP, por operador, por máquina, reimpressões, escolhas, indicadores
- [ ] Botão no Dashboard com filtro de período

---

## 9. Regras de negócio imutáveis

1. **Cor = por folha.** Todo o resto = por unidade. Sem exceção.
2. **Saldo sempre fecha:** `aprovadas + em_escolha + reprovadas = quantidade_rodada_unidades`. Divergência é registrada mas gera alerta obrigatório.
3. **Pilhas verificadas ≤ pilhas total.** Inspeção parcial é permitida mas registrada explicitamente.
4. **Reimpressão exige aprovação do supervisor.** Analista solicita, supervisor autoriza.
5. **Escolha não é aprovação.** Pilha em escolha permanece pendente até resolução registrada.
6. **Produto acabado recebe apenas aprovadas + escolha resolvida.** Unidades reprovadas não transitam.
7. **Operador e máquina são obrigatórios em toda inspeção.** São o eixo do relatório da direção.
8. **Cada rodada é uma inspeção independente.** Vinculada à OP, com `numero_rodada` explícito.
