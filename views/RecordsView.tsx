
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { reportService } from '../services/reportService';
import ConfirmModal from '../components/ConfirmModal';
import { ProcessType } from '../types';
import { useUser } from '../contexts/UserContext';

const EDIT_WINDOW_MINUTES = 30;
const isWithinEditWindow = (timestamp: string) => {
  const created = new Date(timestamp).getTime();
  return Date.now() - created < EDIT_WINDOW_MINUTES * 60 * 1000;
};

const StatCard = ({ label, value, icon, colorClass, bgClass }: { label: string, value: string, icon: string, colorClass: string, bgClass: string }) => (
  <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
    <div className={`size-10 rounded-xl ${bgClass} flex items-center justify-center ${colorClass}`}>
      <span className="material-symbols-outlined text-xl font-bold">{icon}</span>
    </div>
    <div>
      <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest leading-none mb-1">{label}</p>
      <p className="text-lg font-black text-slate-800 dark:text-white leading-tight">{value}</p>
    </div>
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

const CATEGORY_CONFIG: Record<ProcessType, {
  label: string;
  description: string;
  icon: string;
  dotClass: string;
  badgeClass: string;
  tabClass: string;
  ringClass: string;
}> = {
  [ProcessType.OFFSET]: {
    label: 'Offset',
    description: 'Impressão Offset',
    icon: 'ink_pen',
    dotClass: 'bg-blue-500',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
    tabClass: 'bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-blue-950/30 dark:via-slate-900 dark:to-blue-900/20 border-blue-200 dark:border-blue-800',
    ringClass: 'ring-2 ring-blue-200 dark:ring-blue-900/60'
  },
  [ProcessType.UV]: {
    label: 'UV',
    description: 'Verniz UV',
    icon: 'wb_sunny',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
    tabClass: 'bg-gradient-to-br from-emerald-50 via-white to-emerald-100 dark:from-emerald-950/30 dark:via-slate-900 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-900/60',
    ringClass: 'ring-2 ring-emerald-200 dark:ring-emerald-900/60'
  },
  [ProcessType.HOT_STAMPING]: {
    label: 'Hot Stamping',
    description: 'Acabamento térmico',
    icon: 'local_fire_department',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
    tabClass: 'bg-gradient-to-br from-rose-50 via-white to-rose-100 dark:from-rose-950/30 dark:via-slate-900 dark:to-rose-900/20 border-rose-200 dark:border-rose-900/60',
    ringClass: 'ring-2 ring-rose-200 dark:ring-rose-900/60'
  },
  [ProcessType.ESCOLHAS]: {
    label: 'Escolhas',
    description: 'Separação e Revisão',
    icon: 'content_paste_search',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    tabClass: 'bg-gradient-to-br from-amber-50 via-white to-amber-100 dark:from-amber-950/30 dark:via-slate-900 dark:to-amber-900/20 border-amber-200 dark:border-amber-900/60',
    ringClass: 'ring-2 ring-amber-200 dark:ring-amber-900/60'
  },
  [ProcessType.ACABAMENTO]: {
    label: 'Acabamento',
    description: 'Inspeção Final',
    icon: 'verified',
    dotClass: 'bg-indigo-500',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
    tabClass: 'bg-gradient-to-br from-indigo-50 via-white to-indigo-100 dark:from-indigo-950/30 dark:via-slate-900 dark:to-indigo-900/20 border-indigo-200 dark:border-indigo-900/60',
    ringClass: 'ring-2 ring-indigo-200 dark:ring-indigo-900/60'
  },
};

const normalizeProcessType = (type?: string) => {
  if (!type) return ProcessType.OFFSET;
  return type === ProcessType.ESCOLHAS ? ProcessType.OFFSET : (type as ProcessType);
};

const parseObservations = (observations?: string) => {
  if (!observations) return {};
  if (!observations.trim().startsWith('{')) return {};
  try {
    return JSON.parse(observations);
  } catch {
    return {};
  }
};

const normalizeDefects = (raw: any): Array<{ name: string; count: number }> => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((d: any) => (d.count || 0) > 0);
  return Object.entries(raw)
    .filter(([, count]) => (count as number) > 0)
    .map(([key, count]) => ({ name: key.replace(/_/g, ' '), count: count as number }));
};

