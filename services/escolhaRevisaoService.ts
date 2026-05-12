import { supabase } from './supabase';
import type {
  EscolhaRevisaoInsert,
  EscolhaRevisaoRegistro,
  EscolhaRevisaoStatus,
  EscolhaRevisaoUpdate,
  OrigemProblemaEscolha,
} from '../types';

const TABLE = 'escolha_revisao_registros';

export const ESCOLHA_STATUS_OPTIONS: Array<{ value: EscolhaRevisaoStatus; label: string }> = [
  { value: 'aberta', label: 'Aberta' },
  { value: 'em_revisao', label: 'Em revisão' },
  { value: 'parcialmente_revisada', label: 'Parcialmente revisada' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'bloqueada', label: 'Bloqueada' },
  { value: 'liberada', label: 'Liberada' },
];

export const DESTINO_MATERIAL_OPTIONS = [
  { value: 'volta_corte_vinco', label: 'Volta para corte/vinco' },
  { value: 'volta_destaque', label: 'Volta para destaque' },
  { value: 'volta_colagem', label: 'Volta para colagem' },
  { value: 'liberado_expedicao', label: 'Liberado para expedição' },
  { value: 'fica_bloqueado', label: 'Fica bloqueado' },
  { value: 'outro', label: 'Outro destino' },
] as const;

export const calculateReviewTotals = (
  quantidadeEnviada: number,
  quantidadeBoa: number,
  quantidadeRefugada: number,
) => {
  const quantidadeRevisada = Math.max(0, quantidadeBoa) + Math.max(0, quantidadeRefugada);
  const quantidadePendente = Math.max(0, Math.max(0, quantidadeEnviada) - quantidadeRevisada);
  return { quantidadeRevisada, quantidadePendente };
};

export const validateEscolhaRevisao = (payload: {
  quantidade_enviada: number;
  quantidade_boa_recuperada: number;
  quantidade_refugada: number;
  quantidade_pendente: number;
  quantidade_revisada: number;
  status: EscolhaRevisaoStatus;
  destino_material_bom?: string | null;
}) => {
  const enviada = Number(payload.quantidade_enviada) || 0;
  const boa = Number(payload.quantidade_boa_recuperada) || 0;
  const refugo = Number(payload.quantidade_refugada) || 0;
  const revisada = Number(payload.quantidade_revisada) || 0;
  const pendente = Number(payload.quantidade_pendente) || 0;

  if (enviada <= 0) return 'Quantidade enviada deve ser maior que zero.';
  if ([boa, refugo, revisada, pendente].some(value => value < 0)) return 'Quantidades não podem ser negativas.';
  if (boa + refugo > enviada) return 'Bom recuperado + refugo não pode ser maior que a quantidade enviada.';
  if (revisada !== boa + refugo) return 'Quantidade revisada deve ser igual a bom recuperado + refugo.';
  if (pendente !== enviada - revisada) return 'Quantidade pendente deve ser igual a enviada - revisada.';
  if ((payload.status === 'finalizada' || payload.status === 'liberada') && pendente !== 0) {
    return 'Finalizada ou liberada não pode ter quantidade pendente.';
  }
  if ((payload.status === 'finalizada' || payload.status === 'liberada') && boa + refugo !== enviada) {
    return 'Para finalizar ou liberar, bom recuperado + refugo deve fechar com a quantidade enviada.';
  }
  if (payload.status === 'liberada' && !payload.destino_material_bom) {
    return 'Para status liberada, informe o destino do material bom.';
  }
  return null;
};

export const escolhaRevisaoService = {
  async list() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('entrada_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as EscolhaRevisaoRegistro[];
  },

  async create(payload: EscolhaRevisaoInsert) {
    const validation = validateEscolhaRevisao(payload);
    if (validation) throw new Error(validation);

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as EscolhaRevisaoRegistro;
  },

  async findByOrigin(input: {
    origemRegistroTabela: string;
    origemRegistroId: string;
    tipoDefeito: string;
    origemProblema: OrigemProblemaEscolha;
  }) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('origem_registro_tabela', input.origemRegistroTabela)
      .eq('origem_registro_id', input.origemRegistroId)
      .eq('tipo_defeito', input.tipoDefeito)
      .eq('origem_problema', input.origemProblema)
      .maybeSingle();

    if (error) throw error;
    return data as EscolhaRevisaoRegistro | null;
  },

  async update(id: string, payload: EscolhaRevisaoUpdate) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as EscolhaRevisaoRegistro;
  },
};
