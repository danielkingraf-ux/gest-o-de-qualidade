
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { InspectionStatus, ProcessType, Machine, Operator, Analyst, Order } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import DefectCounter from '../components/DefectCounter';
import { escolhaRevisaoService } from '../services/escolhaRevisaoService';
import type { OrigemProblemaEscolha } from '../types';

const MetricInput: React.FC<{
  label: string;
  value: number;
  onChange: (val: number) => void;
  icon: string;
  subtitle?: string;
  accent?: boolean;
  disabled?: boolean;
}> = ({ label, value, onChange, icon, subtitle, accent, disabled }) => (
  <div className={`flex flex-col gap-1 p-3 rounded-xl border ${accent ? 'bg-primary/5 border-primary/20' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
    <div className="flex items-center gap-1.5 mb-1">
      <span className={`material-symbols-outlined text-xs ${accent ? 'text-primary' : 'text-slate-400'}`}>{icon}</span>
      <label className={`text-[9px] font-black uppercase tracking-widest ${accent ? 'text-primary' : 'text-slate-400'}`}>{label}</label>
    </div>
    <div className="flex items-center gap-2">
      <button type="button" disabled={disabled} onClick={() => onChange(Math.max(0, value - 1))} className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs disabled:opacity-40">-</button>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full h-6 bg-transparent text-center font-black text-xs outline-none disabled:opacity-100"
      />
      <button type="button" disabled={disabled} onClick={() => onChange(value + 1)} className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs disabled:opacity-40">+</button>
    </div>
    {subtitle && <p className="text-[9px] font-bold text-slate-400 text-center mt-0.5">{subtitle}</p>}
  </div>
);

type ApprovalRuleMode = 'percent' | 'quantity';
type ApprovalRule = { mode: ApprovalRuleMode; restrictedLimit: number; rejectLimit: number };
type ProductionMetrics = { printedSheets: number; expectedUnits: number };
type FolhasData = {
  pilhas_verificadas: number;
  pilhas_aprovadas: number;
  folhas_escolha: number;
  folhas_reprovadas: number;
  unidades_aprovadas: number;
  unidades_escolha: number;
  unidades_reprovadas: number;
};

const EMPTY_FOLHAS_DATA: FolhasData = {
  pilhas_verificadas: 0,
  pilhas_aprovadas: 0,
  folhas_escolha: 0,
  folhas_reprovadas: 0,
  unidades_aprovadas: 0,
  unidades_escolha: 0,
  unidades_reprovadas: 0,
};

type EnvioEscolhaRow = {
  rowId: string;
  origem_problema: OrigemProblemaEscolha | '';
  motivo_escolha: string;
  tipo_defeito: string;
  classificacao_defeito: string;
  quantidade_enviada: number;
  observacao: string;
};

const ORIGEM_PROBLEMA_OPTIONS: Array<{ value: OrigemProblemaEscolha; label: string }> = [
  { value: 'impressao', label: 'Impressão' },
  { value: 'verniz_uv', label: 'Verniz UV' },
  { value: 'hot_stamping', label: 'Hot stamping' },
  { value: 'corte_vinco', label: 'Corte/vinco' },
  { value: 'outro', label: 'Outro' },
];

const DEFAULT_ESCOLHA_MOTIVO = 'Defeito enviado para escolha na análise inicial';
const DEFAULT_ESCOLHA_CLASSIFICACAO = 'nao_aplicavel';

const DEFAULT_APPROVAL_RULE: ApprovalRule = { mode: 'percent', restrictedLimit: 2, rejectLimit: 5 };
const APPROVAL_RULE_STORAGE_KEY = 'kg_initial_process_approval_rule';
const DRAFT_KEY = 'kg_inspection_draft';

const sumDefects = (defects: Record<string, number>) =>
  Object.values(defects).reduce((total, value) => total + (Number(value) || 0), 0);

const calculateStatusByRule = (failureRate: number, failures: number, rule: ApprovalRule) => {
  const value = rule.mode === 'percent' ? failureRate : failures;
  if (value >= rule.rejectLimit) return InspectionStatus.REJECTED;
  if (value >= rule.restrictedLimit) return InspectionStatus.RESTRICTED;
  return InspectionStatus.APPROVED;
};

const getStatusText = (status: InspectionStatus) => {
  if (status === InspectionStatus.PENDING_CLOSURE) return 'Pendente de fechamento';
  if (status === InspectionStatus.REJECTED) return 'Reprovado';
  if (status === InspectionStatus.RESTRICTED) return 'Aprovado com restrição';
  return 'Aprovado';
};

const getStatusCardClass = (status: InspectionStatus) => {
  if (status === InspectionStatus.APPROVED) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20';
  if (status === InspectionStatus.REJECTED) return 'bg-rose-50 text-rose-700 dark:bg-rose-950/20';
  if (status === InspectionStatus.PENDING_CLOSURE) return 'bg-sky-50 text-sky-700 dark:bg-sky-950/20';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/20';
};

const getStatusTextClass = (status: InspectionStatus) => {
  if (status === InspectionStatus.APPROVED) return 'text-emerald-700';
  if (status === InspectionStatus.REJECTED) return 'text-rose-700';
  if (status === InspectionStatus.PENDING_CLOSURE) return 'text-sky-700';
  return 'text-amber-700';
};

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR'); // v2

type FacaCount = Record<number, number>;

const UV_DEFECT_KEYS: { key: string; label: string; icon: string }[] = [
  { key: 'uv_cor', label: 'Cor', icon: 'palette' },
  { key: 'uv_registro', label: 'Fora de Registro', icon: 'grid_view' },
  { key: 'uv_falha_verniz', label: 'Falha Verniz', icon: 'imagesearch_roller' },
  { key: 'uv_acabamento_aspero', label: 'Acab. Áspero', icon: 'texture' },
];

const HS_DEFECT_KEYS: { key: string; label: string; icon: string }[] = [
  { key: 'hs_falha', label: 'Falha Hotfilm', icon: 'stars' },
  { key: 'hs_enchimento', label: 'Enchimento Texto', icon: 'format_color_fill' },
  { key: 'hs_ausencia', label: 'Ausência', icon: 'visibility_off' },
];

const UNIT_DEFECT_KEYS: { key: string; label: string; icon: string; hasDescription?: boolean }[] = [
  { key: 'inicio_impressao', label: 'Início Impressão', icon: 'play_circle' },
  { key: 'manchas', label: 'Manchas', icon: 'texture' },
  { key: 'pintas', label: 'Pintas', icon: 'blur_on' },
  { key: 'fiapos', label: 'Fiapos', icon: 'straighten' },
  { key: 'registro', label: 'Fora de Registro', icon: 'grid_view' },
  { key: 'falha_verniz', label: 'Falha Verniz', icon: 'imagesearch_roller' },
  { key: 'falha_texto', label: 'Falha Texto', icon: 'format_color_text' },
  { key: 'texto_fechado', label: 'Texto Fechado', icon: 'block' },
  { key: 'outros', label: 'Outros', icon: 'more_horiz', hasDescription: true },
];

const emptyFacaCounts = (): Record<string, FacaCount> =>
  Object.fromEntries(UNIT_DEFECT_KEYS.map(d => [d.key, {} as FacaCount]));

const facaTotal = (fc: FacaCount) =>
  Object.values(fc).reduce((s, v) => s + (Number(v) || 0), 0);

const FacaDefectCounter: React.FC<{
  name: string;
  icon: string;
  facaCounts: FacaCount;
  unidadesPorFolha: number;
  onUpdate: (faca: number, count: number) => void;
  descricao?: string;
  onDescricaoChange?: (v: string) => void;
}> = ({ name, icon, facaCounts, unidadesPorFolha, onUpdate, descricao, onDescricaoChange }) => {
  const [modal, setModal] = useState<{ faca: number; value: string } | null>(null);
  const [allModal, setAllModal] = useState<{ value: string } | null>(null);
  const total = facaTotal(facaCounts);

  const openModal = (faca: number) => {
    setModal({ faca, value: String(facaCounts[faca] ?? 0) });
  };

  const confirmModal = () => {
    if (!modal) return;
    onUpdate(modal.faca, Math.max(0, Number(modal.value) || 0));
    setModal(null);
  };

  const confirmAllModal = () => {
    if (!allModal) return;
    const count = Math.max(0, Number(allModal.value) || 0);
    Array.from({ length: unidadesPorFolha }, (_, i) => i + 1).forEach(faca => onUpdate(faca, count));
    setAllModal(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="material-symbols-outlined text-slate-400 text-base">{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 flex-1 truncate">{name}</span>
        <button
          type="button"
          onClick={() => setAllModal({ value: '' })}
          className="text-[8px] font-black uppercase tracking-widest px-2 h-5 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
        >
          Todos
        </button>
        {total > 0 && (
          <span className="text-[10px] font-black text-white bg-rose-500 rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
            {total}
          </span>
        )}
      </div>

      {/* Grid de facas */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: unidadesPorFolha }, (_, i) => i + 1).map(faca => {
          const count = facaCounts[faca] ?? 0;
          const active = count > 0;
          return (
            <button
              key={faca}
              type="button"
              onClick={() => openModal(faca)}
              className={`relative flex flex-col items-center justify-center w-11 h-11 rounded-xl border-2 transition-all ${
                active
                  ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-700'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:border-primary/40 hover:bg-primary/5'
              }`}
            >
              <span className="material-symbols-outlined text-[13px] leading-none">inventory_2</span>
              <span className="text-[9px] font-black leading-none mt-0.5">{faca}</span>
              {active && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-3.5 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center px-0.5 leading-none">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Campo de descrição (somente para "Outros") */}
      {onDescricaoChange !== undefined && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-700">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Descreva o defeito</label>
          <textarea
            value={descricao ?? ''}
            onChange={e => onDescricaoChange(e.target.value)}
            placeholder="Ex: risco no substrato, brilho excessivo, folha amassada..."
            rows={2}
            className="mt-1 w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-primary/20 resize-none"
          />
        </div>
      )}

      {/* Modal — faca individual */}
      {modal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl w-72"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-base">inventory_2</span>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Faca {modal.faca}</p>
                <p className="text-sm font-black text-slate-800 dark:text-white">{name}</p>
              </div>
            </div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Quantidade de defeitos nesta posição</label>
            <input
              type="number"
              min={0}
              value={modal.value}
              onChange={e => setModal(prev => prev ? { ...prev, value: e.target.value } : prev)}
              onKeyDown={e => e.key === 'Enter' && confirmModal()}
              autoFocus
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xl font-black outline-none focus:ring-2 focus:ring-primary/20 text-center"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setModal(null)} className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">Cancelar</button>
              <button type="button" onClick={confirmModal} className="flex-1 h-10 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/90 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — todas as facas */}
      {allModal && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          onClick={() => setAllModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl w-72"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-base">select_all</span>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Todas as {unidadesPorFolha} posições</p>
                <p className="text-sm font-black text-slate-800 dark:text-white">{name}</p>
              </div>
            </div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Defeitos por posição (aplica em todas)</label>
            <input
              type="number"
              min={0}
              value={allModal.value}
              onChange={e => setAllModal({ value: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && confirmAllModal()}
              autoFocus
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xl font-black outline-none focus:ring-2 focus:ring-primary/20 text-center"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setAllModal(null)} className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">Cancelar</button>
              <button type="button" onClick={confirmAllModal} className="flex-1 h-10 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/90 transition-colors">Aplicar a Todos</button>
            </div>
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
  const [newOrder, setNewOrder] = useState({ op: '', qtd_total: '' });
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedOperatorRows, setSelectedOperatorRows] = useState<SelectRow[]>([{ rowId: nextRowId(), value: '' }]);
  const [selectedAnalystRows, setSelectedAnalystRows] = useState<SelectRow[]>([{ rowId: nextRowId(), value: '' }]);
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
  const [offsetFacaCounts, setOffsetFacaCounts] = useState<Record<string, FacaCount>>(emptyFacaCounts);
  const [offsetDescricoes, setOffsetDescricoes] = useState<Record<string, string>>({});

  const [uvApplicable, setUvApplicable] = useState(false);
  const [uvFacaCounts, setUvFacaCounts] = useState<Record<string, FacaCount>>(
    () => Object.fromEntries(UV_DEFECT_KEYS.map(d => [d.key, {} as FacaCount]))
  );

  const [hotStampingApplicable, setHotStampingApplicable] = useState(false);
  const [hotStampingMachineId, setHotStampingMachineId] = useState('');
  const [hotStampingOperatorId, setHotStampingOperatorId] = useState('');
  const [hotStampingFacaCounts, setHotStampingFacaCounts] = useState<Record<string, FacaCount>>(
    () => Object.fromEntries(HS_DEFECT_KEYS.map(d => [d.key, {} as FacaCount]))
  );

  // Production tracking
  const [unidadesPorFolha, setUnidadesPorFolha] = useState(1);
  const [folhasPorPilha, setFolhasPorPilha] = useState(500);
  const [folhasData, setFolhasData] = useState<FolhasData>(EMPTY_FOLHAS_DATA);
  const [envioEscolhaRows, setEnvioEscolhaRows] = useState<EnvioEscolhaRow[]>([]);
  const [lastEscolhaOp, setLastEscolhaOp] = useState<string | null>(null);
  const [observacoesAnalista, setObservacoesAnalista] = useState('');

  // Post-save reimpressão
  const [savedInspectionId, setSavedInspectionId] = useState<string | null>(null);
  const [showReimpressaoForm, setShowReimpressaoForm] = useState(false);
  const [reimpressaoMotivo, setReimpressaoMotivo] = useState('');
  const [reimpressaoQtd, setReimpressaoQtd] = useState(0);
  const [reimpressaoMachineId, setReimpressaoMachineId] = useState('');
  const [reimpressaoOperatorId, setReimpressaoOperatorId] = useState('');
  const [isSubmittingReimpressao, setIsSubmittingReimpressao] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Derived
  const currentOrder = useMemo(() => orders.find(o => o.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const numeroRodada = currentOrder ? (currentOrder.rodadas_realizadas ?? 0) + 1 : 1;
  const quantidadeOpUnidades = productionMetrics.expectedUnits;
  const quantidadeVerificadaRodada = productionMetrics.printedSheets * unidadesPorFolha;
  const totalRodadoUnidades = quantidadeVerificadaRodada;
  const excedenteRodada = Math.max(0, quantidadeVerificadaRodada - quantidadeOpUnidades);

  const failureBasis = useMemo(() => {
    const colorFolhas = Number(offsetData.defects.cor) || 0;
    const colorUnidades = colorFolhas * unidadesPorFolha;
    const offsetCount = (Object.values(offsetFacaCounts) as FacaCount[]).reduce((sum, fc) => sum + facaTotal(fc), 0);
    const uvCount = uvApplicable ? (Object.values(uvFacaCounts) as FacaCount[]).reduce((sum, fc) => sum + facaTotal(fc), 0) : 0;
    const hsCount = hotStampingApplicable ? (Object.values(hotStampingFacaCounts) as FacaCount[]).reduce((sum, fc) => sum + facaTotal(fc), 0) : 0;
    const unitFailures = offsetCount + uvCount + hsCount + offsetData.metrics.rework;
    const totalFailures = colorUnidades + unitFailures;
    const colorRate = productionMetrics.printedSheets > 0 ? (colorFolhas / productionMetrics.printedSheets) * 100 : 0;
    const unitRate = quantidadeVerificadaRodada > 0 ? (unitFailures / quantidadeVerificadaRodada) * 100 : 0;
    const combinedRate = quantidadeVerificadaRodada > 0 ? (totalFailures / quantidadeVerificadaRodada) * 100 : 0;
    return { colorFolhas, colorUnidades, unitFailures, totalFailures, colorRate, unitRate, combinedRate };
  }, [offsetData.defects, offsetData.metrics.rework, offsetFacaCounts, uvApplicable, uvFacaCounts, hotStampingApplicable, hotStampingFacaCounts, productionMetrics.printedSheets, quantidadeVerificadaRodada, unidadesPorFolha]);

  const saldo = useMemo(() => {
    const rodadas = quantidadeVerificadaRodada;
    const em_escolha = folhasData.unidades_escolha;
    const reprovadas = folhasData.unidades_reprovadas;
    const aprovadas = folhasData.unidades_aprovadas;
    const divergencia = rodadas - (aprovadas + em_escolha + reprovadas);
    return { rodadas, aprovadas, em_escolha, reprovadas, divergencia, alerta_divergencia: divergencia !== 0 };
  }, [quantidadeVerificadaRodada, folhasData]);

  const activeFailureCount = failureBasis.totalFailures;
  const qualityStatus = useMemo(
    () => calculateStatusByRule(failureBasis.combinedRate, activeFailureCount, approvalRule),
    [activeFailureCount, approvalRule, failureBasis.combinedRate]
  );
  const calculatedStatus = saldo.alerta_divergencia ? InspectionStatus.PENDING_CLOSURE : qualityStatus;
  const failureRate = failureBasis.combinedRate;
  const totalEnvioEscolha = useMemo(
    () => envioEscolhaRows.reduce((sum, row) => sum + (Number(row.quantidade_enviada) || 0), 0),
    [envioEscolhaRows]
  );
  const escolhaSemDetalhe = Math.max(0, saldo.em_escolha - totalEnvioEscolha);

  const createEmptyEnvioEscolhaRow = useCallback((quantidade = 0): EnvioEscolhaRow => ({
    rowId: nextRowId(),
    origem_problema: '',
    motivo_escolha: DEFAULT_ESCOLHA_MOTIVO,
    tipo_defeito: '',
    classificacao_defeito: DEFAULT_ESCOLHA_CLASSIFICACAO,
    quantidade_enviada: quantidade,
    observacao: '',
  }), [nextRowId]);

  const addEnvioEscolhaRow = useCallback(() => {
    setEnvioEscolhaRows(prev => {
      const usado = prev.reduce((sum, row) => sum + (Number(row.quantidade_enviada) || 0), 0);
      const restante = Math.max(0, saldo.em_escolha - usado);
      return [...prev, createEmptyEnvioEscolhaRow(restante)];
    });
  }, [createEmptyEnvioEscolhaRow, saldo.em_escolha]);

  useEffect(() => {
    setEnvioEscolhaRows(prev => {
      if (saldo.em_escolha <= 0) return prev.length > 0 ? [] : prev;
      if (prev.length === 0) return [createEmptyEnvioEscolhaRow(saldo.em_escolha)];
      if (prev.length === 1 && prev[0].quantidade_enviada !== saldo.em_escolha) {
        return [{ ...prev[0], quantidade_enviada: saldo.em_escolha }];
      }
      return prev;
    });
  }, [createEmptyEnvioEscolhaRow, saldo.em_escolha]);

  useEffect(() => {
    setFolhasData(prev => {
      const aprovadasCalculadas = Math.max(0, totalRodadoUnidades - prev.unidades_escolha - prev.unidades_reprovadas);
      return prev.unidades_aprovadas === aprovadasCalculadas ? prev : { ...prev, unidades_aprovadas: aprovadasCalculadas };
    });
  }, [totalRodadoUnidades, folhasData.unidades_escolha, folhasData.unidades_reprovadas]);

  // Quando o operador informa as folhas rodadas e ainda não preencheu pilhas_verificadas,
  // assumir que todas as pilhas foram verificadas no processo de impressão.
  useEffect(() => {
    if (productionMetrics.printedSheets > 0 && folhasData.pilhas_verificadas === 0) {
      setFolhasData(prev => ({
        ...prev,
        pilhas_verificadas: Math.ceil(productionMetrics.printedSheets / Math.max(1, folhasPorPilha)),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionMetrics.printedSheets]);

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
        if (mRes.data) setMachines(mRes.data);
        if (oRes.data) setOperators(oRes.data);
        if (aRes.data) setAnalysts(aRes.data);
        if (ordRes.data) setOrders(ordRes.data);

        // Restaurar rascunho salvo, se existir
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) {
            const d = JSON.parse(raw);
            if (d.selectedOrderId) setSelectedOrderId(d.selectedOrderId);
            if (d.newOrder) setNewOrder(d.newOrder);
            if (d.selectedMachineId) setSelectedMachineId(d.selectedMachineId);
            else if (mRes.data && mRes.data.length > 0) setSelectedMachineId(mRes.data[0].id);
            if (d.selectedOperatorRows) setSelectedOperatorRows(d.selectedOperatorRows.map((r: any) => ({ rowId: nextRowId(), value: r.value })));
            else if (oRes.data && oRes.data.length > 0) setSelectedOperatorRows([{ rowId: nextRowId(), value: oRes.data[0].id }]);
            if (d.selectedAnalystRows) setSelectedAnalystRows(d.selectedAnalystRows.map((r: any) => ({ rowId: nextRowId(), value: r.value })));
            else if (aRes.data && aRes.data.length > 0) setSelectedAnalystRows([{ rowId: nextRowId(), value: aRes.data[0].id }]);
            if (d.productionMetrics) setProductionMetrics(d.productionMetrics);
            if (d.offsetData) setOffsetData(d.offsetData);
            if (d.offsetFacaCounts) setOffsetFacaCounts(d.offsetFacaCounts);
            if (d.offsetDescricoes) setOffsetDescricoes(d.offsetDescricoes);
            if (d.uvApplicable !== undefined) setUvApplicable(d.uvApplicable);
            if (d.uvFacaCounts) setUvFacaCounts(d.uvFacaCounts);
            if (d.hotStampingApplicable !== undefined) setHotStampingApplicable(d.hotStampingApplicable);
            if (d.hotStampingMachineId) setHotStampingMachineId(d.hotStampingMachineId);
            if (d.hotStampingOperatorId) setHotStampingOperatorId(d.hotStampingOperatorId);
            if (d.hotStampingFacaCounts) setHotStampingFacaCounts(d.hotStampingFacaCounts);
            if (d.folhasData) {
              const draftUnidadesPorFolha = Math.max(1, Number(d.unidadesPorFolha) || 1);
              const draftFolhasData = { ...EMPTY_FOLHAS_DATA, ...d.folhasData };
              setFolhasData({
                ...draftFolhasData,
                unidades_aprovadas: Number(d.folhasData.unidades_aprovadas ?? (Number(d.folhasData.pilhas_aprovadas) || 0) * (Number(d.folhasPorPilha) || 500) * draftUnidadesPorFolha) || 0,
                unidades_escolha: Number(d.folhasData.unidades_escolha ?? (Number(d.folhasData.folhas_escolha) || 0) * draftUnidadesPorFolha) || 0,
                unidades_reprovadas: Number(d.folhasData.unidades_reprovadas ?? (Number(d.folhasData.folhas_reprovadas) || 0) * draftUnidadesPorFolha) || 0,
              });
            }
            if (Array.isArray(d.envioEscolhaRows)) {
              setEnvioEscolhaRows(d.envioEscolhaRows.map((r: any) => ({ ...r, rowId: nextRowId() })));
            }
            if (d.unidadesPorFolha) setUnidadesPorFolha(d.unidadesPorFolha);
            if (d.folhasPorPilha) setFolhasPorPilha(d.folhasPorPilha);
            if (d.observacoesAnalista !== undefined) setObservacoesAnalista(d.observacoesAnalista);
          } else {
            // Sem rascunho: defaults
            if (mRes.data && mRes.data.length > 0) setSelectedMachineId(mRes.data[0].id);
            if (oRes.data && oRes.data.length > 0) setSelectedOperatorRows([{ rowId: nextRowId(), value: oRes.data[0].id }]);
            if (aRes.data && aRes.data.length > 0) setSelectedAnalystRows([{ rowId: nextRowId(), value: aRes.data[0].id }]);
          }
        } catch {
          if (mRes.data && mRes.data.length > 0) setSelectedMachineId(mRes.data[0].id);
          if (oRes.data && oRes.data.length > 0) setSelectedOperatorRows([{ rowId: nextRowId(), value: oRes.data[0].id }]);
          if (aRes.data && aRes.data.length > 0) setSelectedAnalystRows([{ rowId: nextRowId(), value: aRes.data[0].id }]);
        }
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
    setOffsetFacaCounts(emptyFacaCounts());
    setOffsetDescricoes({});
    setUvApplicable(false);
    setUvFacaCounts(Object.fromEntries(UV_DEFECT_KEYS.map(d => [d.key, {} as FacaCount])));
    setHotStampingApplicable(false);
    setHotStampingMachineId('');
    setHotStampingOperatorId('');
    setHotStampingFacaCounts(Object.fromEntries(HS_DEFECT_KEYS.map(d => [d.key, {} as FacaCount])));
    setProductionMetrics({ printedSheets: 0, expectedUnits: 0 });
    setFolhasData(EMPTY_FOLHAS_DATA);
    setEnvioEscolhaRows([]);
    setLastEscolhaOp(null);
    setUnidadesPorFolha(1);
    setFolhasPorPilha(500);
    setObservacoesAnalista('');
    setSavedInspectionId(null);
    setShowReimpressaoForm(false);
    setReimpressaoMotivo('');
    setReimpressaoQtd(0);
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  // Auto-save do rascunho no localStorage (debounce 800ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const draft = {
          selectedOrderId, newOrder, selectedMachineId,
          selectedOperatorRows, selectedAnalystRows,
          productionMetrics, offsetData, offsetFacaCounts, offsetDescricoes,
          uvApplicable, uvFacaCounts,
          hotStampingApplicable, hotStampingMachineId, hotStampingOperatorId, hotStampingFacaCounts,
          folhasData, envioEscolhaRows, unidadesPorFolha, folhasPorPilha, observacoesAnalista,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch { /* storage cheio */ }
    }, 800);
    return () => clearTimeout(timer);
  }, [selectedOrderId, newOrder, selectedMachineId, selectedOperatorRows, selectedAnalystRows,
      productionMetrics, offsetData, offsetFacaCounts, offsetDescricoes,
      uvApplicable, uvFacaCounts,
      hotStampingApplicable, hotStampingMachineId, hotStampingOperatorId, hotStampingFacaCounts,
      folhasData, envioEscolhaRows, unidadesPorFolha, folhasPorPilha, observacoesAnalista]);

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
      showToast('Informe folhas rodadas e quantidade da OP', 'warning');
      return;
    }
    if (approvalRule.rejectLimit < approvalRule.restrictedLimit) {
      showToast('A regra de reprovação deve ser maior ou igual à regra de restrição', 'warning');
      return;
    }
    const totalDistribuido = saldo.aprovadas + saldo.em_escolha + saldo.reprovadas;
    if (totalDistribuido > quantidadeVerificadaRodada) {
      showToast('Aprovadas, escolha e reprovadas não podem passar da quantidade verificada na rodada.', 'warning');
      return;
    }
    const escolhaRowsComQuantidade = envioEscolhaRows.filter(row => (Number(row.quantidade_enviada) || 0) > 0);
    if (totalEnvioEscolha > saldo.em_escolha) {
      showToast('A soma das linhas de envio para escolha não pode ser maior que o total em escolha.', 'warning');
      return;
    }
    for (const row of escolhaRowsComQuantidade) {
      if (!row.origem_problema || !row.tipo_defeito.trim()) {
        showToast('Preencha origem e tipo de defeito em todas as linhas de escolha.', 'warning');
        return;
      }
    }
    const duplicatedChoiceKey = new Set<string>();
    for (const row of escolhaRowsComQuantidade) {
      const key = `${row.tipo_defeito.trim().toLowerCase()}|${row.origem_problema}`;
      if (duplicatedChoiceKey.has(key)) {
        showToast('Não duplique o mesmo defeito com a mesma origem no envio para escolha.', 'warning');
        return;
      }
      duplicatedChoiceKey.add(key);
    }
    if (saldo.em_escolha > 0 && totalEnvioEscolha < saldo.em_escolha) {
      showToast('Existe quantidade em escolha sem detalhamento por defeito.', 'warning');
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
      let observationsPayload: any = null;

      {
        const defeitosUnidade: Record<string, { count: number; por_faca: FacaCount; descricao?: string }> = {};
        for (const [k, fc] of Object.entries(offsetFacaCounts) as [string, FacaCount][]) {
          const entry: { count: number; por_faca: FacaCount; descricao?: string } = { count: facaTotal(fc), por_faca: fc };
          if (offsetDescricoes[k]) entry.descricao = offsetDescricoes[k];
          defeitosUnidade[k] = entry;
        }
        const defeitosUV: Record<string, { count: number; por_faca: FacaCount }> = {};
        for (const [k, fc] of Object.entries(uvFacaCounts) as [string, FacaCount][]) {
          defeitosUV[k] = { count: facaTotal(fc), por_faca: fc };
        }
        const defeitosHS: Record<string, { count: number; por_faca: FacaCount }> = {};
        for (const [k, fc] of Object.entries(hotStampingFacaCounts) as [string, FacaCount][]) {
          defeitosHS[k] = { count: facaTotal(fc), por_faca: fc };
        }
        dataToSave.status = calculatedStatus;
        dataToSave.rework_count = offsetData.metrics.rework;
        dataToSave.samples_count = 0;
        const pilhasAprovadasEquivalentes = Math.ceil(folhasData.unidades_aprovadas / Math.max(1, folhasPorPilha * unidadesPorFolha));
        const folhasEscolhaEquivalentes = Math.ceil(folhasData.unidades_escolha / Math.max(1, unidadesPorFolha));
        const folhasReprovadasEquivalentes = Math.ceil(folhasData.unidades_reprovadas / Math.max(1, unidadesPorFolha));
        observationsPayload = {
          schema_version: 2,
          process_area: 'producao_inicial',
          process_type: ProcessType.OFFSET,
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
            pilhas_aprovadas: pilhasAprovadasEquivalentes,
            folhas_escolha: folhasEscolhaEquivalentes,
            folhas_reprovadas: folhasReprovadasEquivalentes,
          },
          defeitos: {
            por_folha: { cor: offsetData.defects.cor },
            por_unidade: defeitosUnidade,
          },
          verniz_uv: { aplicavel: uvApplicable, defeitos: defeitosUV },
          hot_stamping: { aplicavel: hotStampingApplicable, machine_id: hotStampingMachineId || null, operator_id: hotStampingOperatorId || null, defeitos: defeitosHS },
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
          envio_escolha: escolhaRowsComQuantidade.map(row => ({
            origem_problema: row.origem_problema,
            motivo_escolha: row.motivo_escolha.trim() || DEFAULT_ESCOLHA_MOTIVO,
            tipo_defeito: row.tipo_defeito.trim(),
            classificacao_defeito: row.classificacao_defeito || DEFAULT_ESCOLHA_CLASSIFICACAO,
            quantidade_enviada: row.quantidade_enviada,
            observacao: row.observacao.trim() || null,
            escolha_revisao_id: null,
          })),
        };
        dataToSave.observations = JSON.stringify(observationsPayload);
      }

      const { data: inserted, error } = await supabase.from('inspections').insert([dataToSave]).select('id').single();
      if (error) throw error;

      const createdEscolhas: Array<{ rowKey: string; id: string }> = [];
      const skippedEscolhas: string[] = [];
      for (const row of escolhaRowsComQuantidade) {
        const tipoDefeito = row.tipo_defeito.trim();
        const origemProblema = row.origem_problema as OrigemProblemaEscolha;
        const existing = await escolhaRevisaoService.findByOrigin({
          origemRegistroTabela: 'inspections',
          origemRegistroId: inserted.id,
          tipoDefeito,
          origemProblema,
        });

        if (existing) {
          skippedEscolhas.push(tipoDefeito);
          continue;
        }

        const createdEscolha = await escolhaRevisaoService.create({
          op: selectedOrder.op,
          cliente: selectedOrder.cliente ?? null,
          produto: selectedOrder.produto ?? selectedOrder.descricao ?? null,
          origem_escolha: 'analise_inicial',
          setor_detectado: 'analise_inicial',
          motivo_escolha: row.motivo_escolha.trim() || DEFAULT_ESCOLHA_MOTIVO,
          tipo_defeito: tipoDefeito,
          classificacao_defeito: row.classificacao_defeito || DEFAULT_ESCOLHA_CLASSIFICACAO,
          quantidade_enviada: row.quantidade_enviada,
          responsavel_envio_id: profile?.user_id ?? null,
          responsavel_envio_nome: profile?.name ?? null,
          entrada_at: new Date().toISOString(),
          status: 'aberta',
          responsavel_revisao_id: null,
          responsavel_revisao_nome: null,
          quantidade_revisada: 0,
          quantidade_boa_recuperada: 0,
          quantidade_refugada: 0,
          quantidade_pendente: row.quantidade_enviada,
          revisao_at: null,
          observacao: row.observacao.trim() || null,
          destino_material_bom: null,
          outro_destino: null,
          origem_registro_tabela: 'inspections',
          origem_registro_id: inserted.id,
          origem_tela: 'analise_inicial',
          origem_problema: origemProblema,
          created_by: profile?.user_id ?? null,
          updated_by: profile?.user_id ?? null,
        });
        createdEscolhas.push({ rowKey: `${tipoDefeito}|${origemProblema}`, id: createdEscolha.id });
      }

      if (observationsPayload && createdEscolhas.length > 0) {
        observationsPayload.envio_escolha = observationsPayload.envio_escolha.map((item: any) => {
          const match = createdEscolhas.find(created => created.rowKey === `${item.tipo_defeito}|${item.origem_problema}`);
          return match ? { ...item, escolha_revisao_id: match.id } : item;
        });
        const { error: observationsUpdateError } = await supabase
          .from('inspections')
          .update({ observations: JSON.stringify(observationsPayload) })
          .eq('id', inserted.id);
        if (observationsUpdateError) throw observationsUpdateError;
      }

      if (createdEscolhas.length > 0) {
        setLastEscolhaOp(selectedOrder.op);
        showToast('Material enviado para Controle de Escolha/Revisão.', 'success');
      }
      if (skippedEscolhas.length > 0) {
        showToast('Esta análise já possui registro de escolha/revisão para este defeito.', 'warning');
      }

      if (!andNew) {
        setSavedInspectionId(inserted.id);
        if (calculatedStatus === InspectionStatus.REJECTED || saldo.aprovadas < selectedOrder.qtd_total) {
          setReimpressaoQtd(Math.max(0, selectedOrder.qtd_total - saldo.aprovadas));
          setShowReimpressaoForm(true);
        }
      }

      localStorage.removeItem(DRAFT_KEY);
      showToast('Registro salvo com sucesso!', 'success');
      if (andNew) {
        resetAll();
        setSelectedOrderId('');
        setNewOrder({ op: '', qtd_total: '' });
      } else if (!selectedOrderId) {
        setSelectedOrderId(orderId);
        setNewOrder({ op: '', qtd_total: '' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      showToast(`Erro ao salvar: ${msg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [selectedOrderId, selectedMachineId, selectedOperatorRows, selectedAnalystRows, productionMetrics, approvalRule, calculatedStatus, offsetData, offsetFacaCounts, offsetDescricoes, uvApplicable, uvFacaCounts, hotStampingApplicable, hotStampingMachineId, hotStampingOperatorId, hotStampingFacaCounts, orders, newOrder, resetAll, showToast, profile?.user_id, profile?.name, unidadesPorFolha, folhasPorPilha, folhasData, envioEscolhaRows, totalEnvioEscolha, saldo, failureBasis, observacoesAnalista, numeroRodada]);

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
    <div className="responsive-page mx-auto max-w-6xl space-y-4 p-4 pb-56 md:p-6 md:pb-48">

      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <h1 className="responsive-mobile-title text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Processo Inicial</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
            Inspeção de produção
          </p>
        </div>
        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 md:h-9 md:w-auto md:justify-start md:py-0">
          <span className="material-symbols-outlined text-primary text-base">print</span>
          <span className="text-[10px] font-black tracking-widest text-primary">OFF-SET · UV · HOT STAMPING</span>
        </div>
      </div>

      {/* Dados da OP */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl p-4 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* OP picker */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Ordem de Produção (OP)</label>
            <select
              value={selectedOrderId}
              onChange={(e) => { setSelectedOrderId(e.target.value); if (e.target.value) setNewOrder({ op: '', qtd_total: '' }); }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-1 focus:ring-primary/20"
            >
              <option value="">Selecionar OP...</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.op}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input value={newOrder.op} onChange={(e) => { setSelectedOrderId(''); updateNewOrder('op', e.target.value); }} className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-black outline-none focus:ring-1 focus:ring-primary/20" placeholder="Código interno (OP)" />
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
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Quantidade da OP *</label>
              <input type="number" min={0} value={productionMetrics.expectedUnits} onChange={(e) => updateProductionMetric('expectedUnits', Number(e.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Quantidade da OP</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{fmt(quantidadeOpUnidades)}</p>
            </div>
            <div className="rounded-2xl bg-primary/5 p-4 dark:bg-primary/10">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary">Total rodado</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{fmt(totalRodadoUnidades)}</p>
              {excedenteRodada > 0 && (
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-sky-600">
                  Sobra/excedente: {fmt(excedenteRodada)} un.
                </p>
              )}
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
            <div className={`rounded-2xl p-4 ${getStatusCardClass(calculatedStatus)}`}>
              <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Resultado calculado</p>
              <p className="mt-1 text-xl font-black uppercase">{getStatusText(calculatedStatus)}</p>
            </div>
            {!isSupervisor && <p className="text-[10px] font-bold text-slate-400">Somente a supervisão altera os limites.</p>}
          </div>
        </div>
      </section>

      {/* Conteúdo das Abas */}
      <main className="animate-slide-in">

        {/* Conteúdo unificado: OFFSET + UV + Hot Stamping */}
        <div className="space-y-6">

            {/* Status indicators */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { id: 'APPROVED', label: 'Aprovado', icon: 'check_circle', card: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10', icon_c: 'text-emerald-600', label_c: 'text-emerald-700' },
                { id: 'RESTRICTED', label: 'Aprovado c/ Restrição', icon: 'warning', card: 'border-amber-500 bg-amber-50 dark:bg-amber-500/10', icon_c: 'text-amber-600', label_c: 'text-amber-700' },
                { id: 'REJECTED', label: 'Reprovado', icon: 'cancel', card: 'border-rose-500 bg-rose-50 dark:bg-rose-500/10', icon_c: 'text-rose-600', label_c: 'text-rose-700' },
                { id: 'PENDING_CLOSURE', label: 'Pendente fechamento', icon: 'pending_actions', card: 'border-sky-500 bg-sky-50 dark:bg-sky-500/10', icon_c: 'text-sky-600', label_c: 'text-sky-700' },
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
                  <FacaDefectCounter
                    key={d.key}
                    name={d.label}
                    icon={d.icon}
                    facaCounts={offsetFacaCounts[d.key] ?? {}}
                    unidadesPorFolha={unidadesPorFolha}
                    onUpdate={(faca, count) => setOffsetFacaCounts(prev => ({
                      ...prev,
                      [d.key]: { ...prev[d.key], [faca]: count }
                    }))}
                    {...(d.hasDescription ? {
                      descricao: offsetDescricoes[d.key] ?? '',
                      onDescricaoChange: (v: string) => setOffsetDescricoes(prev => ({ ...prev, [d.key]: v })),
                    } : {})}
                  />
                ))}
              </div>
              <div className="mt-4 max-w-xs">
                <MetricInput label="Cartuchos Reprovados" icon="restart_alt" value={offsetData.metrics.rework} onChange={(v) => setOffsetData(prev => ({ ...prev, metrics: { ...prev.metrics, rework: v } }))} />
              </div>
            </div>

            {/* Verniz UV */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Extensão do processo</p>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Verniz UV</h3>
                </div>
                <div className="flex gap-2">
                  {([false, true] as const).map(v => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setUvApplicable(v)}
                      className={`px-4 h-8 rounded-lg text-[10px] font-black tracking-widest transition-all ${uvApplicable === v ? (v ? 'bg-primary text-white' : 'bg-slate-600 text-white') : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
                    >
                      {v ? 'APLICÁVEL' : 'NÃO APLICÁVEL'}
                    </button>
                  ))}
                </div>
              </div>
              {uvApplicable && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {UV_DEFECT_KEYS.map(d => (
                    <FacaDefectCounter
                      key={d.key}
                      name={d.label}
                      icon={d.icon}
                      facaCounts={uvFacaCounts[d.key] ?? {}}
                      unidadesPorFolha={unidadesPorFolha}
                      onUpdate={(faca, count) => setUvFacaCounts(prev => ({ ...prev, [d.key]: { ...prev[d.key], [faca]: count } }))}
                    />
                  ))}
                </div>
              )}
              {!uvApplicable && (
                <p className="text-xs font-bold text-slate-400 italic">Verniz UV não aplicado neste lote — não entra no cálculo de falhas.</p>
              )}
            </div>

            {/* Hot Stamping */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Extensão do processo</p>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Hot Stamping</h3>
                </div>
                <div className="flex gap-2">
                  {([false, true] as const).map(v => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setHotStampingApplicable(v)}
                      className={`px-4 h-8 rounded-lg text-[10px] font-black tracking-widest transition-all ${hotStampingApplicable === v ? (v ? 'bg-primary text-white' : 'bg-slate-600 text-white') : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
                    >
                      {v ? 'APLICÁVEL' : 'NÃO APLICÁVEL'}
                    </button>
                  ))}
                </div>
              </div>
              {hotStampingApplicable && (
                <div className="space-y-4">
                  {/* Máquina e Operador do Hot Stamping */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-amber-600 ml-1">Máquina — Hot Stamping</label>
                      <select
                        value={hotStampingMachineId}
                        onChange={e => setHotStampingMachineId(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700 outline-none font-bold text-sm focus:ring-1 focus:ring-amber-400/30"
                      >
                        <option value="">Selecionar máquina...</option>
                        {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-amber-600 ml-1">Operador — Hot Stamping</label>
                      <select
                        value={hotStampingOperatorId}
                        onChange={e => setHotStampingOperatorId(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700 outline-none font-bold text-sm focus:ring-1 focus:ring-amber-400/30"
                      >
                        <option value="">Selecionar operador...</option>
                        {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Contadores de defeitos */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {HS_DEFECT_KEYS.map(d => (
                    <FacaDefectCounter
                      key={d.key}
                      name={d.label}
                      icon={d.icon}
                      facaCounts={hotStampingFacaCounts[d.key] ?? {}}
                      unidadesPorFolha={unidadesPorFolha}
                      onUpdate={(faca, count) => setHotStampingFacaCounts(prev => ({ ...prev, [d.key]: { ...prev[d.key], [faca]: count } }))}
                    />
                  ))}
                  </div>
                </div>
              )}
              {!hotStampingApplicable && (
                <p className="text-xs font-bold text-slate-400 italic">Hot Stamping não aplicado neste lote — não entra no cálculo de falhas.</p>
              )}
            </div>

            {/* Distribuição de Pilhas */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rastreabilidade</p>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Distribuição de Pilhas</h3>
                </div>
                <div className="flex flex-wrap gap-3 text-right">
                  {currentOrder && (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Folhas previstas (OP)</span>
                      <span className="text-xs font-black text-slate-600 dark:text-slate-300">{fmt(Math.ceil(currentOrder.qtd_total / Math.max(1, unidadesPorFolha)))} fls</span>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Folhas rodadas</span>
                    <span className="text-xs font-black text-primary">{fmt(productionMetrics.printedSheets)} fls</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 bg-slate-50 dark:bg-slate-800 px-3 py-1 rounded-lg self-end">1 pilha = {fmt(folhasPorPilha)} fls · 1 fls = {fmt(unidadesPorFolha)} un.</span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricInput
                  label="Verificadas (pilhas)" icon="search" accent
                  value={folhasData.pilhas_verificadas}
                  onChange={(v) => setFolhasData(prev => ({ ...prev, pilhas_verificadas: v }))}
                  subtitle={`= ${fmt(folhasData.pilhas_verificadas * folhasPorPilha)} folhas`}
                />
                <MetricInput
                  label="Aprovadas (saldo)" icon="check_circle" accent disabled
                  value={folhasData.unidades_aprovadas}
                  onChange={(v) => setFolhasData(prev => ({ ...prev, unidades_aprovadas: v }))}
                  subtitle={`Total rodado - escolha - reprovadas`}
                />
                <MetricInput
                  label="P/ Escolha (unid.)" icon="filter_list"
                  value={folhasData.unidades_escolha}
                  onChange={(v) => setFolhasData(prev => ({ ...prev, unidades_escolha: v }))}
                  subtitle={`~ ${fmt(Math.ceil(folhasData.unidades_escolha / Math.max(1, unidadesPorFolha)))} folhas`}
                />
                <MetricInput
                  label="Reprovadas (unid.)" icon="cancel"
                  value={folhasData.unidades_reprovadas}
                  onChange={(v) => setFolhasData(prev => ({ ...prev, unidades_reprovadas: v }))}
                  subtitle={`~ ${fmt(Math.ceil(folhasData.unidades_reprovadas / Math.max(1, unidadesPorFolha)))} folhas`}
                />
              </div>
            </div>

            {(saldo.em_escolha > 0 || envioEscolhaRows.length > 0) && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-900/60 p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Destino: escolha/revisão</p>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Envio para Escolha</h3>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      Total em escolha: {fmt(saldo.em_escolha)} un. · Detalhado: {fmt(totalEnvioEscolha)} un.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addEnvioEscolhaRow}
                    className="h-9 rounded-lg bg-amber-500 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
                  >
                    Adicionar defeito
                  </button>
                </div>

                {envioEscolhaRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/70 p-4 text-xs font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                    Informe um ou mais defeitos para gerar registros no Controle de Escolha/Revisão.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {envioEscolhaRows.map((row, index) => (
                      <div key={row.rowId} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Defeito {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => setEnvioEscolhaRows(prev => prev.filter(item => item.rowId !== row.rowId))}
                            className="rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50"
                          >
                            Remover
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Origem</span>
                            <select
                              value={row.origem_problema}
                              onChange={e => setEnvioEscolhaRows(prev => prev.map(item => item.rowId === row.rowId ? { ...item, origem_problema: e.target.value as OrigemProblemaEscolha } : item))}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-900"
                            >
                              <option value="">Selecione</option>
                              {ORIGEM_PROBLEMA_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label className="space-y-1 md:col-span-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tipo de defeito</span>
                            <input
                              value={row.tipo_defeito}
                              onChange={e => setEnvioEscolhaRows(prev => prev.map(item => item.rowId === row.rowId ? { ...item, tipo_defeito: e.target.value } : item))}
                              placeholder="Ex: Pintas, falha de verniz..."
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-900"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Quantidade</span>
                            <input
                              type="number"
                              min={0}
                              value={row.quantidade_enviada || ''}
                              onChange={e => setEnvioEscolhaRows(prev => prev.map(item => item.rowId === row.rowId ? { ...item, quantidade_enviada: Math.max(0, Number(e.target.value) || 0) } : item))}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-black outline-none dark:border-slate-700 dark:bg-slate-900"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {totalEnvioEscolha > saldo.em_escolha && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700">
                    A soma detalhada excede o total em escolha.
                  </div>
                )}
                {saldo.em_escolha > 0 && totalEnvioEscolha > 0 && totalEnvioEscolha < saldo.em_escolha && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black text-amber-700">
                    Existe quantidade em escolha sem detalhamento por defeito.
                  </div>
                )}
              </div>
            )}

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
                      {saldo.divergencia > 0
                        ? `Divergência: ${fmt(saldo.divergencia)} unidades sem destino — revise escolha e reprovadas`
                        : `Divergência: ${fmt(Math.abs(saldo.divergencia))} unidades acima do total rodado — revise escolha e reprovadas`}
                    </span>
                  </div>
                )}

                <div className={`mt-3 flex items-center justify-between px-4 py-3 rounded-xl ${getStatusCardClass(calculatedStatus)}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Taxa de falha: {failureRate.toFixed(2)}%</span>
                  <span className={`text-xs font-black uppercase tracking-widest ${getStatusTextClass(calculatedStatus)}`}>
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

      {lastEscolhaOp && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Controle de Escolha/Revisão</p>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                Material da OP {lastEscolhaOp} enviado para escolha/revisão.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { window.location.hash = '/escolha-revisao'; }}
              className="h-10 rounded-xl bg-amber-500 px-5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
            >
              Ver escolha/revisão
            </button>
          </div>
        </div>
      )}

      {/* Rodapé Fixo */}
      <footer className="fixed bottom-0 left-[var(--sidebar-width)] right-0 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 z-30">
        <button onClick={resetAll} className="h-10 px-6 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-[10px] tracking-widest hover:bg-slate-50 transition-all text-slate-500 uppercase w-full sm:w-auto">
          LIMPAR
        </button>
        <button onClick={() => handleSave(true)} disabled={isSaving} className="h-10 px-6 rounded-xl border-2 border-primary text-primary font-black text-[10px] tracking-widest hover:bg-primary/5 transition-all disabled:opacity-50 uppercase w-full sm:w-auto">
          {isSaving ? '...' : 'SALVAR + NOVA OP'}
        </button>
        <button onClick={() => handleSave(false)} disabled={isSaving} className="h-10 px-8 rounded-xl bg-primary text-white font-black text-[10px] tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50 uppercase w-full sm:w-auto">
          {isSaving ? 'SALVANDO...' : 'SALVAR'}
        </button>
      </footer>
    </div>
  );
}
