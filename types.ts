
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
  proposed_changes: Record<string, any>;
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
  active: boolean;
  created_at: string;
}

export interface Operator {
  id: string;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
}

export interface Analyst {
  id: string;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
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
  process_data?: any;
  escolha?: EscolhaData;
  created_by_user_id?: string;
  edited_at?: string | null;
  edited_by_user_id?: string | null;
}
