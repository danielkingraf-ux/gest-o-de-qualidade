import { supabase } from './supabase';

export type QualityStatus = 'APPROVED' | 'RESTRICTED' | 'REJECTED' | 'IN_PROGRESS';
export type ProcessKey = 'OFFSET' | 'ESCOLHAS' | 'UV' | 'HOT_STAMPING' | 'FINISHED_REPORT' | 'NBR_6425';
export type AlertLevel = 'alert' | 'critical';

export interface MasterItem {
  id: string;
  name: string;
  code?: string;
  email?: string;
  active?: boolean;
}

export interface QualityPayload {
  schema_version: 2;
  op: string;
  process: ProcessKey;
  process_label: string;
  sector: 'START_PRODUCTION' | 'FINISHED_PRODUCT';
  shift: string;
  status: QualityStatus;
  defects: Record<string, number>;
  metrics: Record<string, number | string>;
  product?: Record<string, string | number>;
  physical_tests?: Record<string, { found: string; limit: string }>;
  nbr?: {
    lot_size: number;
    sample_size: number;
    critical: Record<string, number>;
    major: Record<string, number>;
    minor: Record<string, number>;
  };
  notes?: string;
  all_operator_ids: string[];
  all_analyst_ids: string[];
}

export interface QualityRecord {
  id: string;
  op: string;
  created_at: string;
  machine_id: string | null;
  operator_id: string | null;
  analyst_id: string | null;
  status: QualityStatus;
  rework_count: number | null;
  samples_count: number | null;
  observations: string | null;
  machines?: MasterItem | null;
  operators?: MasterItem | null;
  analysts?: MasterItem | null;
  payload: QualityPayload | null;
}

export interface ShiftAlert {
  id: string;
  created_at: string;
  user_email: string;
  user_id: string;
  content: string;
  type: AlertLevel | 'info';
  shift: string;
  op: string | null;
}

const parsePayload = (observations: string | null): QualityPayload | null => {
  if (!observations) return null;
  try {
    const parsed = JSON.parse(observations) as QualityPayload;
    return parsed.schema_version === 2 ? parsed : null;
  } catch {
    return null;
  }
};

const getShift = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Manha';
  if (hour >= 14 && hour < 22) return 'Tarde';
  return 'Noite';
};

export const qualityService = {
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return supabase.auth.onAuthStateChange(callback);
  },

  async signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  async signOut() {
    return supabase.auth.signOut();
  },

  async getMasterData() {
    const [machines, operators, analysts] = await Promise.all([
      supabase.from('machines').select('id, name, code, active').eq('active', true).order('name'),
      supabase.from('operators').select('id, name, code, active').eq('active', true).order('name'),
      supabase.from('analysts').select('id, name, email, active').eq('active', true).order('name'),
    ]);

    if (machines.error) throw machines.error;
    if (operators.error) throw operators.error;
    if (analysts.error) throw analysts.error;

    return {
      machines: (machines.data || []) as MasterItem[],
      operators: (operators.data || []) as MasterItem[],
      analysts: (analysts.data || []) as MasterItem[],
    };
  },

  async createMachine(name: string) {
    const code = name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 24);
    return supabase.from('machines').insert([{ name: name.trim(), code, active: true }]).select().single();
  },

  async createOperator(name: string) {
    const code = name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 24);
    return supabase.from('operators').insert([{ name: name.trim(), code, active: true }]).select().single();
  },

  async createAnalyst(name: string, email: string) {
    return supabase
      .from('analysts')
      .insert([{ name: name.trim(), email: email.trim().toLowerCase(), active: true }])
      .select('id, name, email, active')
      .single();
  },

  async ensureAnalyst(email: string, name?: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('analysts')
      .select('id, name, email, active')
      .eq('email', email)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existing) return existing as MasterItem;

    const fallbackName = name || email.split('@')[0];
    const { data, error } = await supabase
      .from('analysts')
      .insert([{ name: fallbackName, email, active: true }])
      .select('id, name, email, active')
      .single();

    if (error) throw error;
    return data as MasterItem;
  },

  async listRecords() {
    const { data, error } = await supabase
      .from('inspections')
      .select('*, machines(name, code), operators(name, code), analysts(name, email)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return ((data || []) as Omit<QualityRecord, 'payload'>[]).map((record) => ({
      ...record,
      payload: parsePayload(record.observations),
    })) as QualityRecord[];
  },

  async createRecord(input: {
    op: string;
    machineId: string;
    operatorIds: string[];
    analystIds: string[];
    status: QualityStatus;
    samplesCount: number;
    rejectedCount: number;
    payload: QualityPayload;
  }) {
    const { error } = await supabase.from('inspections').insert([{
      op: input.op,
      machine_id: input.machineId,
      operator_id: input.operatorIds[0],
      analyst_id: input.analystIds[0],
      status: input.status,
      samples_count: input.samplesCount,
      rework_count: input.rejectedCount,
      observations: JSON.stringify(input.payload),
      created_at: new Date().toISOString(),
    }]);

    if (error) throw error;
  },

  async listAlerts() {
    const { data, error } = await supabase
      .from('shift_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) throw error;
    return ((data || []) as ShiftAlert[]).map((alert) => {
      const match = alert.content.match(/^\[OP:([^\]]+)\]\s*/);
      return {
        ...alert,
        op: match ? match[1] : null,
        content: alert.content.replace(/^\[OP:[^\]]+\]\s*/, ''),
      };
    });
  },

  async createAlert(input: { op: string; message: string; level: AlertLevel; userId: string; userEmail: string }) {
    const { error } = await supabase.from('shift_logs').insert([{
      user_id: input.userId,
      user_email: input.userEmail,
      type: input.level,
      shift: getShift(),
      content: `[OP:${input.op}] ${input.message.trim()}`,
    }]);

    if (error) throw error;
  },
};
