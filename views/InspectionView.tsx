
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { InspectionStatus, ProcessType, Machine, Operator, Analyst, EscolhaData, Order } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';

// --- Sub-componentes ---

const DefectCounter: React.FC<{
  name: string;
  icon: string;
  count: number;
  onUpdate: (delta: number) => void;
  onSet: (val: number) => void;
}> = ({ name, icon, count, onUpdate, onSet }) => (
  <div className={`flex items-center justify-between p-2 rounded-xl border transition-all bg-white dark:bg-slate-900/50 group ${count > 0
    ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
    : 'border-slate-100 dark:border-slate-800'
    }`}>
    <div className="flex items-center gap-2 overflow-hidden">
      <span className="material-symbols-outlined text-base text-primary p-1">{icon}</span>
      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase truncate">{name}</span>
    </div>
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onUpdate(-1)}
        className="size-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"
      >
        <span className="material-symbols-outlined text-sm">remove</span>
      </button>
      <input
        type="number"
        value={count || ''}
        onChange={(e) => onSet(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-10 h-6 text-center font-black text-[11px] bg-slate-50 dark:bg-slate-800 rounded border-none outline-none focus:ring-1 focus:ring-primary/30"
        placeholder="0"
      />
      <button
        type="button"
        onClick={() => onUpdate(1)}
        className="size-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 transition-colors"
      >
        <span className="material-symbols-outlined text-sm">add</span>
      </button>
    </div>
  </div>
);

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
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-6 bg-transparent text-center font-black text-xs outline-none"
      />
      <button type="button" onClick={() => onChange(value + 1)} className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs">+</button>
    </div>
  </div>
);

type OffsetEscolhaNumericKeys = 'op_total_unidades' | 'folhas_impressas_total' | 'folhas_revisadas_pilha' | 'escolhas_unidades';

const OFFSET_ESCOLHA_FIELDS: Array<{ key: OffsetEscolhaNumericKeys; label: string }> = [
  { key: 'op_total_unidades', label: 'OP total (unidades)' },
  { key: 'folhas_impressas_total', label: 'Folhas impressas' },
  { key: 'folhas_revisadas_pilha', label: 'Folhas revisadas na pilha' },
  { key: 'escolhas_unidades', label: 'Pilhas separadas p/ revisão' },
];

const OffsetEscolhaCard: React.FC<{ value: EscolhaData; onChange: (partial: Partial<EscolhaData>) => void }> = ({ value, onChange }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Escolha</p>
        <p className="text-xs text-slate-700 dark:text-slate-300">Quantidades finais do processo de separação.</p>
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">Unidades</span>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {OFFSET_ESCOLHA_FIELDS.map(field => (
        <div key={field.key} className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">{field.label}</label>
          <input
            type="number"
            min={0}
            value={(value[field.key] ?? 0).toString()}
            onChange={(e) => onChange({
              [field.key]: Math.max(0, Number(e.target.value))
            })}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
      ))}
    </div>
    <div className="space-y-1">
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Observações e restrições</label>
      <textarea
        value={value.observacoes ?? ''}
        onChange={(e) => onChange({ observacoes: e.target.value })}
        placeholder="Notas sobre o lote..."
        className="w-full h-20 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-primary/20 resize-none"
      />
    </div>
  </div>
);

type ApprovalRuleMode = 'percent' | 'quantity';
type ApprovalRule = { mode: ApprovalRuleMode; restrictedLimit: number; rejectLimit: number };
type ProductionMetrics = { printedSheets: number; expectedUnits: number; scrapUnits: number };

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

// --- Componente Principal ---

