
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { InspectionStatus, ProcessType, Machine, Operator, Analyst, Order } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import DefectCounter from '../components/DefectCounter';

const MetricInput: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
  icon: string;
}> = ({ label, value, onChange, icon }) => (
  <div className="flex flex-col gap-1 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
    <div className="flex items-center gap-1.5 mb-1">
      <span className="material-symbols-outlined text-xs text-slate-400">{icon}</span>
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
    </div>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs">-</button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full h-6 bg-transparent text-center font-black text-xs outline-none"
      />
      <button type="button" onClick={() => onChange(value + 1)} className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs">+</button>
    </div>
  </div>
);

type ApprovalRuleMode = 'percent' | 'quantity';
type ApprovalRule = { mode: ApprovalRuleMode; restrictedLimit: number; rejectLimit: number };
type ProductionMetrics = { printedSheets: number; expectedUnits: number };
type FolhasData = {
  folhas_verificadas: number;
  folhas_aprovadas: number;
  folhas_escolha: number;
  folhas_reprovadas: number;
};

const DEFAULT_APPROVAL_RULE: ApprovalRule = { mode: 'percent', restrictedLimit: 2, rejectLimit: 5 };
const APPROVAL_RULE_STORAGE_KEY = 'kg_initial_process_approval_rule';

const sumDefects = (defects: Record<string, number>) =>
  Object.values(defects).reduce((total, value) => total + (Number(value) || 0), 0);

const calculateStatusByRule = (failureRate: number, failures: number, rule: ApprovalRule) => {
  const value = rule.mode === 'percent' ? failureRate : failures;
  if (value >= rule.rejectLimit) return InspectionStatus.REJECTED;
  if (value >= rule.restrictedLimit) return InspectionStatus.RESTRICTED;
  return InspectionStatus.APPROVED;
};

const getStatusText = (status: InspectionStatus) => {
  if (status === InspectionStatus.REJECTED) return 'Reprovado';
  if (status === InspectionStatus.RESTRICTED) return 'Aprovado com restrição';
  return 'Aprovado';
};

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR'); // v2

type OccurrenceEntry = { folha: number | null; faca: number | null };

const UNIT_DEFECT_KEYS: { key: string; label: string; icon: string }[] = [
  { key: 'manchas', label: 'Manchas', icon: 'texture' },
  { key: 'pintas', label: 'Pintas', icon: 'blur_on' },
  { key: 'fiapos', label: 'Fiapos', icon: 'straighten' },
  { key: 'registro', label: 'Registro', icon: 'grid_view' },
  { key: 'falha_verniz', label: 'Falha Verniz', icon: 'imagesearch_roller' },
  { key: 'falha_texto', label: 'Falha Texto', icon: 'format_color_text' },
  { key: 'texto_fechado', label: 'Texto Fechado', icon: 'block' },
];

const emptyOccurrences = (): Record<string, OccurrenceEntry[]> =>
  Object.fromEntries(UNIT_DEFECT_KEYS.map(d => [d.key, [] as OccurrenceEntry[]]));

