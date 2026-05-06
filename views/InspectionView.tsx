
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { InspectionStatus, ProcessType, Machine, Operator, Analyst, EscolhaData } from '../types';
import { useToast } from '../contexts/ToastContext';

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
  { key: 'escolhas_unidades', label: 'Escolhas (unidades)' },
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

// --- Componente Principal ---

export default function InspectionView() {
  const { showToast } = useToast();
  const rowIdRef = useRef(0);
  const nextRowId = useCallback(() => `row-${rowIdRef.current++}`, []);

  type SelectRow = { rowId: string; value: string };

  // Dados Mestres
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);

  // Estados Genéricos (Topo)
  const [selectedOP, setSelectedOP] = useState('');
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedOperatorRows, setSelectedOperatorRows] = useState<SelectRow[]>([{ rowId: nextRowId(), value: '' }]);
  const [selectedAnalystRows, setSelectedAnalystRows] = useState<SelectRow[]>([{ rowId: nextRowId(), value: '' }]);
  const [activeTab, setActiveTab] = useState<ProcessType>(ProcessType.OFFSET);

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

  // Carregar dados iniciais
  useEffect(() => {
    async function fetchData() {
      try {
        const [mRes, oRes, aRes] = await Promise.all([
          supabase.from('machines').select('*').eq('active', true).in('area', ['producao_inicial', 'ambos']).order('name'),
          supabase.from('operators').select('*').eq('active', true).in('area', ['producao_inicial', 'ambos']).order('name'),
          supabase.from('analysts').select('*').eq('active', true).order('name')
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
  }, []);

  const handleSave = useCallback(async (andNew: boolean) => {
    // Validate required fields
    if (!selectedOP || !selectedMachineId) {
      showToast('Preencha os campos fixos do cabeçalho', 'warning');
      return;
    }

    // Filter out empty selections
    const validOperatorIds = selectedOperatorRows.map(r => r.value).filter(id => id.trim() !== '');
    const validAnalystIds = selectedAnalystRows.map(r => r.value).filter(id => id.trim() !== '');

    if (validOperatorIds.length === 0 || validAnalystIds.length === 0) {
      showToast('Selecione pelo menos um Operador e um Analista', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      let dataToSave: any = {
        op: selectedOP,
        machine_id: selectedMachineId,
        operator_id: validOperatorIds[0], // Primary operator for FK compatibility
        analyst_id: validAnalystIds[0], // Primary analyst for FK compatibility
        // process_type removed due to schema missing
        created_at: new Date().toISOString()
      };

      // Montar payload específico por aba
      if (activeTab === ProcessType.OFFSET) {
        dataToSave.status = offsetData.status;
        dataToSave.rework_count = offsetData.metrics.rework;
        dataToSave.samples_count = offsetData.metrics.samples;
        dataToSave.observations = JSON.stringify({
          defects: offsetData.defects,
          escolha: offsetData.escolha,
          process_type: activeTab,
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds
        });
      } else if (activeTab === ProcessType.UV) {
        dataToSave.status = uvData.metrics.rejected > 0 ? 'REJECTED' : 'APPROVED';
        dataToSave.samples_count = uvData.metrics.samples;
        dataToSave.rework_count = uvData.metrics.rejected;
        dataToSave.observations = JSON.stringify({
          process: uvData.process,
          defects: uvData.defects,
          process_type: activeTab,
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds
        });
      } else if (activeTab === ProcessType.HOT_STAMPING) {
        dataToSave.status = hotStampingData.metrics.rejected > 0 ? 'REJECTED' : 'APPROVED';
        dataToSave.samples_count = hotStampingData.metrics.samples;
        dataToSave.rework_count = hotStampingData.metrics.rejected;
        dataToSave.observations = JSON.stringify({
          process: hotStampingData.process,
          defects: hotStampingData.defects,
          process_type: activeTab,
          all_operator_ids: validOperatorIds,
          all_analyst_ids: validAnalystIds
        });
      }

      const { error } = await supabase.from('inspections').insert([dataToSave]);
      if (error) throw error;

      showToast('Registro salvo com sucesso!', 'success');
      if (andNew) {
        resetAll();
        setSelectedOP('');
      }
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [selectedOP, selectedMachineId, selectedOperatorRows, selectedAnalystRows, activeTab, offsetData, uvData, hotStampingData, resetAll, showToast]);

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
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Inspeção de Produção</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
            Qualidade • Processos Produtivos
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
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Ordem de Produção (OP)</label>
          <input
            type="text"
            value={selectedOP}
            onChange={(e) => setSelectedOP(e.target.value.toUpperCase())}
            className="w-full h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-1 focus:ring-primary/20 outline-none"
            placeholder="00000"
          />
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
              title="Adicionar Operador"
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
              title="Adicionar Analista"
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
                  onClick={() => setOffsetData(prev => ({ ...prev, status: s.id as any }))}
                  className={`flex items-center gap-4 px-6 h-14 rounded-2xl border-2 transition-all ${offsetData.status === s.id
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
