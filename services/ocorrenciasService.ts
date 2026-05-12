import { supabase } from './supabase';
import type {
  OcorrenciaOp,
  OcorrenciaOpComentario,
  OcorrenciaOpInsert,
  OcorrenciaOpStatus,
  OcorrenciaOpUpdate,
} from '../types';

const TABLE = 'ocorrencias_op';
const COMMENTS_TABLE = 'ocorrencias_op_comentarios';

export const OCORRENCIA_TIPO_OPTIONS = [
  { value: 'qualidade', label: 'Ocorrência de qualidade' },
  { value: 'material_bloqueado', label: 'Material bloqueado' },
  { value: 'envio_escolha', label: 'Envio para escolha' },
  { value: 'divergencia_quantidade', label: 'Divergência de quantidade' },
  { value: 'solicitacao_aprovacao', label: 'Solicitação de aprovação' },
  { value: 'reimpressao', label: 'Reimpressão' },
  { value: 'expedicao', label: 'Expedição' },
  { value: 'observacao_geral', label: 'Observação geral' },
] as const;

export const OCORRENCIA_PRIORIDADE_OPTIONS = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
] as const;

export const OCORRENCIA_STATUS_OPTIONS: Array<{ value: OcorrenciaOpStatus; label: string }> = [
  { value: 'aberta', label: 'Aberta' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'aguardando_decisao', label: 'Aguardando decisão' },
  { value: 'resolvida', label: 'Resolvida' },
  { value: 'cancelada', label: 'Cancelada' },
];

export const ocorrenciasService = {
  async list() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as OcorrenciaOp[];
  },

  async create(payload: OcorrenciaOpInsert) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as OcorrenciaOp;
  },

  async update(id: string, payload: OcorrenciaOpUpdate) {
    const updatePayload = {
      ...payload,
      resolved_at: payload.status === 'resolvida' ? new Date().toISOString() : undefined,
    };
    const { data, error } = await supabase
      .from(TABLE)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as OcorrenciaOp;
  },

  async listComments(ocorrenciaId: string) {
    const { data, error } = await supabase
      .from(COMMENTS_TABLE)
      .select('*')
      .eq('ocorrencia_id', ocorrenciaId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as OcorrenciaOpComentario[];
  },

  async addComment(ocorrenciaId: string, comentario: string, createdBy: string | null) {
    const { data, error } = await supabase
      .from(COMMENTS_TABLE)
      .insert({ ocorrencia_id: ocorrenciaId, comentario, created_by: createdBy })
      .select()
      .single();
    if (error) throw error;
    return data as OcorrenciaOpComentario;
  },
};