const DetailedDefectCounter: React.FC<{
  name: string;
  icon: string;
  occurrences: OccurrenceEntry[];
  unidadesPorFolha: number;
  onAdd: (entry: OccurrenceEntry) => void;
  onRemove: (index: number) => void;
}> = ({ name, icon, occurrences, unidadesPorFolha, onAdd, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  const [folhaInput, setFolhaInput] = useState('');
  const [facaInput, setFacaInput] = useState('1');
  const count = occurrences.length;

  const addPositioned = () => {
    const folha = folhaInput.trim() ? Number(folhaInput) : null;
    const faca = Number(facaInput) || 1;
    onAdd({ folha, faca });
    setFolhaInput('');
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <span className="material-symbols-outlined text-slate-400 text-base">{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 flex-1 min-w-0 truncate">{name}</span>
        <span className={`text-sm font-black w-7 text-center tabular-nums ${count > 0 ? 'text-rose-600' : 'text-slate-800 dark:text-white'}`}>{count}</span>
        <button
          type="button"
          onClick={() => count > 0 && onRemove(count - 1)}
          disabled={count === 0}
          className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs disabled:opacity-40"
        >-</button>
        <button
          type="button"
          onClick={() => onAdd({ folha: null, faca: null })}
          className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs"
        >+</button>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className={`size-6 rounded flex items-center justify-center transition-colors ${expanded ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
        >
          <span className="material-symbols-outlined text-sm">{expanded ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
          {count > 0 && (
            <div className="flex flex-wrap gap-1">
              {occurrences.map((occ, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                >
                  {occ.folha !== null ? `F${occ.folha}·${occ.faca}` : '—'}
                  <button type="button" onClick={() => onRemove(i)} className="text-rose-400 hover:text-rose-600 leading-none">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min={1}
              placeholder="Nº Folha"
              value={folhaInput}
              onChange={(e) => setFolhaInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPositioned()}
              className="h-8 w-24 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/20"
            />
            <select
              value={facaInput}
              onChange={(e) => setFacaInput(e.target.value)}
              className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none"
            >
              {Array.from({ length: unidadesPorFolha }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>Faca {n}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={addPositioned}
              className="h-8 px-3 rounded-lg bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors"
            >
              + Registrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function InspectionView() {
  const { showToast } = useToast();
  const { profile, isSupervisor } = useUser();
  const rowIdRef = useRef(0);
  const nextRowId = useCallback(() => `row-${rowIdRef.current++}`, []);

  type SelectRow = { rowId: string; value: string };

  // Master data
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // OP / form
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [newOrder, setNewOrder] = useState({ op: '', cliente: '', produto: '', qtd_total: '' });
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedOperatorRows, setSelectedOperatorRows] = useState<SelectRow[]>([{ rowId: nextRowId(), value: '' }]);
  const [selectedAnalystRows, setSelectedAnalystRows] = useState<SelectRow[]>([{ rowId: nextRowId(), value: '' }]);
  const [activeTab, setActiveTab] = useState<ProcessType>(ProcessType.OFFSET);
  const [productionMetrics, setProductionMetrics] = useState<ProductionMetrics>({ printedSheets: 0, expectedUnits: 0 });
  const [approvalRule, setApprovalRule] = useState<ApprovalRule>(() => {
    try {
      const saved = localStorage.getItem(APPROVAL_RULE_STORAGE_KEY);
      return saved ? { ...DEFAULT_APPROVAL_RULE, ...JSON.parse(saved) } : DEFAULT_APPROVAL_RULE;
    } catch {
      return DEFAULT_APPROVAL_RULE;
    }
  });

  // Defects per tab
  const [offsetData, setOffsetData] = useState({
    defects: { cor: 0 } as Record<string, number>,
    metrics: { rework: 0, samples: 5 },
  });
  const [offsetOccurrences, setOffsetOccurrences] = useState<Record<string, OccurrenceEntry[]>>(emptyOccurrences);

  const [uvData, setUvData] = useState({
    process: 'APPLIED' as 'APPLIED' | 'NA',
    defects: { cor: 0, registro: 0, falha_verniz: 0, acabamento_aspero: 0 } as Record<string, number>,
    metrics: { rejected: 0, samples: 5 }
  });

  const [hotStampingData, setHotStampingData] = useState({
    process: 'APPLIED' as 'APPLIED' | 'NA',
    defects: { falha: 0, enchimento_texto: 0, ausencia: 0 } as Record<string, number>,
    metrics: { rejected: 0, samples: 5 }
  });

  // Production tracking
  const [unidadesPorFolha, setUnidadesPorFolha] = useState(1);
  const [folhasPorPilha, setFolhasPorPilha] = useState(500);
  const [folhasData, setFolhasData] = useState<FolhasData>({
    folhas_verificadas: 0,
    folhas_aprovadas: 0,
    folhas_escolha: 0,
    folhas_reprovadas: 0,
  });
  const [observacoesAnalista, setObservacoesAnalista] = useState('');

  // Post-save reimpressão
  const [savedInspectionId, setSavedInspectionId] = useState<string | null>(null);
  const [showReimpressaoForm, setShowReimpressaoForm] = useState(false);
  const [reimpressaoMotivo, setReimpressaoMotivo] = useState('');
  const [reimpressaoQtd, setReimpressaoQtd] = useState(0);
  const [isSubmittingReimpressao, setIsSubmittingReimpressao] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Derived
  const currentOrder = useMemo(() => orders.find(o => o.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const numeroRodada = currentOrder ? (currentOrder.rodadas_realizadas ?? 0) + 1 : 1;
  const realProducedUnits = productionMetrics.expectedUnits;

  const failureBasis = useMemo(() => {
    if (activeTab === ProcessType.OFFSET) {
      const colorFolhas = Number(offsetData.defects.cor) || 0;
      const colorUnidades = colorFolhas * unidadesPorFolha;
      const occurrenceCount = (Object.values(offsetOccurrences) as OccurrenceEntry[][]).reduce((sum, occ) => sum + occ.length, 0);
      const unitFailures = occurrenceCount + offsetData.metrics.rework;
      const totalFailures = colorUnidades + unitFailures;
      const colorRate = productionMetrics.printedSheets > 0 ? (colorFolhas / productionMetrics.printedSheets) * 100 : 0;
      const unitRate = realProducedUnits > 0 ? (unitFailures / realProducedUnits) * 100 : 0;
      const combinedRate = realProducedUnits > 0 ? (totalFailures / realProducedUnits) * 100 : 0;
      return { colorFolhas, colorUnidades, unitFailures, totalFailures, colorRate, unitRate, combinedRate };
    }
    const unitFailures = activeTab === ProcessType.UV
      ? sumDefects(uvData.defects) + uvData.metrics.rejected
      : sumDefects(hotStampingData.defects) + hotStampingData.metrics.rejected;
    const unitRate = realProducedUnits > 0 ? (unitFailures / realProducedUnits) * 100 : 0;
    return { colorFolhas: 0, colorUnidades: 0, unitFailures, totalFailures: unitFailures, colorRate: 0, unitRate, combinedRate: unitRate };
  }, [activeTab, hotStampingData.defects, hotStampingData.metrics.rejected, offsetData.defects, offsetData.metrics.rework, offsetOccurrences, productionMetrics.printedSheets, realProducedUnits, uvData.defects, uvData.metrics.rejected, unidadesPorFolha]);

  const saldo = useMemo(() => {
    const rodadas = productionMetrics.printedSheets * unidadesPorFolha;
    const em_escolha = folhasData.folhas_escolha * unidadesPorFolha;
    const reprovadas = folhasData.folhas_reprovadas * unidadesPorFolha;
    const aprovadas = folhasData.folhas_aprovadas * unidadesPorFolha;
    const divergencia = rodadas - (aprovadas + em_escolha + reprovadas);
    return { rodadas, aprovadas, em_escolha, reprovadas, divergencia, alerta_divergencia: divergencia !== 0 };
  }, [productionMetrics.printedSheets, unidadesPorFolha, folhasData]);

  const activeFailureCount = failureBasis.totalFailures;
  const calculatedStatus = useMemo(
    () => calculateStatusByRule(failureBasis.combinedRate, activeFailureCount, approvalRule),
    [activeFailureCount, approvalRule, failureBasis.combinedRate]
  );
  const failureRate = failureBasis.combinedRate;

  const updateProductionMetric = (field: keyof ProductionMetrics, value: number) => {
    setProductionMetrics(prev => ({ ...prev, [field]: Math.max(0, Number(value) || 0) }));
  };

  const updateApprovalRule = (partial: Partial<ApprovalRule>) => {
    setApprovalRule(prev => {
      const next = {
        ...prev,
        ...partial,
        restrictedLimit: Math.max(0, Number(partial.restrictedLimit ?? prev.restrictedLimit) || 0),
        rejectLimit: Math.max(0, Number(partial.rejectLimit ?? prev.rejectLimit) || 0),
      };
      localStorage.setItem(APPROVAL_RULE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const updateNewOrder = (field: keyof typeof newOrder, value: string) => {
    if (field === 'qtd_total') updateProductionMetric('expectedUnits', Number(value));
    setNewOrder(prev => ({ ...prev, [field]: field === 'op' ? value.toUpperCase() : value }));
  };

  useEffect(() => {
    if (currentOrder) {
      if (currentOrder.qtd_total) updateProductionMetric('expectedUnits', currentOrder.qtd_total);
      setUnidadesPorFolha(currentOrder.unidades_por_folha ?? 1);
      setFolhasPorPilha(currentOrder.folhas_por_pilha ?? 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder?.id]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [mRes, oRes, aRes, ordRes] = await Promise.all([
          supabase.from('machines').select('*').eq('active', true).in('area', ['producao_inicial', 'ambos']).order('name'),
          supabase.from('operators').select('*').eq('active', true).in('area', ['producao_inicial', 'ambos']).order('name'),
          supabase.from('analysts').select('*').eq('active', true).in('tipo', ['impressao', 'ambos']).order('name'),
          supabase.from('orders').select('*').eq('status', 'em_producao').order('op')
        ]);
        if (mRes.data) {
          setMachines(mRes.data);
          if (mRes.data.length > 0) setSelectedMachineId(mRes.data[0].id);
        }
        if (oRes.data) {
          setOperators(oRes.data);
          if (oRes.data.length > 0) setSelectedOperatorRows([{ rowId: nextRowId(), value: oRes.data[0].id }]);
        }
        if (aRes.data) {
          setAnalysts(aRes.data);
          if (aRes.data.length > 0) setSelectedAnalystRows([{ rowId: nextRowId(), value: aRes.data[0].id }]);
        }
        if (ordRes.data) setOrders(ordRes.data);
      } catch {
        showToast('Erro ao carregar dados mestres', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [showToast, nextRowId]);

  const resetAll = useCallback(() => {
    setOffsetData({ defects: { cor: 0 }, metrics: { rework: 0, samples: 5 } });
    setOffsetOccurrences(emptyOccurrences());
    setUvData({ process: 'APPLIED', defects: { cor: 0, registro: 0, falha_verniz: 0, acabamento_aspero: 0 }, metrics: { rejected: 0, samples: 5 } });
    setHotStampingData({ process: 'APPLIED', defects: { falha: 0, enchimento_texto: 0, ausencia: 0 }, metrics: { rejected: 0, samples: 5 } });
    setProductionMetrics({ printedSheets: 0, expectedUnits: 0 });
    setFolhasData({ folhas_verificadas: 0, folhas_aprovadas: 0, folhas_escolha: 0, folhas_reprovadas: 0 });
    setUnidadesPorFolha(1);
    setFolhasPorPilha(500);
    setObservacoesAnalista('');
    setSavedInspectionId(null);
    setShowReimpressaoForm(false);
    setReimpressaoMotivo('');
    setReimpressaoQtd(0);
  }, []);

  const handleSave = useCallback(async (andNew: boolean) => {
    const typedOp = newOrder.op.trim().toUpperCase();
    if ((!selectedOrderId && !typedOp) || !selectedMachineId) {
      showToast('Selecione a Ordem de Produção e a Máquina', 'warning');
      return;
    }
    const validOperatorIds = selectedOperatorRows.map(r => r.value).filter(id => id.trim() !== '');
    const validAnalystIds = selectedAnalystRows.map(r => r.value).filter(id => id.trim() !== '');
    if (validOperatorIds.length === 0 || validAnalystIds.length === 0) {
      showToast('Selecione pelo menos um Operador e um Analista', 'warning');
      return;
    }
    if (productionMetrics.printedSheets <= 0 || productionMetrics.expectedUnits <= 0) {
      showToast('Informe folhas rodadas e quantidade total de unidades', 'warning');
      return;
    }
    if (approvalRule.rejectLimit < approvalRule.restrictedLimit) {
      showToast('A regra de reprovação deve ser maior ou igual à regra de restrição', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      let selectedOrder = orders.find(o => o.id === selectedOrderId) || null;
      let orderId = selectedOrderId;

      if (!selectedOrder && typedOp) {
        selectedOrder = orders.find(o => o.op.toUpperCase() === typedOp) || null;
        if (!selectedOrder) {
          const payload = {
            op: typedOp,
            cliente: newOrder.cliente.trim(),
            produto: newOrder.produto.trim(),
            qtd_total: Math.max(0, Number(newOrder.qtd_total) || 0),
            status: 'em_producao',
            unidades_por_folha: unidadesPorFolha,
            folhas_por_pilha: folhasPorPilha,
          };
          const { data: created, error: createError } = await supabase.from('orders').insert([payload]).select().single();
          if (createError) {
            const { data: existing, error: findError } = await supabase.from('orders').select('*').eq('op', typedOp).single();
            if (findError || !existing) throw createError;
            selectedOrder = existing;
          } else {
            selectedOrder = created;
          }
        }
        orderId = selectedOrder?.id ?? '';
      }

      if (!selectedOrder || !orderId) {
        showToast('Não foi possível identificar a OP', 'error');
        return;
      }

      const dataToSave: Record<string, unknown> = {
        op: selectedOrder.op,
        order_id: orderId,
        machine_id: selectedMachineId,
        operator_id: validOperatorIds[0],
        analyst_id: validAnalystIds[0],
        created_at: new Date().toISOString(),
        created_by_user_id: profile?.user_id ?? null,
      };

      if (activeTab === ProcessType.OFFSET) {
        const defeitosUnidade: Record<string, { count: number; occurrences: OccurrenceEntry[] }> = {};
        for (const [k, occ] of Object.entries(offsetOccurrences) as [string, OccurrenceEntry[]][]) {
          defeitosUnidade[k] = { count: occ.length, occurrences: occ };
        }
        dataToSave.status = calculatedStatus;
        dataToSave.rework_count = offsetData.metrics.rework;
        dataToSave.samples_count = offsetData.metrics.samples;
        dataToSave.observations = JSON.stringify({
          schema_version: 2,
          process_area: 'producao_inicial',
          process_type: activeTab,
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds,
          numero_rodada: numeroRodada,
          producao: {
            unidades_por_folha: unidadesPorFolha,
            unidades_op: selectedOrder.qtd_total,
            quantidade_rodada_folhas: productionMetrics.printedSheets,
            quantidade_rodada_unidades: saldo.rodadas,
            folhas_por_pilha: folhasPorPilha,
            ...folhasData,
          },
          defeitos: {
            por_folha: { cor: offsetData.defects.cor },
            por_unidade: defeitosUnidade,
          },
          saldo_unidades: saldo,
          metricas_falha: {
            cor_folhas_com_defeito: failureBasis.colorFolhas,
            cor_unidades_equivalentes: failureBasis.colorUnidades,
            taxa_cor_por_folha: failureBasis.colorRate,
            falhas_por_unidade: failureBasis.unitFailures,
            taxa_unidade: failureBasis.unitRate,
            taxa_combinada: failureBasis.combinedRate,
          },
          reimpressao_solicitada: false,
          reimpressao_id: null,
          regra_aprovacao: approvalRule,
          status_final: calculatedStatus,
          observacoes_analista: observacoesAnalista,
        });
      } else if (activeTab === ProcessType.UV) {
        dataToSave.status = calculatedStatus;
        dataToSave.samples_count = uvData.metrics.samples;
        dataToSave.rework_count = uvData.metrics.rejected;
        dataToSave.observations = JSON.stringify({
          process: uvData.process,
          defects: uvData.defects,
          production_metrics: {
            printed_sheets: productionMetrics.printedSheets,
            expected_units: productionMetrics.expectedUnits,
            real_produced_units: realProducedUnits,
            failures: activeFailureCount,
            failure_rate: failureRate,
          },
          approval_rule: approvalRule,
          process_type: activeTab,
          process_area: 'producao_inicial',
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds,
        });
      } else if (activeTab === ProcessType.HOT_STAMPING) {
        dataToSave.status = calculatedStatus;
        dataToSave.samples_count = hotStampingData.metrics.samples;
        dataToSave.rework_count = hotStampingData.metrics.rejected;
        dataToSave.observations = JSON.stringify({
          process: hotStampingData.process,
          defects: hotStampingData.defects,
          production_metrics: {
            printed_sheets: productionMetrics.printedSheets,
            expected_units: productionMetrics.expectedUnits,
            real_produced_units: realProducedUnits,
            failures: activeFailureCount,
            failure_rate: failureRate,
          },
          approval_rule: approvalRule,
          process_type: activeTab,
          process_area: 'producao_inicial',
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds,
        });
      }

      const { data: inserted, error } = await supabase.from('inspections').insert([dataToSave]).select('id').single();
      if (error) throw error;

      if (!andNew && activeTab === ProcessType.OFFSET) {
        setSavedInspectionId(inserted.id);
        if (calculatedStatus === InspectionStatus.REJECTED || saldo.aprovadas < selectedOrder.qtd_total) {
          setReimpressaoQtd(Math.max(0, selectedOrder.qtd_total - saldo.aprovadas));
          setShowReimpressaoForm(true);
        }
      }

      showToast('Registro salvo com sucesso!', 'success');
      if (andNew) {
        resetAll();
        setSelectedOrderId('');
        setNewOrder({ op: '', cliente: '', produto: '', qtd_total: '' });
      } else if (!selectedOrderId) {
        setSelectedOrderId(orderId);
        setNewOrder({ op: '', cliente: '', produto: '', qtd_total: '' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      showToast(`Erro ao salvar: ${msg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [selectedOrderId, selectedMachineId, selectedOperatorRows, selectedAnalystRows, productionMetrics, approvalRule, calculatedStatus, realProducedUnits, activeFailureCount, failureRate, activeTab, offsetData, offsetOccurrences, uvData, hotStampingData, orders, newOrder, resetAll, showToast, profile?.user_id, unidadesPorFolha, folhasPorPilha, folhasData, saldo, failureBasis, observacoesAnalista, numeroRodada]);

  const handleSubmitReimpressao = useCallback(async () => {
    if (!reimpressaoMotivo.trim() || reimpressaoQtd <= 0 || !savedInspectionId || !currentOrder || !profile?.user_id) {
      showToast('Informe o motivo e a quantidade', 'warning');
      return;
    }
    setIsSubmittingReimpressao(true);
    try {
      const { error } = await supabase.from('op_reimpressoes').insert([{
        order_id: currentOrder.id,
        inspection_id: savedInspectionId,
        numero_rodada: numeroRodada,
        quantidade_unid: reimpressaoQtd,
        motivo: reimpressaoMotivo,
        solicitada_por: profile.user_id,
        status: 'pendente',
        machine_id: selectedMachineId || null,
        operator_id: selectedOperatorRows.find(r => r.value.trim())?.value ?? null,
      }]);
      if (error) throw error;
      showToast('Solicitação de reimpressão enviada ao supervisor', 'success');
      setShowReimpressaoForm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      showToast(`Erro ao solicitar reimpressão: ${msg}`, 'error');
    } finally {
      setIsSubmittingReimpressao(false);
    }
  }, [reimpressaoMotivo, reimpressaoQtd, savedInspectionId, currentOrder, profile?.user_id, selectedMachineId, selectedOperatorRows, showToast, numeroRodada]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); handleSave(false); }
      if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); handleSave(true); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  if (isLoading) return <div className="p-8 text-center italic">Carregando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 pb-56 md:pb-48">

      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Processo Inicial</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
            Inspeção de produção
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          {[
            { id: ProcessType.OFFSET, label: 'OFF-SET', icon: 'print' },
            { id: ProcessType.UV, label: 'UV', icon: 'flare' },
            { id: ProcessType.HOT_STAMPING, label: 'HOT STAMPING', icon: 'stars' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 h-9 rounded-lg text-[10px] font-black tracking-widest transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            >
              <span className="material-symbols-outlined text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dados da OP */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* OP picker */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Ordem de Produção (OP)</label>
            <select
              value={selectedOrderId}
              onChange={(e) => { setSelectedOrderId(e.target.value); if (e.target.value) setNewOrder({ op: '', cliente: '', produto: '', qtd_total: '' }); }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-1 focus:ring-primary/20"
            >
              <option value="">Selecionar OP...</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.op} — {o.cliente}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input value={newOrder.op} onChange={(e) => { setSelectedOrderId(''); updateNewOrder('op', e.target.value); }} className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-black outline-none focus:ring-1 focus:ring-primary/20" placeholder="Nova OP" />
              <input value={newOrder.cliente} onChange={(e) => updateNewOrder('cliente', e.target.value)} className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/20" placeholder="Cliente" />
              <input value={newOrder.produto} onChange={(e) => updateNewOrder('produto', e.target.value)} className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/20" placeholder="Produto" />
              <input type="number" min={0} value={newOrder.qtd_total} onChange={(e) => updateNewOrder('qtd_total', e.target.value)} className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/20" placeholder="Qtd. total" />
            </div>
          </div>

          {/* Máquina */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Máquina</label>
            <select value={selectedMachineId} onChange={(e) => setSelectedMachineId(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none">
              <option value="">Selecionar...</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Operadores */}
          <div className="space-y-1 flex flex-col">
            <div className="flex justify-between items-center pr-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operador(es)</label>
              <button onClick={() => setSelectedOperatorRows(prev => [...prev, { rowId: nextRowId(), value: '' }])} className="text-primary hover:bg-primary/10 rounded-full size-6 flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm font-black">add</span>
              </button>
            </div>
            <div className="space-y-2">
              {selectedOperatorRows.map((row, idx) => (
                <div key={row.rowId} className="flex gap-2">
                  <select value={row.value} onChange={(e) => { const r = [...selectedOperatorRows]; r[idx] = { ...r[idx], value: e.target.value }; setSelectedOperatorRows(r); }} className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none">
                    <option value="">Selecionar...</option>
                    {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  {selectedOperatorRows.length > 1 && (
                    <button onClick={() => setSelectedOperatorRows(selectedOperatorRows.filter((_, i) => i !== idx))} className="size-10 flex-shrink-0 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Analistas */}
          <div className="space-y-1 flex flex-col">
            <div className="flex justify-between items-center pr-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Analista(s)</label>
              <button onClick={() => setSelectedAnalystRows(prev => [...prev, { rowId: nextRowId(), value: '' }])} className="text-primary hover:bg-primary/10 rounded-full size-6 flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-sm font-black">add</span>
              </button>
            </div>
            <div className="space-y-2">
              {selectedAnalystRows.map((row, idx) => (
                <div key={row.rowId} className="flex gap-2">
                  <select value={row.value} onChange={(e) => { const r = [...selectedAnalystRows]; r[idx] = { ...r[idx], value: e.target.value }; setSelectedAnalystRows(r); }} className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none">
                    <option value="">Selecionar...</option>
                    {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  {selectedAnalystRows.length > 1 && (
                    <button onClick={() => setSelectedAnalystRows(selectedAnalystRows.filter((_, i) => i !== idx))} className="size-10 flex-shrink-0 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Unidades/folha, Folhas/pilha, Rodada */}
        <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Unid. / Folha</label>
            <input type="number" min={1} value={unidadesPorFolha} onChange={(e) => setUnidadesPorFolha(Math.max(1, Number(e.target.value) || 1))} className="h-9 w-28 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black outline-none focus:ring-1 focus:ring-primary/20" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Folhas / Pilha</label>
            <input type="number" min={1} value={folhasPorPilha} onChange={(e) => setFolhasPorPilha(Math.max(1, Number(e.target.value) || 1))} className="h-9 w-28 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black outline-none focus:ring-1 focus:ring-primary/20" />
          </div>
          <div className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary/10 border border-primary/20">
            <span className="material-symbols-outlined text-primary text-sm">repeat</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Rodada {numeroRodada}ª</span>
          </div>
          {currentOrder && (
            <div className="flex items-center gap-2 h-9 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pedido:</span>
              <span className="text-sm font-black text-slate-800 dark:text-white">{fmt(currentOrder.qtd_total)} unid.</span>
            </div>
          )}
        </div>
      </section>

      {/* Produção + Regra */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rodada {numeroRodada}</p>
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Folhas rodadas e unidades</h2>
            </div>
            <span className="material-symbols-outlined text-primary">fact_check</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Folhas rodadas *</label>
              <input type="number" min={0} value={productionMetrics.printedSheets} onChange={(e) => updateProductionMetric('printedSheets', Number(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800" />
              {productionMetrics.printedSheets > 0 && (
                <p className="text-[10px] font-bold text-primary ml-1">= {fmt(saldo.rodadas)} unidades rodadas</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Quantidade OP (unidades) *</label>
              <input type="number" min={0} value={productionMetrics.expectedUnits} onChange={(e) => updateProductionMetric('expectedUnits', Number(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total real produzido</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{fmt(realProducedUnits)}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/20">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">Falhas registradas</p>
              <p className="mt-1 text-2xl font-black text-rose-600">{fmt(activeFailureCount)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Percentual de falhas</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{failureRate.toFixed(2)}%</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950">
            Cor: {fmt(failureBasis.colorFolhas)} folhas ({failureBasis.colorRate.toFixed(2)}%) · Demais falhas: {fmt(failureBasis.unitFailures)} unidades ({failureBasis.unitRate.toFixed(2)}%)
          </div>
        </div>

        {/* Regra de aprovação */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Regra de aprovação</p>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Critério flexível</h2>
          </div>
          <div className="space-y-3">
            <select value={approvalRule.mode} onChange={(e) => updateApprovalRule({ mode: e.target.value as ApprovalRuleMode })} disabled={!isSupervisor} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black uppercase outline-none disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800">
              <option value="percent">Percentual de falhas</option>
              <option value="quantity">Quantidade de falhas</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Restrição</label>
                <input type="number" min={0} step={approvalRule.mode === 'percent' ? 0.1 : 1} value={approvalRule.restrictedLimit} onChange={(e) => updateApprovalRule({ restrictedLimit: Number(e.target.value) })} disabled={!isSupervisor} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Reprovação</label>
                <input type="number" min={0} step={approvalRule.mode === 'percent' ? 0.1 : 1} value={approvalRule.rejectLimit} onChange={(e) => updateApprovalRule({ rejectLimit: Number(e.target.value) })} disabled={!isSupervisor} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800" />
              </div>
            </div>
            <div className={`rounded-2xl p-4 ${calculatedStatus === InspectionStatus.APPROVED ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : calculatedStatus === InspectionStatus.REJECTED ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/20' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Resultado calculado</p>
              <p className="mt-1 text-xl font-black uppercase">{getStatusText(calculatedStatus)}</p>
            </div>
            {!isSupervisor && <p className="text-[10px] font-bold text-slate-400">Somente a supervisão altera os limites.</p>}
          </div>
        </div>
      </section>

      {/* Conteúdo das Abas */}
      <main className="animate-slide-in">

        {/* ABA: OFF-SET */}
        {activeTab === ProcessType.OFFSET && (
          <div className="space-y-6">

            {/* Status indicators */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: 'APPROVED', label: 'Aprovado', icon: 'check_circle', card: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10', icon_c: 'text-emerald-600', label_c: 'text-emerald-700' },
                { id: 'RESTRICTED', label: 'Aprovado c/ Restrição', icon: 'warning', card: 'border-amber-500 bg-amber-50 dark:bg-amber-500/10', icon_c: 'text-amber-600', label_c: 'text-amber-700' },
                { id: 'REJECTED', label: 'Reprovado', icon: 'cancel', card: 'border-rose-500 bg-rose-50 dark:bg-rose-500/10', icon_c: 'text-rose-600', label_c: 'text-rose-700' },
              ].map(s => (
                <div key={s.id} className={`flex items-center gap-4 px-6 h-14 rounded-2xl border-2 transition-all ${calculatedStatus === s.id ? s.card : 'border-slate-100 dark:border-slate-800 opacity-40'}`}>
                  <span className={`material-symbols-outlined text-2xl ${s.icon_c}`}>{s.icon}</span>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${s.label_c}`}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Defeitos Por Folha — somente Cor */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Contagem por Folha</p>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Cor</h3>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 bg-slate-50 dark:bg-slate-800 px-3 py-1 rounded-lg">1 folha = {unidadesPorFolha} unid.</span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-48">
                  <DefectCounter
                    name="Cor"
                    icon="palette"
                    count={offsetData.defects.cor}
                    onUpdate={(delta) => setOffsetData(prev => ({ ...prev, defects: { ...prev.defects, cor: Math.max(0, prev.defects.cor + delta) } }))}
                    onSet={(val) => setOffsetData(prev => ({ ...prev, defects: { ...prev.defects, cor: val } }))}
                  />
                </div>
                {offsetData.defects.cor > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <span className="material-symbols-outlined text-amber-500 text-sm">info</span>
                    <span className="text-xs font-black text-amber-700 dark:text-amber-400">
                      = {fmt(offsetData.defects.cor * unidadesPorFolha)} unidades equivalentes
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Defeitos Por Unidade */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Contagem por Unidade</p>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Manchas, Pintas e demais</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {UNIT_DEFECT_KEYS.map(d => (
                  <DetailedDefectCounter
                    key={d.key}
                    name={d.label}
                    icon={d.icon}
                    occurrences={offsetOccurrences[d.key] ?? []}
                    unidadesPorFolha={unidadesPorFolha}
                    onAdd={(entry) => setOffsetOccurrences(prev => ({ ...prev, [d.key]: [...(prev[d.key] ?? []), entry] }))}
                    onRemove={(idx) => setOffsetOccurrences(prev => ({ ...prev, [d.key]: prev[d.key].filter((_, i) => i !== idx) }))}
                  />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <MetricInput label="Qtd Cartucho Reprovado" icon="restart_alt" value={offsetData.metrics.rework} onChange={(v) => setOffsetData(prev => ({ ...prev, metrics: { ...prev.metrics, rework: v } }))} />
                <MetricInput label="Total Amostras (unid.)" icon="science" value={offsetData.metrics.samples} onChange={(v) => setOffsetData(prev => ({ ...prev, metrics: { ...prev.metrics, samples: v } }))} />
              </div>
            </div>

            {/* Distribuição de Pilhas */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rastreabilidade</p>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Distribuição de Folhas</h3>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 bg-slate-50 dark:bg-slate-800 px-3 py-1 rounded-lg">1 folha = {fmt(unidadesPorFolha)} unid.</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricInput label="Verificadas" icon="search" value={folhasData.folhas_verificadas} onChange={(v) => setFolhasData(prev => ({ ...prev, folhas_verificadas: v }))} />
                <MetricInput label="Aprovadas" icon="check_circle" value={folhasData.folhas_aprovadas} onChange={(v) => setFolhasData(prev => ({ ...prev, folhas_aprovadas: v }))} />
                <MetricInput label="P/ Escolha" icon="filter_list" value={folhasData.folhas_escolha} onChange={(v) => setFolhasData(prev => ({ ...prev, folhas_escolha: v }))} />
                <MetricInput label="Reprovadas" icon="cancel" value={folhasData.folhas_reprovadas} onChange={(v) => setFolhasData(prev => ({ ...prev, folhas_reprovadas: v }))} />
              </div>
            </div>

            {/* Painel de Saldo */}
            {saldo.rodadas > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saldo da OP</p>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Rodada {numeroRodada}ª</h3>
                  </div>
                  <div className="flex gap-4 text-right">
                    {currentOrder && <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Qtd. pedida</p><p className="font-black text-slate-700 dark:text-slate-200">{fmt(currentOrder.qtd_total)}</p></div>}
                    <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Qtd. rodada</p><p className="font-black text-slate-700 dark:text-slate-200">{fmt(saldo.rodadas)}</p></div>
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    { label: 'Aprovadas', value: saldo.aprovadas, color: 'bg-emerald-500' },
                    { label: 'Em escolha', value: saldo.em_escolha, color: 'bg-amber-400' },
                    { label: 'Reprovadas', value: saldo.reprovadas, color: 'bg-rose-500' },
                  ].map(row => {
                    const pct = saldo.rodadas > 0 ? (row.value / saldo.rodadas) * 100 : 0;
                    return (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="w-24 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">{row.label}</span>
                        <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="w-24 text-xs font-black text-slate-700 dark:text-slate-300">{fmt(row.value)}</span>
                        <span className="w-12 text-[10px] font-bold text-slate-400 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>

                {saldo.alerta_divergencia && (
                  <div className="mt-3 flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
                    <span className="material-symbols-outlined text-rose-500">error</span>
                    <span className="text-xs font-black text-rose-700 dark:text-rose-400">
                      Divergência: {fmt(Math.abs(saldo.divergencia))} unidades não contabilizadas — revise a distribuição de pilhas
                    </span>
                  </div>
                )}

                <div className={`mt-3 flex items-center justify-between px-4 py-3 rounded-xl ${calculatedStatus === InspectionStatus.APPROVED ? 'bg-emerald-50 dark:bg-emerald-950/20' : calculatedStatus === InspectionStatus.REJECTED ? 'bg-rose-50 dark:bg-rose-950/20' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Taxa de falha: {failureRate.toFixed(2)}%</span>
                  <span className={`text-xs font-black uppercase tracking-widest ${calculatedStatus === InspectionStatus.APPROVED ? 'text-emerald-700' : calculatedStatus === InspectionStatus.REJECTED ? 'text-rose-700' : 'text-amber-700'}`}>
                    → {getStatusText(calculatedStatus)}
                  </span>
                </div>
              </div>
            )}

            {/* Observações */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Observações do analista</label>
              <textarea
                value={observacoesAnalista}
                onChange={(e) => setObservacoesAnalista(e.target.value)}
                placeholder="Notas sobre o lote, restrições ou ocorrências..."
                className="mt-2 w-full h-20 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-primary/20 resize-none"
              />
            </div>
          </div>
        )}

        {/* ABA: UV */}
        {activeTab === ProcessType.UV && (
          <div className="space-y-8">
            <div className="flex gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 mr-4 self-center">Processo:</label>
              {(['APPLIED', 'NA'] as const).map(v => (
                <button key={v} onClick={() => setUvData(prev => ({ ...prev, process: v }))} className={`px-6 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${uvData.process === v ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  {v === 'APPLIED' ? 'APLICADO' : 'NÃO APLICÁVEL'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: 'cor', label: 'Cor', icon: 'palette' },
                { key: 'registro', label: 'Registro', icon: 'grid_view' },
                { key: 'falha_verniz', label: 'Falha Verniz', icon: 'imagesearch_roller' },
                { key: 'acabamento_aspero', label: 'Acab. Áspero', icon: 'texture' },
              ].map(d => (
                <DefectCounter key={d.key} name={d.label} icon={d.icon} count={uvData.defects[d.key]}
                  onUpdate={(delta) => setUvData(prev => ({ ...prev, defects: { ...prev.defects, [d.key]: Math.max(0, prev.defects[d.key] + delta) } }))}
                  onSet={(val) => setUvData(prev => ({ ...prev, defects: { ...prev.defects, [d.key]: val } }))}
                />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <MetricInput label="Reprovados" icon="cancel" value={uvData.metrics.rejected} onChange={(v) => setUvData(prev => ({ ...prev, metrics: { ...prev.metrics, rejected: v } }))} />
              <MetricInput label="Amostras" icon="science" value={uvData.metrics.samples} onChange={(v) => setUvData(prev => ({ ...prev, metrics: { ...prev.metrics, samples: v } }))} />
            </div>
          </div>
        )}

        {/* ABA: HOT STAMPING */}
        {activeTab === ProcessType.HOT_STAMPING && (
          <div className="space-y-8">
            <div className="flex gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 mr-4 self-center">Processo:</label>
              {(['APPLIED', 'NA'] as const).map(v => (
                <button key={v} onClick={() => setHotStampingData(prev => ({ ...prev, process: v }))} className={`px-6 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${hotStampingData.process === v ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  {v === 'APPLIED' ? 'APLICADO' : 'NÃO APLICÁVEL'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: 'falha', label: 'Falha', icon: 'warning' },
                { key: 'enchimento_texto', label: 'Enchimento Texto', icon: 'format_color_fill' },
                { key: 'ausencia', label: 'Ausência', icon: 'visibility_off' },
              ].map(d => (
                <DefectCounter key={d.key} name={d.label} icon={d.icon} count={hotStampingData.defects[d.key]}
                  onUpdate={(delta) => setHotStampingData(prev => ({ ...prev, defects: { ...prev.defects, [d.key]: Math.max(0, prev.defects[d.key] + delta) } }))}
                  onSet={(val) => setHotStampingData(prev => ({ ...prev, defects: { ...prev.defects, [d.key]: val } }))}
                />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <MetricInput label="Reprovados" icon="cancel" value={hotStampingData.metrics.rejected} onChange={(v) => setHotStampingData(prev => ({ ...prev, metrics: { ...prev.metrics, rejected: v } }))} />
              <MetricInput label="Amostras" icon="science" value={hotStampingData.metrics.samples} onChange={(v) => setHotStampingData(prev => ({ ...prev, metrics: { ...prev.metrics, samples: v } }))} />
            </div>
          </div>
        )}
      </main>

      {/* Formulário de Reimpressão (pós-save) */}
      {showReimpressaoForm && currentOrder && (
        <div className="rounded-3xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-6 shadow-lg space-y-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-rose-500 text-2xl mt-0.5">warning</span>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-rose-800 dark:text-rose-300">Quantidade Insuficiente para a OP</h3>
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-1">
                Pedido: {fmt(currentOrder.qtd_total)} · Aprovadas: {fmt(saldo.aprovadas)} · Faltam: {fmt(Math.max(0, currentOrder.qtd_total - saldo.aprovadas))} unidades
              </p>
            </div>
            <button onClick={() => setShowReimpressaoForm(false)} className="ml-auto text-rose-400 hover:text-rose-600 transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-rose-500 ml-1">Motivo da reimpressão *</label>
              <input
                value={reimpressaoMotivo}
                onChange={(e) => setReimpressaoMotivo(e.target.value)}
                placeholder="Descreva o motivo da reimpressão..."
                className="w-full h-10 px-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-sm font-bold outline-none focus:ring-1 focus:ring-rose-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-rose-500 ml-1">Qtd. a reimprimir (unid.) *</label>
              <input
                type="number"
                min={1}
                value={reimpressaoQtd}
                onChange={(e) => setReimpressaoQtd(Math.max(1, Number(e.target.value) || 0))}
                className="w-full h-10 px-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-sm font-black outline-none focus:ring-1 focus:ring-rose-300"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmitReimpressao}
              disabled={isSubmittingReimpressao || !reimpressaoMotivo.trim() || reimpressaoQtd <= 0}
              className="h-10 px-6 rounded-xl bg-rose-600 text-white font-black text-[10px] tracking-widest hover:bg-rose-700 transition-all disabled:opacity-50 uppercase"
            >
              {isSubmittingReimpressao ? 'Enviando...' : 'Solicitar Reimpressão'}
            </button>
            <p className="text-[10px] font-bold text-rose-500">Aguarda aprovação do supervisor antes de iniciar nova rodada.</p>
          </div>
        </div>
      )}

      {/* Rodapé Fixo */}
      <footer className="fixed bottom-0 left-[var(--sidebar-width)] right-0 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 z-30">
        <button onClick={resetAll} className="h-10 px-6 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-[10px] tracking-widest hover:bg-slate-50 transition-all text-slate-500 uppercase w-full sm:w-auto">
          LIMPAR
        </button>
        <button onClick={() => handleSave(false)} disabled={isSaving} className="h-10 px-6 rounded-xl border-2 border-primary text-primary font-black text-[10px] tracking-widest hover:bg-primary/5 transition-all disabled:opacity-50 uppercase w-full sm:w-auto">
          {isSaving ? '...' : 'SALVAR'}
        </button>
        <button onClick={() => handleSave(true)} disabled={isSaving} className="h-10 px-8 rounded-xl bg-primary text-white font-black text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50 uppercase w-full sm:w-auto">
          {isSaving ? 'SINC...' : 'SALVAR E NOVO'}
        </button>
      </footer>
    </div>
  );
}
