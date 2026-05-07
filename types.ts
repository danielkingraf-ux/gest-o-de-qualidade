
export type UserRole = 'analista' | 'supervisor';

export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type EditRequestStatus = 'pending' | 'approved' | 'rejected';

export interface EditRequest {
  id: string;
  inspection_id: string;
  requested_by: string;
  reason: string;
  proposed_changes: Record<string, unknown>;
  status: EditRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  // Joined
  inspections?: InspectionRecord;
  requester_profile?: UserProfile;
}

export enum ProcessType {
  OFFSET = 'OFFSET',
  UV = 'UV',
  HOT_STAMPING = 'HOT_STAMPING',
  ESCOLHAS = 'ESCOLHAS',
  ACABAMENTO = 'ACABAMENTO'
}

export enum InspectionStatus {
  APPROVED = 'APPROVED',
  RESTRICTED = 'RESTRICTED',
  REJECTED = 'REJECTED'
}

export interface Defect {
  id: string;
  name: string;
  count: number;
  description?: string;
  icon: string;
}

export interface Machine {
  id: string;
  name: string;
  code: string;
  area: ProductionArea;
  active: boolean;
  created_at: string;
}

export interface Operator {
  id: string;
  name: string;
  code: string;
  area: ProductionArea;
  active: boolean;
  created_at: string;
}

export type AnalystTipo = 'impressao' | 'acabamento' | 'ambos';
export type ProductionArea = 'producao_inicial' | 'produto_acabado' | 'ambos';

export interface Analyst {
  id: string;
  name: string;
  email: string;
  tipo: AnalystTipo;
  active: boolean;
  created_at: string;
}

export type OrderStatus = 'em_producao' | 'concluido' | 'suspenso';

export interface Order {
  id: string;
  op: string;
  cliente: string;
  produto: string;
  descricao?: string;
  qtd_total: number;
  status: OrderStatus;
  unidades_por_folha: number;
  folhas_por_pilha: number;
  rodadas_realizadas: number;
  created_by_user_id?: string;
  created_at: string;
  updated_at: string;
}

export type ReimpressaoStatus = 'pendente' | 'aprovada' | 'recusada' | 'executada';

export interface OpReimpressao {
  id: string;
  order_id: string;
  inspection_id: string | null;
  numero_rodada: number;
  quantidade_unid: number;
  motivo: string;
  solicitada_por: string;
  aprovada_por: string | null;
  status: ReimpressaoStatus;
  machine_id: string | null;
  operator_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  orders?: Order;
  machines?: Machine;
  operators?: Operator;
}

// ─── Payload do processo inicial (inspections.observations) ─────────────────

export interface ProducaoTracking {
  unidades_por_folha: number;
  unidades_op: number;
  quantidade_rodada_folhas: number;
  quantidade_rodada_unidades: number;
  folhas_por_pilha: number;
  folhas_verificadas: number;
  folhas_aprovadas: number;
  folhas_escolha: number;
  folhas_reprovadas: number;
}

export interface DefeitosTracking {
  por_folha: {
    cor: number;
  };
  por_unidade: Record<string, number>;
}

export interface SaldoUnidades {
  rodadas: number;
  aprovadas: number;
  em_escolha: number;
  reprovadas: number;
  divergencia: number;
  alerta_divergencia: boolean;
}

export interface MetricasFalha {
  cor_folhas_com_defeito: number;
  cor_unidades_equivalentes: number;
  taxa_cor_por_folha: number;
  falhas_por_unidade: number;
  taxa_unidade: number;
  taxa_combinada: number;
}

export interface InspectionObservationsV2 {
  schema_version: 2;
  process_area: 'producao_inicial' | 'produto_acabado';
  process_type: string;
  all_operator_ids: string[];
  all_analyst_ids: string[];
  numero_rodada: number;
  producao: ProducaoTracking;
  defeitos: DefeitosTracking;
  saldo_unidades: SaldoUnidades;
  metricas_falha: MetricasFalha;
  reimpressao_solicitada: boolean;
  reimpressao_id: string | null;
  regra_aprovacao: {
    mode: 'percent' | 'quantity';
    restrictedLimit: number;
    rejectLimit: number;
  };
  status_final: 'APPROVED' | 'RESTRICTED' | 'REJECTED';
  observacoes_analista: string;
}

// ─── Payload do produto acabado ──────────────────────────────────────────────

export interface EntradaProcesso {
  op_initial_inspection_id: string;
  unidades_aprovadas_inicial: number;
  unidades_em_escolha_resolvidas: number;
  unidades_descartadas_escolha: number;
  total_entrada: number;
}

export interface InspectionObservationsFinishing {
  schema_version: 2;
  process_area: 'produto_acabado';
  process_type: string;
  all_operator_ids: string[];
  all_analyst_ids: string[];
  entrada_processo: EntradaProcesso;
  producao: Pick<ProducaoTracking, 'unidades_por_folha' | 'pilhas_total' | 'pilhas_verificadas' | 'pilhas_aprovadas' | 'pilhas_reprovadas'>;
  defeitos: { por_unidade: Record<string, number> };
  saldo_unidades: {
    entrada: number;
    aprovadas: number;
    com_restricao: number;
    reprovadas: number;
    divergencia: number;
  };
  status_final: 'APPROVED' | 'RESTRICTED' | 'REJECTED';
}

export interface DefectType {
  id: string;
  name: string;
  icon: string;
  active: boolean;
  created_at: string;
}

export interface EscolhaData {
  op_total_unidades: number;
  folhas_impressas_total: number;
  folhas_revisadas_pilha: number;
  escolhas_unidades: number;
  observacoes?: string;
}

export interface InspectionRecord {
  id: string;
  op: string;
  machine_id: string;
  operator_id: string;
  analyst_id: string;
  process_type: ProcessType;
  status: InspectionStatus;
  timestamp: string;
  defects: Defect[];
  totalDefects: number;
  rework_count: number;
  samples_count: number;
  observations: string;
  machines?: Machine;
  operators?: Operator;
  analysts?: Analyst;
  process_data?: Record<string, unknown>;
  escolha?: EscolhaData;
  created_by_user_id?: string;
  edited_at?: string | null;
  edited_by_user_id?: string | null;
}