export default function InspectionView() {
  const { showToast } = useToast();
  const { profile, isSupervisor } = useUser();
  const rowIdRef = useRef(0);
  const nextRowId = useCallback(() => `row-${rowIdRef.current++}`, []);

  type SelectRow = { rowId: string; value: string };

  // Dados Mestres
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // Estados Genéricos (Topo)
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [newOrder, setNewOrder] = useState({ op: '', cliente: '', produto: '', qtd_total: '' });
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedOperatorRows, setSelectedOperatorRows] = useState<SelectRow[]>([{ rowId: nextRowId(), value: '' }]);
  const [selectedAnalystRows, setSelectedAnalystRows] = useState<SelectRow[]>([{ rowId: nextRowId(), value: '' }]);
  const [activeTab, setActiveTab] = useState<ProcessType>(ProcessType.OFFSET);
  const [productionMetrics, setProductionMetrics] = useState<ProductionMetrics>({ printedSheets: 0, expectedUnits: 0, scrapUnits: 0 });
  const [approvalRule, setApprovalRule] = useState<ApprovalRule>(() => {
    try {
      const saved = localStorage.getItem(APPROVAL_RULE_STORAGE_KEY);
      return saved ? { ...DEFAULT_APPROVAL_RULE, ...JSON.parse(saved) } : DEFAULT_APPROVAL_RULE;
    } catch {
      return DEFAULT_APPROVAL_RULE;
    }
  });

  // Estados por Aba
  const [offsetData, setOffsetData] = useState({
    status: InspectionStatus.APPROVED,
    defects: {
      cor: 0, manchas: 0, pintas: 0, fiapos: 0, registro: 0,
      falha_verniz: 0, falha_texto: 0, texto_fechado: 0
    },
    metrics: { rework: 0, samples: 5 },
    escolha: {
      op_total_unidades: 0,
      folhas_impressas_total: 0,
      folhas_revisadas_pilha: 0,
      escolhas_unidades: 0,
      observacoes: ''
    }
  });

  const [uvData, setUvData] = useState({
    process: 'APPLIED' as 'APPLIED' | 'NA',
    defects: { cor: 0, registro: 0, falha_verniz: 0, acabamento_aspero: 0 },
    metrics: { rejected: 0, samples: 5 }
  });

  const [hotStampingData, setHotStampingData] = useState({
    process: 'APPLIED' as 'APPLIED' | 'NA',
    defects: { falha: 0, enchimento_texto: 0, ausencia: 0 },
    metrics: { rejected: 0, samples: 5 }
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const realProducedUnits = Math.max(0, productionMetrics.expectedUnits - productionMetrics.scrapUnits);

  const failureBasis = useMemo(() => {
    if (activeTab === ProcessType.OFFSET) {
      const colorFailures = Number(offsetData.defects.cor) || 0;
      const unitFailures = sumDefects({ ...offsetData.defects, cor: 0 }) + offsetData.metrics.rework;
      const colorRate = productionMetrics.printedSheets > 0 ? (colorFailures / productionMetrics.printedSheets) * 100 : 0;
      const unitRate = realProducedUnits > 0 ? (unitFailures / realProducedUnits) * 100 : 0;

      return {
        colorFailures,
        unitFailures,
        totalFailures: colorFailures + unitFailures,
        colorRate,
        unitRate,
        combinedRate: colorRate + unitRate
      };
    }

    const unitFailures = activeTab === ProcessType.UV
      ? sumDefects(uvData.defects) + uvData.metrics.rejected
      : sumDefects(hotStampingData.defects) + hotStampingData.metrics.rejected;
    const unitRate = realProducedUnits > 0 ? (unitFailures / realProducedUnits) * 100 : 0;

    return {
      colorFailures: 0,
      unitFailures,
      totalFailures: unitFailures,
      colorRate: 0,
      unitRate,
      combinedRate: unitRate
    };
  }, [activeTab, hotStampingData.defects, hotStampingData.metrics.rejected, offsetData.defects, offsetData.metrics.rework, productionMetrics.printedSheets, realProducedUnits, uvData.defects, uvData.metrics.rejected]);

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
    const selectedOrder = orders.find(order => order.id === selectedOrderId);
    if (selectedOrder?.qtd_total) {
      updateProductionMetric('expectedUnits', selectedOrder.qtd_total);
    }
  }, [orders, selectedOrderId]);

  // Carregar dados iniciais
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
      } catch (err) {
        showToast('Erro ao carregar dados mestres', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [showToast, nextRowId]);

  const resetAll = useCallback(() => {
    // ... manter lógica anterior de reset ...
    setOffsetData({
      status: InspectionStatus.APPROVED,
      defects: { cor: 0, manchas: 0, pintas: 0, fiapos: 0, registro: 0, falha_verniz: 0, falha_texto: 0, texto_fechado: 0 },
      metrics: { rework: 0, samples: 5 },
      escolha: {
        op_total_unidades: 0,
        folhas_impressas_total: 0,
        folhas_revisadas_pilha: 0,
        escolhas_unidades: 0,
        observacoes: ''
      }
    });
    setUvData({
      process: 'APPLIED',
      defects: { cor: 0, registro: 0, falha_verniz: 0, acabamento_aspero: 0 },
      metrics: { rejected: 0, samples: 5 }
    });
    setHotStampingData({
      process: 'APPLIED',
      defects: { falha: 0, enchimento_texto: 0, ausencia: 0 },
      metrics: { rejected: 0, samples: 5 }
    });
    setProductionMetrics({ printedSheets: 0, expectedUnits: 0, scrapUnits: 0 });
  }, []);

  const handleSave = useCallback(async (andNew: boolean) => {
    // Validate required fields
    const typedOp = newOrder.op.trim().toUpperCase();
    if ((!selectedOrderId && !typedOp) || !selectedMachineId) {
      showToast('Selecione a Ordem de Produção e a Máquina', 'warning');
      return;
    }
    let selectedOrder = orders.find(o => o.id === selectedOrderId) || null;
    let orderId = selectedOrderId;

    // Filter out empty selections
    const validOperatorIds = selectedOperatorRows.map(r => r.value).filter(id => id.trim() !== '');
    const validAnalystIds = selectedAnalystRows.map(r => r.value).filter(id => id.trim() !== '');

    if (validOperatorIds.length === 0 || validAnalystIds.length === 0) {
      showToast('Selecione pelo menos um Operador e um Analista', 'warning');
      return;
    }
    if (productionMetrics.printedSheets <= 0 || productionMetrics.expectedUnits <= 0) {
      showToast('Informe folhas impressas e quantidade total de unidades', 'warning');
      return;
    }
    if (approvalRule.rejectLimit < approvalRule.restrictedLimit) {
      showToast('A regra de reprovação deve ser maior ou igual à regra de restrição', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      if (!selectedOrder && typedOp) {
        selectedOrder = orders.find(o => o.op.toUpperCase() === typedOp) || null;

        if (!selectedOrder) {
          const payload = {
            op: typedOp,
            cliente: newOrder.cliente.trim(),
            produto: newOrder.produto.trim(),
            qtd_total: Math.max(0, Number(newOrder.qtd_total) || 0),
            status: 'em_producao'
          };

          const { data: created, error: createError } = await supabase
            .from('orders')
            .insert([payload])
            .select()
            .single();

          if (createError) {
            const { data: existing, error: findError } = await supabase
              .from('orders')
              .select('*')
              .eq('op', typedOp)
              .single();

            if (findError || !existing) throw createError;
            selectedOrder = existing;
          } else {
            selectedOrder = created;
          }
        }

        orderId = selectedOrder?.id ?? '';
      }

      if (!selectedOrder || !orderId) {
        showToast('Nao foi possivel identificar a OP', 'error');
        return;
      }

      let dataToSave: any = {
        op: selectedOrder.op,
        order_id: orderId,
        machine_id: selectedMachineId,
        operator_id: validOperatorIds[0],
        analyst_id: validAnalystIds[0],
        created_at: new Date().toISOString(),
        created_by_user_id: profile?.user_id ?? null,
      };

      // Montar payload específico por aba
      if (activeTab === ProcessType.OFFSET) {
        dataToSave.status = calculatedStatus;
        dataToSave.rework_count = offsetData.metrics.rework;
        dataToSave.samples_count = offsetData.metrics.samples;
        dataToSave.observations = JSON.stringify({
          defects: offsetData.defects,
          escolha: {
            ...offsetData.escolha,
            op_total_unidades: productionMetrics.expectedUnits,
            folhas_impressas_total: productionMetrics.printedSheets
          },
          production_metrics: {
            printed_sheets: productionMetrics.printedSheets,
            expected_units: productionMetrics.expectedUnits,
            scrap_units: productionMetrics.scrapUnits,
            real_produced_units: realProducedUnits,
            failures: activeFailureCount,
            failure_rate: failureRate,
            color_failures_by_sheet: failureBasis.colorFailures,
            unit_failures: failureBasis.unitFailures,
            color_failure_rate: failureBasis.colorRate,
            unit_failure_rate: failureBasis.unitRate
          },
          approval_rule: approvalRule,
          process_type: activeTab,
          process_area: 'producao_inicial',
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds
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
            scrap_units: productionMetrics.scrapUnits,
            real_produced_units: realProducedUnits,
            failures: activeFailureCount,
            failure_rate: failureRate,
            color_failures_by_sheet: failureBasis.colorFailures,
            unit_failures: failureBasis.unitFailures,
            color_failure_rate: failureBasis.colorRate,
            unit_failure_rate: failureBasis.unitRate
          },
          approval_rule: approvalRule,
          process_type: activeTab,
          process_area: 'producao_inicial',
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds
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
            scrap_units: productionMetrics.scrapUnits,
            real_produced_units: realProducedUnits,
            failures: activeFailureCount,
            failure_rate: failureRate,
            color_failures_by_sheet: failureBasis.colorFailures,
            unit_failures: failureBasis.unitFailures,
            color_failure_rate: failureBasis.colorRate,
            unit_failure_rate: failureBasis.unitRate
          },
          approval_rule: approvalRule,
          process_type: activeTab,
          process_area: 'producao_inicial',
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds
        });
      }

      const { error } = await supabase.from('inspections').insert([dataToSave]);
      if (error) throw error;

      showToast('Registro salvo com sucesso!', 'success');
      if (andNew) {
        resetAll();
        setSelectedOrderId('');
        setNewOrder({ op: '', cliente: '', produto: '', qtd_total: '' });
      } else if (!selectedOrderId) {
        setSelectedOrderId(orderId);
        setNewOrder({ op: '', cliente: '', produto: '', qtd_total: '' });
      }
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [selectedOrderId, selectedMachineId, selectedOperatorRows, selectedAnalystRows, productionMetrics, approvalRule, calculatedStatus, realProducedUnits, activeFailureCount, failureRate, activeTab, offsetData, uvData, hotStampingData, orders, newOrder, resetAll, showToast, profile?.user_id]);

  // Atalhos de Teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave(false);
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleSave(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  if (isLoading) return <div className="p-8 text-center italic">Carregando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 pb-56 md:pb-48">

      {/* --- Cabeçalho de Tela Compacto --- */}
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
              className={`flex items-center gap-2 px-4 h-9 rounded-lg text-[10px] font-black tracking-widest transition-all ${activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
            >
              <span className="material-symbols-outlined text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- Cabeçalho Fixo (Dados OP) --- */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-2 md:col-span-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Ordem de Produção (OP)</label>
          <select
            value={selectedOrderId}
            onChange={(e) => {
              setSelectedOrderId(e.target.value);
              if (e.target.value) setNewOrder({ op: '', cliente: '', produto: '', qtd_total: '' });
            }}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-1 focus:ring-primary/20"
          >
            <option value="">Selecionar OP...</option>
            {orders.map(o => (
              <option key={o.id} value={o.id}>{o.op} — {o.cliente}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newOrder.op}
              onChange={(e) => {
                setSelectedOrderId('');
                updateNewOrder('op', e.target.value);
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-black outline-none focus:ring-1 focus:ring-primary/20"
              placeholder="Nova OP"
            />
            <input
              value={newOrder.cliente}
              onChange={(e) => updateNewOrder('cliente', e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/20"
              placeholder="Cliente"
            />
            <input
              value={newOrder.produto}
              onChange={(e) => updateNewOrder('produto', e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/20"
              placeholder="Produto"
            />
            <input
              type="number"
              min={0}
              value={newOrder.qtd_total}
              onChange={(e) => updateNewOrder('qtd_total', e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/20"
              placeholder="Qtd. total"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Máquina</label>
          <select
            value={selectedMachineId}
            onChange={(e) => setSelectedMachineId(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
          >
            <option value="">Selecionar...</option>
            {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="space-y-1 flex flex-col">
          <div className="flex justify-between items-center pr-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operador(es)</label>
            <button
              onClick={() => setSelectedOperatorRows(prev => [...prev, { rowId: nextRowId(), value: '' }])}
              className="text-primary hover:bg-primary/10 rounded-full size-6 flex items-center justify-center transition-colors"
              aria-label="Adicionar Operador"
              data-tooltip="Adicionar Operador"
            >
              <span className="material-symbols-outlined text-sm font-black">add</span>
            </button>
          </div>
          <div className="space-y-2">
            {selectedOperatorRows.map((row, idx) => (
              <div key={row.rowId} className="flex gap-2">
                <select
                  value={row.value}
                  onChange={(e) => {
                    const newRows = [...selectedOperatorRows];
                    newRows[idx] = { ...newRows[idx], value: e.target.value };
                    setSelectedOperatorRows(newRows);
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                >
                  <option value="">Selecionar...</option>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {selectedOperatorRows.length > 1 && (
                  <button
                    onClick={() => {
                      const newRows = selectedOperatorRows.filter((_, i) => i !== idx);
                      setSelectedOperatorRows(newRows);
                    }}
                    className="size-10 flex-shrink-0 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1 flex flex-col">
          <div className="flex justify-between items-center pr-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Analista(s)</label>
            <button
              onClick={() => setSelectedAnalystRows(prev => [...prev, { rowId: nextRowId(), value: '' }])}
              className="text-primary hover:bg-primary/10 rounded-full size-6 flex items-center justify-center transition-colors"
              aria-label="Adicionar Analista"
              data-tooltip="Adicionar Analista"
            >
              <span className="material-symbols-outlined text-sm font-black">add</span>
            </button>
          </div>
          <div className="space-y-2">
            {selectedAnalystRows.map((row, idx) => (
              <div key={row.rowId} className="flex gap-2">
                <select
                  value={row.value}
                  onChange={(e) => {
                    const newRows = [...selectedAnalystRows];
                    newRows[idx] = { ...newRows[idx], value: e.target.value };
                    setSelectedAnalystRows(newRows);
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                >
                  <option value="">Selecionar...</option>
                  {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {selectedAnalystRows.length > 1 && (
                  <button
                    onClick={() => {
                      const newRows = selectedAnalystRows.filter((_, i) => i !== idx);
                      setSelectedAnalystRows(newRows);
                    }}
                    className="size-10 flex-shrink-0 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Conteúdo das Abas --- */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Produção real</p>
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Folhas, unidades e refugos</h2>
            </div>
            <span className="material-symbols-outlined text-primary">fact_check</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Folhas impressas *</label>
              <input type="number" min={0} value={productionMetrics.printedSheets} onChange={(e) => updateProductionMetric('printedSheets', Number(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Quantidade total unidades *</label>
              <input type="number" min={0} value={productionMetrics.expectedUnits} onChange={(e) => updateProductionMetric('expectedUnits', Number(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Ajustes / refugos</label>
              <input type="number" min={0} value={productionMetrics.scrapUnits} onChange={(e) => updateProductionMetric('scrapUnits', Number(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total real produzido</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{realProducedUnits.toLocaleString('pt-BR')}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/20">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">Falhas registradas</p>
              <p className="mt-1 text-2xl font-black text-rose-600">{activeFailureCount.toLocaleString('pt-BR')}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Percentual de falhas</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{failureRate.toFixed(2)}%</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950">
            Cor: {failureBasis.colorFailures.toLocaleString('pt-BR')} por folha ({failureBasis.colorRate.toFixed(2)}%) · Demais falhas: {failureBasis.unitFailures.toLocaleString('pt-BR')} por unidade ({failureBasis.unitRate.toFixed(2)}%)
          </div>
        </div>

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
            {!isSupervisor && <p className="text-[10px] font-bold text-slate-400">Somente a supervisão altera os limites. Analistas usam a regra ativa.</p>}
          </div>
        </div>
      </section>

      <main className="animate-slide-in">

        {/* ABA: OFF-SET */}
        {activeTab === ProcessType.OFFSET && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  id: 'APPROVED',
                  label: 'Aprovado',
                  icon: 'check_circle',
                  styles: {
                    card: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
                    icon: 'text-emerald-600',
                    label: 'text-emerald-700'
                  }
                },
                {
                  id: 'RESTRICTED',
                  label: 'Aprovado c/ Restrição',
                  icon: 'warning',
                  styles: {
                    card: 'border-amber-500 bg-amber-50 dark:bg-amber-500/10',
                    icon: 'text-amber-600',
                    label: 'text-amber-700'
                  }
                },
                {
                  id: 'REJECTED',
                  label: 'Reprovado',
                  icon: 'cancel',
                  styles: {
                    card: 'border-rose-500 bg-rose-50 dark:bg-rose-500/10',
                    icon: 'text-rose-600',
                    label: 'text-rose-700'
                  }
                }
              ].map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`flex items-center gap-4 px-6 h-14 rounded-2xl border-2 transition-all cursor-default ${calculatedStatus === s.id
                    ? s.styles.card
                    : 'border-slate-100 dark:border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                >
                  <span className={`material-symbols-outlined text-2xl ${s.styles.icon}`}>{s.icon}</span>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${s.styles.label}`}>{s.label}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: 'cor', label: 'Cor', icon: 'palette' },
                { key: 'manchas', label: 'Manchas', icon: 'texture' },
                { key: 'pintas', label: 'Pintas', icon: 'blur_on' },
                { key: 'fiapos', label: 'Fiapos', icon: 'straighten' },
                { key: 'registro', label: 'Registro', icon: 'grid_view' },
                { key: 'falha_verniz', label: 'Falha Verniz', icon: 'imagesearch_roller' },
                { key: 'falha_texto', label: 'Falha Texto', icon: 'format_color_text' },
                { key: 'texto_fechado', label: 'Texto Fechado', icon: 'block' },
              ].map(d => (
                <DefectCounter
                  key={d.key}
                  name={d.label}
                  icon={d.icon}
                  count={(offsetData.defects as any)[d.key]}
                  onUpdate={(delta) => setOffsetData(prev => ({
                    ...prev,
                    defects: { ...prev.defects, [d.key]: Math.max(0, (prev.defects as any)[d.key] + delta) }
                  }))}
                  onSet={(val) => setOffsetData(prev => ({
                    ...prev,
                    defects: { ...prev.defects, [d.key]: val }
                  }))}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <MetricInput
                label="Qtd Cartucho Reprovado"
                icon="restart_alt"
                value={offsetData.metrics.rework}
                onChange={(v) => setOffsetData(prev => ({ ...prev, metrics: { ...prev.metrics, rework: v } }))}
              />
              <MetricInput
                label="Total Amostras (unid.)"
                icon="science"
                value={offsetData.metrics.samples}
                onChange={(v) => setOffsetData(prev => ({ ...prev, metrics: { ...prev.metrics, samples: v } }))}
              />
            </div>
            <OffsetEscolhaCard
              value={offsetData.escolha}
              onChange={(partial) => setOffsetData(prev => ({ ...prev, escolha: { ...prev.escolha, ...partial } }))}
            />
          </div>
        )}

        {/* ABA: UV */}
        {activeTab === ProcessType.UV && (
          <div className="space-y-8">
            <div className="flex gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 mr-4 self-center">Processo:</label>
              {['APPLIED', 'NA'].map(v => (
                <button
                  key={v}
                  onClick={() => setUvData(prev => ({ ...prev, process: v as any }))}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${uvData.process === v
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                >
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
                <DefectCounter
                  key={d.key}
                  name={d.label}
                  icon={d.icon}
                  count={(uvData.defects as any)[d.key]}
                  onUpdate={(delta) => setUvData(prev => ({
                    ...prev,
                    defects: { ...prev.defects, [d.key]: Math.max(0, (prev.defects as any)[d.key] + delta) }
                  }))}
                  onSet={(val) => setUvData(prev => ({
                    ...prev,
                    defects: { ...prev.defects, [d.key]: val }
                  }))}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <MetricInput
                label="Reprovados"
                icon="cancel"
                value={uvData.metrics.rejected}
                onChange={(v) => setUvData(prev => ({ ...prev, metrics: { ...prev.metrics, rejected: v } }))}
              />
              <MetricInput
                label="Amostras"
                icon="science"
                value={uvData.metrics.samples}
                onChange={(v) => setUvData(prev => ({ ...prev, metrics: { ...prev.metrics, samples: v } }))}
              />
            </div>
          </div>
        )}

        {/* ABA: HOT STAMPING */}
        {activeTab === ProcessType.HOT_STAMPING && (
          <div className="space-y-8">
            <div className="flex gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 mr-4 self-center">Processo:</label>
              {['APPLIED', 'NA'].map(v => (
                <button
                  key={v}
                  onClick={() => setHotStampingData(prev => ({ ...prev, process: v as any }))}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${hotStampingData.process === v
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}
                >
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
                <DefectCounter
                  key={d.key}
                  name={d.label}
                  icon={d.icon}
                  count={(hotStampingData.defects as any)[d.key]}
                  onUpdate={(delta) => setHotStampingData(prev => ({
                    ...prev,
                    defects: { ...prev.defects, [d.key]: Math.max(0, (prev.defects as any)[d.key] + delta) }
                  }))}
                  onSet={(val) => setHotStampingData(prev => ({
                    ...prev,
                    defects: { ...prev.defects, [d.key]: val }
                  }))}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <MetricInput
                label="Reprovados"
                icon="cancel"
                value={hotStampingData.metrics.rejected}
                onChange={(v) => setHotStampingData(prev => ({ ...prev, metrics: { ...prev.metrics, rejected: v } }))}
              />
              <MetricInput
                label="Amostras"
                icon="science"
                value={hotStampingData.metrics.samples}
                onChange={(v) => setHotStampingData(prev => ({ ...prev, metrics: { ...prev.metrics, samples: v } }))}
              />
            </div>
          </div>
        )}
      </main>

      {/* --- Rodapé Fixo Compacto --- */}
      <footer className="fixed bottom-0 left-[var(--sidebar-width)] right-0 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 z-30">
        <button
          onClick={resetAll}
          className="h-10 px-6 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-[10px] tracking-widest hover:bg-slate-50 transition-all text-slate-500 uppercase w-full sm:w-auto"
        >
          LIMPAR
        </button>
        <button
          onClick={() => handleSave(false)}
          disabled={isSaving}
          className="h-10 px-6 rounded-xl border-2 border-primary text-primary font-black text-[10px] tracking-widest hover:bg-primary/5 transition-all disabled:opacity-50 uppercase w-full sm:w-auto"
        >
          {isSaving ? '...' : 'SALVAR'}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={isSaving}
          className="h-10 px-8 rounded-xl bg-primary text-white font-black text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50 uppercase w-full sm:w-auto"
        >
          {isSaving ? 'SINC...' : 'SALVAR E NOVO'}
        </button>
      </footer>
    </div>
  );
}