// Extrai defeitos do schema v2 (defeitos.por_folha / por_unidade / verniz_uv / hot_stamping)
// e faz fallback para o schema legado (defects: Record<string, number>)
const extractDefects = (obs: any): Array<{ name: string; count: number }> => {
  if (!obs) return [];
  if (obs.schema_version === 2 || obs.defeitos) {
    const result: Array<{ name: string; count: number }> = [];
    const defeitos = obs.defeitos ?? {};
    const cor = Number((defeitos.por_folha ?? {}).cor) || 0;
    if (cor > 0) result.push({ name: 'Cor', count: cor });
    const porUnidade = defeitos.por_unidade ?? {};
    Object.entries(porUnidade).forEach(([key, val]: [string, any]) => {
      const count = typeof val === 'object' ? (Number(val?.count) || 0) : (Number(val) || 0);
      if (count > 0) result.push({ name: key.replace(/_/g, ' '), count });
    });
    const vernizUv = obs.verniz_uv ?? {};
    if (vernizUv.aplicavel && vernizUv.defeitos) {
      Object.entries(vernizUv.defeitos).forEach(([key, val]: [string, any]) => {
        const count = typeof val === 'object' ? (Number(val?.count) || 0) : (Number(val) || 0);
        if (count > 0) result.push({ name: `UV: ${key.replace(/_/g, ' ')}`, count });
      });
    }
    const hs = obs.hot_stamping ?? {};
    if (hs.aplicavel && hs.defeitos) {
      Object.entries(hs.defeitos).forEach(([key, val]: [string, any]) => {
        const count = typeof val === 'object' ? (Number(val?.count) || 0) : (Number(val) || 0);
        if (count > 0) result.push({ name: `HS: ${key.replace(/_/g, ' ')}`, count });
      });
    }
    return result;
  }
  return normalizeDefects(obs.defects);
};

const isSpreadsheetAnalysis = (record: any) => {
  const obs = parseObservations(record.observations);
  return obs.is_spreadsheet_analysis === true;
};

const mapEscolhaFromObservations = (obs: any) => {
  if (!obs) return null;
  if (obs.escolha) return obs.escolha;
  const quantities = obs.quantities || {};
  const hasQuantity = Object.keys(quantities).length > 0;
  const observacoes = obs.restriction_reason || obs.observacoes || '';
  if (!hasQuantity && !observacoes) return null;
  return {
    op_total_unidades: quantities.total_op ?? 0,
    folhas_impressas_total: quantities.folhas_impressas ?? 0,
    folhas_revisadas_pilha: quantities.folhas_revisadas ?? 0,
    escolhas_unidades: quantities.escolhas ?? 0,
    observacoes: observacoes || undefined
  };
};

const getCategoryMeta = (type?: string) => {
  const normalized = normalizeProcessType(type) || ProcessType.OFFSET;
  return CATEGORY_CONFIG[normalized] || CATEGORY_CONFIG[ProcessType.OFFSET];
};

const CATEGORY_ORDER: Array<ProcessType | 'ALL'> = ['ALL', ProcessType.OFFSET, ProcessType.UV, ProcessType.HOT_STAMPING, ProcessType.ACABAMENTO];
const getJoinedOrder = (orders: any) => Array.isArray(orders) ? orders[0] : orders;

