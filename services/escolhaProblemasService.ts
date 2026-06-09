import { supabase } from './supabase';

export type EscolhaEtapa = 'corte_vinco' | 'colagem' | 'produto_acabado' | 'todos' | 'impressao';

export interface EscolhaProblema {
  id: string;
  etapa: EscolhaEtapa;
  label: string;
  ativo: boolean;
  created_at: string;
}

// Listas padrão (fallback): usadas quando a tabela ainda não existe ou está vazia.
export const DEFAULT_PROBLEMAS: Record<EscolhaEtapa, string[]> = {
  impressao:    ['Mancha', 'Registro', 'Repasse', 'Sujeira', 'Verniz', 'Risco', 'Cor Fora', 'Papel Amassado'],
  corte_vinco:  ['Vinco Estourado', 'Falha no Corte', 'Variação', 'Vinco Fraco'],
  colagem:      ['Fundo Virado', 'Falta de Cola', 'Cola Fraca', 'Queimado Correia', 'Rasgado', 'Modelo Misturado'],
  produto_acabado: ['Mancha', 'Rasgado', 'Amassado', 'Registro', 'Sujeira', 'Falha de Colagem', 'Falha de Verniz', 'Vinco Estourado', 'Modelo Misturado'],
  todos: ['Outros'],
};

const TABLE = 'escolha_problemas';

const dedup = (arr: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const k = v.trim().toLowerCase();
    if (!v.trim() || seen.has(k)) continue;
    seen.add(k);
    out.push(v.trim());
  }
  return out;
};

export const escolhaProblemasService = {
  /**
   * Retorna os rótulos de problemas para uma etapa (inclui os de 'todos'),
   * mesclando o cadastro do banco com a lista padrão. Tolera tabela ausente.
   */
  async listLabels(etapa: EscolhaEtapa): Promise<string[]> {
    const defaults = [...(DEFAULT_PROBLEMAS[etapa] ?? []), ...DEFAULT_PROBLEMAS.todos];
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('label, etapa, ativo')
        .eq('ativo', true)
        .in('etapa', [etapa, 'todos']);
      if (error || !data || data.length === 0) return dedup(defaults);
      const fromDb = (data as Array<{ label: string }>).map(r => r.label);
      // Banco manda; padrão entra só pra completar o que não estiver cadastrado.
      return dedup([...fromDb, ...defaults]);
    } catch {
      return dedup(defaults);
    }
  },

  /** Lista completa para o cadastro (Admin). */
  async listAll(): Promise<EscolhaProblema[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('etapa')
      .order('label');
    if (error) throw error;
    return (data ?? []) as EscolhaProblema[];
  },

  async create(etapa: EscolhaEtapa, label: string): Promise<EscolhaProblema> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ etapa, label: label.trim() })
      .select()
      .single();
    if (error) throw error;
    return data as EscolhaProblema;
  },

  async setAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase.from(TABLE).update({ ativo }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  },
};
