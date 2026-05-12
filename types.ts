
export type UserRole =
  | 'administrador'
  | 'direcao'
  | 'supervisao'
  | 'analista_qualidade'
  | 'revisao_escolha'
  | 'expedicao'
  | 'consulta_auditoria'
  | 'analista'
  | 'supervisor'
  | 'auxiliar';

export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  role: UserRole;
  active: boolean;
  can_approve_critical_actions?: boolean;
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
  REJECTED = 'REJECTED',
  PENDING_CLOSURE = 'PENDING_CLOSURE'
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

export type EscolhaRevisaoStatus =
  | 'aberta'
  | 'em_revisao'
  | 'parcialmente_revisada'
  | 'finalizada'
  | 'bloqueada'
  | 'liberada';

export type DestinoMaterialBom =
  | 'volta_corte_vinco'
  | 'volta_destaque'
  | 'volta_colagem'
  | 'liberado_expedicao'
  | 'fica_bloqueado'
  | 'outro';

export type OrigemProblemaEscolha =
  | 'impressao'
  | 'verniz_uv'
  | 'hot_stamping'
  | 'corte_vinco'
  | 'outro';

export interface EscolhaRevisaoRegistro {
  id: string;
  op: string;
  cliente: string | null;
  produto: string | null;
  origem_escolha: string;
  setor_detectado: string;
  motivo_escolha: string;
  tipo_defeito: string;
  classificacao_defeito: string;
  quantidade_enviada: number;
  responsavel_envio_id: string | null;
  responsavel_envio_nome: string | null;
  entrada_at: string;
  status: EscolhaRevisaoStatus;
  responsavel_revisao_id: string | null;
  responsavel_revisao_nome: string | null;
  quantidade_revisada: number;
  quantidade_boa_recuperada: number;
  quantidade_refugada: number;
  quantidade_pendente: number;
  revisao_at: string | null;
  observacao: string | null;
  destino_material_bom: DestinoMaterialBom | null;
  outro_destino: string | null;
  origem_registro_tabela: string | null;
  origem_registro_id: string | null;
  origem_tela: string | null;
  origem_problema: OrigemProblemaEscolha | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EscolhaRevisaoInsert = Omit<EscolhaRevisaoRegistro, 'id' | 'created_at' | 'updated_at'>;
export type EscolhaRevisaoUpdate = Partial<EscolhaRevisaoInsert>;

export type OcorrenciaOpTipo =
  | 'qualidade'
  | 'material_bloqueado'
  | 'envio_escolha'
  | 'divergencia_quantidade'
  | 'solicitacao_aprovacao'
  | 'reimpressao'
  | 'expedicao'
  | 'observacao_geral';

export type OcorrenciaOpPrioridade = 'baixa' | 'media' | 'alta' | 'critica';
export type OcorrenciaOpStatus = 'aberta' | 'em_analise' | 'aguardando_decisao' | 'resolvida' | 'cancelada';

export interface OcorrenciaOp {
  id: string;
  op: string;
  titulo: string;
  tipo: OcorrenciaOpTipo;
  setor_origem: string;
  prioridade: OcorrenciaOpPrioridade;
  status: OcorrenciaOpStatus;
  responsavel_user_id: string | null;
  descricao: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  creator_name?: string | null;
  responsavel_name?: string | null;
}

export type OcorrenciaOpInsert = Omit<OcorrenciaOp, 'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'creator_name' | 'responsavel_name'>;
export type OcorrenciaOpUpdate = Partial<Pick<OcorrenciaOp, 'titulo' | 'tipo' | 'setor_origem' | 'prioridade' | 'status' | 'responsavel_user_id' | 'descricao'>>;

export interface OcorrenciaOpComentario {
  id: string;
  ocorrencia_id: string;
  comentario: string;
  created_by: string | null;
  created_at: string;
  creator_name?: string | null;
}

// ─── Payload do processo inicial (inspections.observations) ─────────────────

export interface ProducaoTracking {
  unidades_por_folha: number;
  unidades_op: number;
  quantidade_rodada_folhas: number;
  quantidade_rodada_unidades: number;
  folhas_por_pilha: number;
  pilhas_total: number;
  pilhas_verificadas: number;
  pilhas_aprovadas: number;
  pilhas_reprovadas: number;
  folhas_verificadas: number;
  folhas_aprovadas: number;
  folhas_escolha: number;
  folhas_reprovadas: number;
  unidades_aprovadas?: number;
  unidades_escolha?: number;
  unidades_reprovadas?: number;
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
  status_final: 'APPROVED' | 'RESTRICTED' | 'REJECTED' | 'PENDING_CLOSURE';
  observacoes_analista: string;
  envio_escolha?: Array<{
    origem_problema: OrigemProblemaEscolha;
    motivo_escolha: string;
    tipo_defeito: string;
    classificacao_defeito: string;
    quantidade_enviada: number;
    observacao?: string | null;
    escolha_revisao_id?: string | null;
  }>;
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
  status_final: 'APPROVED' | 'RESTRICTED' | 'REJECTED' | 'PENDING_CLOSURE';
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