export default function RecordsView() {
  const { showToast } = useToast();
  const { isSupervisor, profile } = useUser();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos os Status');
  const [categoryFilter, setCategoryFilter] = useState<ProcessType | 'ALL'>('ALL');
  const [editRequestRecord, setEditRequestRecord] = useState<any>(null);
  const [editRequestReason, setEditRequestReason] = useState('');

  // Master Data (for mapping IDs to names)
  const [operatorsList, setOperatorsList] = useState<any[]>([]);
  const [analystsList, setAnalystsList] = useState<any[]>([]);

  // View Details State
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      // Fetch inspections with machine info
      const { data: inspData, error: inspError } = await supabase
        .from('inspections')
        .select(`*, orders!inner(id, op), machines(name, code), operators(name), analysts(name)`)
        .order('created_at', { ascending: false });

      if (inspError) throw inspError;

      // Map data — defeitos ficam dentro do JSON de observations
      const formatted = (inspData || [])
        .filter((insp: any) => {
          const order = getJoinedOrder(insp.orders);
          return (
            !!insp.order_id &&
            order?.id === insp.order_id &&
            String(order?.op || '').trim().toUpperCase() === String(insp.op || '').trim().toUpperCase()
          );
        })
        .map(insp => {
        const order = getJoinedOrder(insp.orders);
        const parsedObservations = parseObservations(insp.observations);
        const displayProcessType = normalizeProcessType(insp.process_type || parsedObservations.process_type);
        const defects = extractDefects(parsedObservations);
        const total_defects = parsedObservations.totalDefects
          ?? defects.reduce((acc: number, d: any) => acc + (d.count || 0), 0);
        return {
          ...insp,
          op: order?.op || insp.op,
          defects,
          total_defects,
          totalDefects: total_defects,
          laudo_numero: parsedObservations.laudo_numero || '',
          displayProcessType,
          process_type: displayProcessType,
          isLegacy: parsedObservations.legacy === true || parsedObservations.is_historical === true,
          escolha: mapEscolhaFromObservations(parsedObservations)
        };
      });

      setRecords(formatted);
    } catch (error: any) {
      showToast('Erro ao carregar registros', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();

    // Load Master Data
    const loadMasterData = async () => {
      const [oRes, aRes] = await Promise.all([
        supabase.from('operators').select('*'),
        supabase.from('analysts').select('*')
      ]);
      if (oRes.data) setOperatorsList(oRes.data);
      if (aRes.data) setAnalystsList(aRes.data);
    };
    loadMasterData();

    // user identity comes from UserContext
  }, []);

  const handleViewDetails = (record: any) => {
    setViewingRecord(record);
    setIsDetailsModalOpen(true);
  };

  // Helper to get names from IDs (supports multi-select format)
  const getTeamNames = (record: any, type: 'operator' | 'analyst') => {
    let ids: string[] = [];
    let list = type === 'operator' ? operatorsList : analystsList;

    try {
      const obs = parseObservations(record.observations);
      if (type === 'operator' && obs.all_operator_ids) ids = obs.all_operator_ids;
      else if (type === 'analyst' && obs.all_analyst_ids) ids = obs.all_analyst_ids;
      else {
        // Fallback to legacy single columns
        const singleId = type === 'operator' ? record.operator_id : record.analyst_id;
        if (singleId) ids = [singleId];
      }
    } catch (e) {
      // Fallback if JSON parse fails
      const singleId = type === 'operator' ? record.operator_id : record.analyst_id;
      if (singleId) ids = [singleId];
    }

    return ids.map(id => list.find(item => item.id === id)?.name || 'Desconhecido').join(', ');
  };

  const getDefectsList = (record: any) => {
    try {
      const obs = parseObservations(record.observations);

      // Finishing records have categorized defects
      if (obs.is_finishing_laudo && obs.defects) {
        const categories = ['critical', 'major', 'minor'];
        const flattened: any[] = [];
        categories.forEach(cat => {
          if (obs.defects[cat]) {
            Object.entries(obs.defects[cat]).forEach(([key, count]) => {
              if ((count as number) > 0) {
                flattened.push({ name: key.replace(/_/g, ' '), count, category: cat });
              }
            });
          }
        });
        return flattened;
      }

      return extractDefects(obs);
    } catch (e) {
      return [];
    }
  };

  const canEditRecord = (record: any) => {
    if (isSupervisor) return true;
    return record.created_by_user_id === profile?.user_id && isWithinEditWindow(record.created_at);
  };

  const handleDeleteClick = (id: string) => {
    void id;
    showToast('Registros produtivos não são excluídos definitivamente. Use correção com justificativa e histórico.', 'warning');
  };

  const confirmDelete = async () => {
    showToast('Exclusão definitiva bloqueada para preservar rastreabilidade.', 'warning');
    setRecordToDelete(null);
    setIsDeleteModalOpen(false);
  };

  const handleEdit = (record: any) => {
    if (!canEditRecord(record)) {
      showToast('Edição direta permitida somente até 30 minutos para o próprio registro. Após isso, solicite à supervisão.', 'warning');
      return;
    }
    setEditingRecord({
      ...record,
      // Ensure machine is just the ID for the select
      machine_id: record.machine_id
    });
    setIsEditModalOpen(true);
  };

  const submitEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRequestRecord || !editRequestReason.trim()) return;
    try {
      const { error } = await supabase.from('edit_requests').insert({
        inspection_id: editRequestRecord.id,
        requested_by: profile?.user_id,
        reason: editRequestReason.trim(),
        proposed_changes: {},
        status: 'pending',
      });
      if (error) throw error;
      showToast('Solicitação enviada para aprovação da supervisão', 'success');
      setEditRequestRecord(null);
      setEditRequestReason('');
    } catch (err: any) {
      showToast(`Erro ao enviar: ${err.message}`, 'error');
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    if (!canEditRecord(editingRecord)) {
      showToast('Edição bloqueada. Analistas só podem editar o próprio registro em até 30 minutos.', 'error');
      setIsEditModalOpen(false);
      setEditingRecord(null);
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('inspections')
        .update({
          status: editingRecord.status,
          edited_at: new Date().toISOString(),
          edited_by_user_id: profile?.user_id ?? null,
          // Note: Updating machine_id or other relations might need a full refetch or careful state update
          // For simplicity, we trigger a refetch or simple optimistic update
        })
        .eq('id', editingRecord.id);

      if (error) throw error;

      showToast('Registro atualizado com sucesso', 'success');
      setIsEditModalOpen(false);
      fetchRecords(); // Refresh to get improved data consistency
    } catch (error: any) {
      showToast('Erro ao atualizar registro', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const visibleRecords = useMemo(() => records.filter(record => !record.isLegacy), [records]);

  const filteredRecords = useMemo(() => {
    return visibleRecords.filter(record => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        (record.op || '').toLowerCase().includes(search) ||
        (record.laudo_numero || '').toLowerCase().includes(search);
      const statusMap: Record<string, string> = {
        'Aprovado': 'APPROVED',
        'Reprovado': 'REJECTED',
        'Aprovado com Restrição': 'RESTRICTED'
      };
      const matchesStatus = statusFilter === 'Todos os Status' || record.status === statusMap[statusFilter];
      const recordCategory = normalizeProcessType(record.displayProcessType || record.process_type);
      const matchesCategory = categoryFilter === 'ALL' || recordCategory === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [records, searchTerm, statusFilter, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const base: Record<ProcessType, number> = {
      [ProcessType.OFFSET]: 0,
      [ProcessType.UV]: 0,
      [ProcessType.HOT_STAMPING]: 0,
      [ProcessType.ESCOLHAS]: 0,
      [ProcessType.ACABAMENTO]: 0
    };
    visibleRecords.forEach(record => {
      const key = normalizeProcessType(record.displayProcessType || record.process_type);
      base[key] = (base[key] || 0) + 1;
    });
    return base;
  }, [visibleRecords]);

  // Dynamic stats
  const stats = useMemo(() => {
    const kpiRecords = visibleRecords.filter(r => !isSpreadsheetAnalysis(r) && r.status);
    if (kpiRecords.length === 0) return { apr: '0%', fail: '0%', total: '0', pending: '0' };
    const approved = kpiRecords.filter(r => r.status === 'APPROVED').length;
    const rejected = kpiRecords.filter(r => r.status === 'REJECTED').length;
    const restricted = kpiRecords.filter(r => r.status === 'RESTRICTED').length;

    return {
      apr: `${((approved / kpiRecords.length) * 100).toFixed(1)}%`,
      fail: `${((rejected / kpiRecords.length) * 100).toFixed(1)}%`,
      total: kpiRecords.length.toString(),
      pending: restricted.toString()
    };
  }, [visibleRecords]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'APPROVED': return 'Aprovado';
      case 'REJECTED': return 'Reprovado';
      case 'RESTRICTED': return 'Aprovado com Restrição';
      case 'PENDING_CLOSURE': return 'Pendente de fechamento';
      default: return s;
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-4 animate-slide-in pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Consulta de Registros</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
            Histórico • Gestão de Dados
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchRecords()}
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl h-9 px-4 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>sync</span>
            ATUALIZAR
          </button>
          <button className="flex items-center gap-2 bg-primary rounded-xl h-9 px-5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-base">download</span>
            EXPORTAR
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_ORDER.map(cat => {
            const isAll = cat === 'ALL';
            const meta = isAll ? {
              label: 'TODOS',
              description: 'Processos',
              icon: 'all_inclusive',
              dotClass: 'bg-slate-400',
              badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
              tabClass: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800',
              ringClass: 'ring-1 ring-slate-200 dark:ring-slate-700'
            } : getCategoryMeta(cat as ProcessType);
            const count = isAll ? records.length : categoryCounts[cat as ProcessType] || 0;
            const isActive = categoryFilter === cat;

            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat as ProcessType | 'ALL')}
                className={`flex-1 min-w-[150px] text-left p-3 rounded-2xl border transition-all ${meta.tabClass} ${isActive ? `${meta.ringClass} border-primary/50 bg-slate-50/50 shadow-sm` : 'hover:bg-slate-50 opacity-70 hover:opacity-100'}`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className={`size-8 rounded-lg ${meta.dotClass} text-white flex items-center justify-center shadow-sm`}>
                      <span className="material-symbols-outlined text-base">{meta.icon}</span>
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${meta.badgeClass}`}>
                      {count}
                    </span>
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-wider">{meta.label}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Filtrar Status</label>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-xs font-bold outline-none appearance-none cursor-pointer"
              >
                <option>Todos os Status</option>
                <option>Aprovado</option>
                <option>Reprovado</option>
                <option>Aprovado com Restrição</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Buscar OP / Laudo</label>
            <div className="relative">
              <input
                className="w-full h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 text-xs font-bold outline-none"
                placeholder="Ex: 88421 ou 00000/25"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
            </div>
          </div>
          <div className="flex items-end">
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl h-10 flex items-center px-4 w-full">
              <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-xs">info</span>
                {filteredRecords.length} REGISTROS ENCONTRADOS
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Data/Hora</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">OP</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Laudo</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Máquina</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Processo</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Resultado</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Falhas</th>
                <th className="px-3 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right pr-6">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic text-sm">Carregando registros...</td></tr>
              ) : filteredRecords.length > 0 ? (
                filteredRecords.map(record => {
                  const meta = getCategoryMeta(record.displayProcessType || record.process_type);
                  return (
                    <tr key={record.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors relative ${record.total_defects > 5 ? 'bg-rose-50/50 dark:bg-rose-950/10' :
                      record.total_defects > 0 ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''
                      }`}>
                      {record.total_defects > 0 && (
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-0 bottom-0 w-1 ${record.total_defects > 5 ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                        />
                      )}
                      <td className="px-6 py-4 text-sm whitespace-nowrap">{formatDate(record.created_at)}</td>
                      <td className="px-6 py-4 text-sm font-bold uppercase tracking-tighter">{record.op}</td>
                      <td className="px-6 py-4 text-sm font-bold text-indigo-600">{record.laudo_numero || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium">{record.machines?.name || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${meta.badgeClass}`}>
                          <span className={`size-2.5 rounded-full ${meta.dotClass}`}></span>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${record.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          record.status === 'REJECTED' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' :
                            record.status === 'PENDING_CLOSURE' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' :
                            'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                          {getStatusLabel(record.status)}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-sm font-black ${record.total_defects > 5 ? 'text-rose-600 dark:text-rose-400' :
                        record.total_defects > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                        }`}>
                        <span className="flex items-center gap-1">
                          {record.total_defects > 5 && <span className="material-symbols-outlined text-xs">error</span>}
                          {record.total_defects > 0 && record.total_defects <= 5 && <span className="material-symbols-outlined text-xs">warning</span>}
                          {record.total_defects}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleViewDetails(record)}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            aria-label="Ver Detalhes"
                            data-tooltip="Ver Detalhes"
                          >
                            <span className="material-symbols-outlined text-xl">visibility</span>
                          </button>

                          {/* Supervisor: edit + delete sem restrição */}
                          {isSupervisor && (
                            <>
                              <button
                                onClick={() => handleEdit(record)}
                                className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                                aria-label="Editar Registro"
                                data-tooltip="Editar Registro"
                              >
                                <span className="material-symbols-outlined text-xl">edit</span>
                              </button>
                            </>
                          )}
                          {/* Analista: edição direta nos primeiros 30min, depois solicita */}
                          {!isSupervisor && record.created_by_user_id === profile?.user_id && (
                            isWithinEditWindow(record.created_at) ? (
                              <button
                                onClick={() => handleEdit(record)}
                                className="p-2 text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                                aria-label={`Editar (janela de ${EDIT_WINDOW_MINUTES}min)`}
                                data-tooltip={`Editar (janela de ${EDIT_WINDOW_MINUTES}min)`}
                              >
                                <span className="material-symbols-outlined text-xl">edit</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => { setEditRequestRecord(record); setEditRequestReason(''); }}
                                className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                                aria-label="Solicitar alteração (aprovação necessária)"
                                data-tooltip="Solicitar alteração"
                              >
                                <span className="material-symbols-outlined text-xl">rate_review</span>
                              </button>
                            )
                          )}
                          <button
                            onClick={() => {
                              if (record.displayProcessType === ProcessType.ACABAMENTO) {
                                reportService.generateFinishingPDF(record, operatorsList, analystsList);
                              } else {
                                reportService.generateInspectionPDF(record, operatorsList, analystsList);
                              }
                            }}
                            className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg"
                            aria-label="Exportar PDF"
                            data-tooltip="Exportar PDF"
                          >
                            <span className="material-symbols-outlined text-xl">download</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic text-sm">Nenhum registro encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Aprovação" value={stats.apr} icon="check_circle" colorClass="text-emerald-600" bgClass="bg-emerald-50 dark:bg-emerald-950/30" />
        <StatCard label="Rejeição" value={stats.fail} icon="warning" colorClass="text-rose-600" bgClass="bg-rose-50 dark:bg-rose-950/30" />
        <StatCard label="Total" value={stats.total} icon="inventory_2" colorClass="text-primary" bgClass="bg-primary/10" />
        <StatCard label="Em Análise" value={stats.pending} icon="timer" colorClass="text-amber-600" bgClass="bg-amber-50 dark:bg-amber-950/30" />
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar Inspeção"
      >
        {editingRecord && (
          <form onSubmit={saveEdit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Ordem de Produção (OP)</label>
              <input
                type="text"
                value={editingRecord.op}
                readOnly
                className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-sm font-bold outline-none text-slate-500"
              />
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">A OP vem de orders e nao e editada neste registro.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Status da Inspeção</label>
              <select
                value={editingRecord.status}
                onChange={e => setEditingRecord({ ...editingRecord, status: e.target.value })}
                className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="APPROVED">Aprovado</option>
                <option value="RESTRICTED">Aprovado com Restrição</option>
                <option value="REJECTED">Reprovado</option>
              </select>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 h-12 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : null}
                Salvar Alterações
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title="Detalhes da Inspeção"
      >
        {viewingRecord && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Ordem de Produção</p>
                <p className="font-black text-lg text-slate-800 dark:text-white">{viewingRecord.op}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Data</p>
                <p className="font-bold text-sm text-slate-700 dark:text-slate-300">{formatDate(viewingRecord.created_at)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Maquina</p>
                <p className="font-bold text-sm text-slate-700 dark:text-slate-300">{viewingRecord.machines?.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Categoria</p>
                <span className={"inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase " + getCategoryMeta(viewingRecord.displayProcessType || viewingRecord.process_type).badgeClass}>
                  <span className={"size-2.5 rounded-full " + getCategoryMeta(viewingRecord.displayProcessType || viewingRecord.process_type).dotClass}></span>
                  {getCategoryMeta(viewingRecord.displayProcessType || viewingRecord.process_type).label}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Status</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${viewingRecord.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                  viewingRecord.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                    viewingRecord.status === 'PENDING_CLOSURE' ? 'bg-sky-100 text-sky-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                  {getStatusLabel(viewingRecord.status)}
                </span>
              </div>
              {parseObservations(viewingRecord.observations).desenho_tecnico && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Desenho Técnico</p>
                  <p className="font-bold text-sm text-indigo-600 italic">{parseObservations(viewingRecord.observations).desenho_tecnico}</p>
                </div>
              )}
            </div>

            {parseObservations(viewingRecord.observations).is_finishing_laudo && parseObservations(viewingRecord.observations).tests && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">Testes Técnicos (Amostras)</p>
                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th className="p-2 font-black uppercase text-slate-400">Teste</th>
                        <th className="p-2 font-black uppercase text-slate-400 text-center">A1</th>
                        <th className="p-2 font-black uppercase text-slate-400 text-center">A2</th>
                        <th className="p-2 font-black uppercase text-indigo-500 text-center">Média</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {Object.entries(parseObservations(viewingRecord.observations).tests).map(([key, data]: [string, any]) => (
                        <tr key={key}>
                          <td className="p-2 font-bold capitalize text-slate-600">{key}</td>
                          <td className="p-2 text-center">{data.a1 || '-'}</td>
                          <td className="p-2 text-center">{data.a2 || '-'}</td>
                          <td className="p-2 text-center font-black text-indigo-600 bg-indigo-50/30">{data.avg || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Equipe Técnica</p>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-slate-400">Operadores:</span>
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-300">{getTeamNames(viewingRecord, 'operator')}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Analistas:</span>
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-300">{getTeamNames(viewingRecord, 'analyst')}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">Defeitos / Ocorrências</p>
              {getDefectsList(viewingRecord).length > 0 ? (
                <div className="space-y-2">
                  {getDefectsList(viewingRecord).map((d: any, idx: number) => {
                    const colorClasses =
                      d.category === 'critical' ? 'bg-rose-50 border-rose-100 text-rose-700' :
                        d.category === 'major' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                          'bg-slate-50 border-slate-100 text-slate-700';
                    return (
                      <div key={idx} className={`flex justify-between items-center p-2 rounded-lg border ${colorClasses}`}>
                        <div className="flex items-center gap-2">
                          {d.category && <span className="text-[8px] font-black uppercase tracking-widest opacity-50">{d.category}</span>}
                          <span className="text-xs font-bold uppercase">{d.name}</span>
                        </div>
                        <span className="text-sm font-black">{d.count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm italic text-slate-400">Nenhum defeito registrado.</p>
              )}
            </div>

            {viewingRecord.escolha && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">Escolha</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">OP (unidades)</p>
                    <p className="font-black text-lg text-slate-800 dark:text-white">{viewingRecord.escolha.op_total_unidades}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Folhas impressas</p>
                    <p className="font-black text-lg text-slate-800 dark:text-white">{viewingRecord.escolha.folhas_impressas_total}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Folhas revisadas</p>
                    <p className="font-black text-lg text-slate-800 dark:text-white">{viewingRecord.escolha.folhas_revisadas_pilha}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">Escolhas (unid.)</p>
                    <p className="font-black text-lg text-slate-800 dark:text-white">{viewingRecord.escolha.escolhas_unidades}</p>
                  </div>
                </div>
                {viewingRecord.escolha.observacoes && (
                  <p className="text-xs italic text-slate-500 mt-3">Observações: {viewingRecord.escolha.observacoes}</p>
                )}
              </div>
            )}

            {/* Show JSON Observations raw for debug if needed, or structured data */}
            {viewingRecord.rework_count > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Métricas</p>
                <div className="flex gap-4 mt-2">
                  <div>
                    <span className="text-xs text-slate-400">Retrabalho/Reprovado:</span>
                    <p className="font-bold text-rose-600">{viewingRecord.rework_count}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Amostras:</span>
                    <p className="font-bold text-slate-700 dark:text-slate-300">{viewingRecord.samples_count}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Exclusão bloqueada"
        message="Registros produtivos não devem ser apagados definitivamente. Faça uma correção com justificativa para manter o histórico."
        confirmText="Entendi"
        type="warning"
      />

      {/* Modal: Solicitar Alteração (analista fora da janela de 30min) */}
      {editRequestRecord && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={submitEditRequest}
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-6 border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-500">
                <span className="material-symbols-outlined">rate_review</span>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Solicitar Alteração</h3>
                <p className="text-xs text-slate-400">OP {editRequestRecord.op} • aguarda aprovação da supervisão</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Motivo da alteração *
              </label>
              <textarea
                required
                rows={4}
                className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium resize-none focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="Descreva o que precisa ser alterado e o motivo..."
                value={editRequestReason}
                onChange={e => setEditRequestReason(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Enviar Solicitação
              </button>
              <button
                type="button"
                onClick={() => setEditRequestRecord(null)}
                className="px-6 h-12 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div >
  );
}







