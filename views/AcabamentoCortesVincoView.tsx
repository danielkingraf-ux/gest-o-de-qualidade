import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';

// ── Types ─────────────────────────────────────────────────────────────────────
type FacaCount = Record<number, number>;

type RecentRecord = {
  id: string;
  op: string;
  qty_revisadas: number;
  qty_aprovadas: number;
  qty_reprovadas: number;
  timestamp: string;
  defects: Record<string, number>;
};

type OperatorOption = { id: string; name: string };
type MachineOption  = { id: string; name: string; code: string };

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFECTS = [
  { key: 'vinco_estourado', label: 'Vinco Estourado', icon: 'broken_image' },
  { key: 'falha_corte',     label: 'Falha no Corte',  icon: 'content_cut' },
  { key: 'variacao',        label: 'Variação',         icon: 'swap_vert' },
  { key: 'vinco_fraco',     label: 'Vinco Fraco',      icon: 'compress' },
  { key: 'outros',          label: 'Outros',            icon: 'more_horiz' },
];

const emptyFacaCounts = (): Record<string, FacaCount> =>
  Object.fromEntries(DEFECTS.map(d => [d.key, {} as FacaCount]));

const facaTotal = (fc: FacaCount) =>
  Object.values(fc).reduce((s, v) => s + (Number(v) || 0), 0);

const totalAllDefects = (facaCounts: Record<string, FacaCount>) =>
  DEFECTS.reduce((s, d) => s + facaTotal(facaCounts[d.key] ?? {}), 0);

// ── FacaDefectCounter component ───────────────────────────────────────────────
const FacaDefectCounter: React.FC<{
  name: string;
  icon: string;
  facaCounts: FacaCount;
  numFacas: number;
  onUpdate: (faca: number, count: number) => void;
  descricao?: string;
  onDescricaoChange?: (v: string) => void;
}> = ({ name, icon, facaCounts, numFacas, onUpdate, descricao, onDescricaoChange }) => {
  const [modal, setModal] = useState<{ faca: number; value: string } | null>(null);
  const [allModal, setAllModal] = useState<{ value: string } | null>(null);
  const total = facaTotal(facaCounts);

  const openModal = (faca: number) =>
    setModal({ faca, value: String(facaCounts[faca] ?? 0) });

  const confirmModal = () => {
    if (!modal) return;
    onUpdate(modal.faca, Math.max(0, Number(modal.value) || 0));
    setModal(null);
  };

  const confirmAllModal = () => {
    if (!allModal) return;
    const count = Math.max(0, Number(allModal.value) || 0);
    Array.from({ length: numFacas }, (_, i) => i + 1).forEach(faca => onUpdate(faca, count));
    setAllModal(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="material-symbols-outlined text-slate-400 text-base">{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 flex-1 truncate">
          {name}
        </span>
        <button
          type="button"
          onClick={() => setAllModal({ value: '' })}
          className="text-[8px] font-black uppercase tracking-widest px-2 h-5 rounded-full border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
        >
          Todas
        </button>
        {total > 0 && (
          <span className="text-[10px] font-black text-white bg-rose-500 rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
            {total}
          </span>
        )}
      </div>

      {/* Grid de facas */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: numFacas }, (_, i) => i + 1).map(faca => {
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
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:border-indigo-400/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'
              }`}
            >
              <span className="material-symbols-outlined text-[13px] leading-none">content_cut</span>
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

      {/* Campo de descrição — somente para "outros" */}
      {onDescricaoChange !== undefined && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-700">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            Descreva o defeito
          </label>
          <textarea
            value={descricao ?? ''}
            onChange={e => onDescricaoChange(e.target.value)}
            placeholder="Ex: rebarbas, faca torta, entulho..."
            rows={2}
            className="mt-1 w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500/20 resize-none"
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
              <div className="size-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 text-base">content_cut</span>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Faca {modal.faca}</p>
                <p className="text-sm font-black text-slate-800 dark:text-white">{name}</p>
              </div>
            </div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Quantidade de defeitos nesta posição
            </label>
            <input
              type="number"
              min={0}
              value={modal.value}
              onChange={e => setModal(prev => prev ? { ...prev, value: e.target.value } : prev)}
              onKeyDown={e => e.key === 'Enter' && confirmModal()}
              autoFocus
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xl font-black outline-none focus:ring-2 focus:ring-indigo-500/20 text-center"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmModal}
                className="flex-1 h-10 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-colors"
              >
                Confirmar
              </button>
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
              <div className="size-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 text-base">content_cut</span>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Todas as Posições
                </p>
                <p className="text-sm font-black text-slate-800 dark:text-white">{name}</p>
              </div>
            </div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Quantidade por posição
            </label>
            <input
              type="number"
              min={0}
              value={allModal.value}
              onChange={e => setAllModal(prev => prev ? { ...prev, value: e.target.value } : prev)}
              onKeyDown={e => e.key === 'Enter' && confirmAllModal()}
              autoFocus
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xl font-black outline-none focus:ring-2 focus:ring-indigo-500/20 text-center"
            />
            <p className="text-[9px] text-slate-400 mt-1.5 text-center">
              Será aplicado às {numFacas} posições
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setAllModal(null)}
                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAllModal}
                className="flex-1 h-10 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Qty stepper ───────────────────────────────────────────────────────────────
const QtyCard: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  colorClass: string;
}> = ({ label, value, onChange, colorClass }) => (
  <div className={`flex flex-col gap-1 p-3 rounded-xl border ${colorClass}`}>
    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</span>
    <div className="flex items-center gap-1.5 mt-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs"
      >
        -
      </button>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="flex-1 h-6 bg-transparent text-center font-black text-xs outline-none min-w-0"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="size-6 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs"
      >
        +
      </button>
    </div>
  </div>
);

// ── Main View ─────────────────────────────────────────────────────────────────
const AcabamentoCortesVincoView: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useUser();

  const [op, setOp] = useState('');
  const [qtyRevisadas, setQtyRevisadas] = useState(0);
  const [qtyEscolha, setQtyEscolha] = useState(0);
  const [facaCounts, setFacaCounts] = useState<Record<string, FacaCount>>(emptyFacaCounts());
  const [outrosDescricao, setOutrosDescricao] = useState('');
  const [notes, setNotes] = useState('');
  const [numFacas, setNumFacas] = useState(0);
  const [manualFacas, setManualFacas] = useState(0);
  const [opFound, setOpFound] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [selectedMachineId, setSelectedMachineId]     = useState('');
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [machines, setMachines]   = useState<MachineOption[]>([]);

  const [opList, setOpList] = useState<string[]>([]);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [saldoInspecao, setSaldoInspecao] = useState<{ em_escolha: number; rodadas: number } | null>(null);
  const [opHistory, setOpHistory] = useState<any[]>([]);

  // Carrega lista de OPs, operadores e máquinas de Corte e Vinco
  useEffect(() => {
    supabase.from('orders').select('op').order('op').then(({ data }) => {
      if (data) setOpList(data.map((r: { op: string }) => r.op));
    });
    supabase.from('operators').select('id, name, area').eq('active', true)
      .in('area', ['corte_vinco', 'ambos']).order('name')
      .then(({ data }) => { if (data) setOperators(data as OperatorOption[]); });
    supabase.from('machines').select('id, name, code, area').eq('active', true)
      .in('area', ['corte_vinco', 'ambos']).order('name')
      .then(({ data }) => { if (data) setMachines(data as MachineOption[]); });
  }, []);

  // Carrega detalhes da OP ao digitar — pré-preenche facas e saldo do processo inicial
  useEffect(() => {
    if (!op.trim()) {
      setOpFound(null);
      setSaldoInspecao(null);
      return;
    }
    const opUpper = op.trim().toUpperCase();

    supabase
      .from('orders')
      .select('unidades_por_folha')
      .eq('op', opUpper)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const fromOp = data.unidades_por_folha ?? 0;
          if (fromOp > 0) setManualFacas(fromOp);
          setOpFound(true);
        } else {
          setOpFound(false);
        }
      });

    // Saldo líquido = em_escolha das inspeções − o que já foi registrado neste módulo
    Promise.all([
      supabase
        .from('inspections')
        .select('observations')
        .eq('op', opUpper)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('acabamento_registros')
        .select('id, qty_revisadas, qty_reprovadas, qty_aprovadas, defects, operator_ids, machine_id, timestamp')
        .eq('op', opUpper)
        .eq('modulo', 'corte_vinco')
        .order('timestamp', { ascending: true }),
    ]).then(([inspRes, cvRes]) => {
      let emEscolha = 0;
      let rodadas = 0;
      for (const row of (inspRes.data ?? [])) {
        try {
          const obs = typeof row.observations === 'string'
            ? JSON.parse(row.observations)
            : (row.observations ?? {});
          if (obs.process_area === 'producao_inicial' && obs.saldo_unidades) {
            emEscolha += Number(obs.saldo_unidades.em_escolha) || 0;
            rodadas   += Number(obs.saldo_unidades.rodadas) || 0;
          }
        } catch { /* ignora registro malformado */ }
      }
      const jaProcessado = (cvRes.data ?? []).reduce(
        (s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0
      );
      const liquido = Math.max(0, emEscolha - jaProcessado);
      if (emEscolha > 0 || rodadas > 0) {
        setSaldoInspecao({ em_escolha: liquido, rodadas });
        setQtyRevisadas(prev => prev === 0 ? liquido : prev);
      } else {
        setSaldoInspecao(null);
      }
      setOpHistory(cvRes.data ?? []);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op]);

  // numFacas sempre reflete o campo manual (editável pelo usuário)
  useEffect(() => {
    setNumFacas(manualFacas);
  }, [manualFacas]);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('acabamento_registros')
      .select('id, op, qty_revisadas, qty_aprovadas, qty_reprovadas, timestamp, defects')
      .eq('modulo', 'corte_vinco')
      .order('timestamp', { ascending: false })
      .limit(10);
    setRecentRecords((data as RecentRecord[]) ?? []);
    setLoadingRecent(false);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const handleUpdate = (defectKey: string, faca: number, count: number) => {
    setFacaCounts(prev => ({
      ...prev,
      [defectKey]: { ...prev[defectKey], [faca]: count },
    }));
  };

  const totalDefects = totalAllDefects(facaCounts);

  const handleClear = () => {
    setOp('');
    setSelectedOperatorIds([]);
    setSelectedMachineId('');
    setQtyRevisadas(0);
    setQtyEscolha(0);
    setFacaCounts(emptyFacaCounts());
    setOutrosDescricao('');
    setNotes('');
    setNumFacas(0);
    setManualFacas(0);
    setOpFound(null);
    setSaldoInspecao(null);
  };

  const handleSave = async () => {
    if (!op.trim()) {
      showToast('Informe o número da OP', 'error');
      return;
    }
    if (!selectedMachineId) {
      showToast('Selecione a máquina antes de registrar', 'error');
      return;
    }
    if (selectedOperatorIds.length === 0) {
      showToast('Selecione ao menos um operador antes de registrar', 'error');
      return;
    }
    if (qtyRevisadas === 0) {
      showToast('Informe a quantidade revisada', 'error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('Sessão expirada. Faça login novamente.', 'error');
      return;
    }

    // Totais simples de defeitos
    const defectsPayload: Record<string, number> = {};
    for (const d of DEFECTS) {
      const total = facaTotal(facaCounts[d.key] ?? {});
      if (total > 0) defectsPayload[d.key] = total;
    }

    // Detalhes por posição de faca
    const facaDefectsPayload: Record<string, Record<string, number> | string> = {};
    for (const d of DEFECTS) {
      const fc = facaCounts[d.key] ?? {};
      const entries = Object.entries(fc).filter(([, v]) => (v as number) > 0);
      if (entries.length > 0) {
        facaDefectsPayload[d.key] = Object.fromEntries(entries) as Record<string, number>;
      }
    }
    if (outrosDescricao.trim()) {
      facaDefectsPayload['outros_descricao'] = outrosDescricao.trim();
    }

    setSaving(true);
    const { error } = await supabase.from('acabamento_registros').insert({
      op: op.trim().toUpperCase(),
      modulo: 'corte_vinco',
      auxiliar_user_id: user.id,
      operator_ids: selectedOperatorIds,
      machine_id: selectedMachineId,
      qty_revisadas: qtyRevisadas,
      qty_aprovadas: Math.max(0, qtyRevisadas - qtyEscolha),
      qty_reprovadas: qtyEscolha,
      defects: defectsPayload,
      faca_defects: Object.keys(facaDefectsPayload).length > 0 ? facaDefectsPayload : null,
      unidades_por_folha: numFacas > 0 ? numFacas : null,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      console.error('Erro ao salvar:', error);
      showToast('Erro ao salvar registro', 'error');
      return;
    }

    showToast('Registro salvo com sucesso!', 'success');
    handleClear();
    loadRecent();
  };

  const fmt = (n: number) => n.toLocaleString('pt-BR');

  return (
    <div className="pb-24">
      <div className="p-4 md:p-6 max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-indigo-600">content_cut</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Corte e Vinco
              </h1>
              <p className="text-xs text-slate-500">Registro de defeitos por posição de faca</p>
            </div>
          </div>
          {profile?.name && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
              <span className="material-symbols-outlined text-indigo-500 text-sm">person</span>
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{profile.name}</span>
              <span className="text-[10px] text-slate-400 ml-auto">
                {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>

        {/* Seção 1: Identificação */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Identificação
          </h2>
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Número da OP</label>
          <input
            list="cv-op-list"
            value={op}
            onChange={e => setOp(e.target.value)}
            placeholder="Ex: 12345"
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <datalist id="cv-op-list">
            {opList.map(o => <option key={o} value={o} />)}
          </datalist>

          {/* Máquina — obrigatória */}
          <div className="mt-3">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
              Máquina <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedMachineId}
              onChange={e => setSelectedMachineId(e.target.value)}
              className={`mt-1.5 h-11 w-full rounded-xl border px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50 dark:bg-slate-800 ${
                !selectedMachineId
                  ? 'border-rose-300 dark:border-rose-700 text-slate-400'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <option value="">Selecione a máquina</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.code ? ` (${m.code})` : ''}</option>
              ))}
            </select>
            {machines.length === 0 && (
              <p className="text-[10px] text-amber-500 mt-1">Nenhuma máquina cadastrada para Corte e Vinco. Cadastre em Administração.</p>
            )}
          </div>

          {/* Operadores — obrigatório, múltiplos (troca de turno) */}
          <div className="mt-3">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
              Operadores <span className="text-rose-500">*</span>
              <span className="ml-auto text-[8px] font-bold text-slate-400 normal-case tracking-normal">Selecione todos que trabalharam</span>
            </label>
            {operators.length === 0 ? (
              <p className="text-[10px] text-amber-500 mt-1">Nenhum operador cadastrado para Corte e Vinco. Cadastre em Administração.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {operators.map(o => {
                  const selected = selectedOperatorIds.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOperatorIds(prev =>
                        selected ? prev.filter(id => id !== o.id) : [...prev, o.id]
                      )}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                        selected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'
                      }`}
                    >
                      {selected && <span className="material-symbols-outlined text-[11px] mr-0.5 align-middle">check</span>}
                      {o.name}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedOperatorIds.length === 0 && operators.length > 0 && (
              <p className="text-[10px] text-rose-500 mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">warning</span>
                Selecione ao menos um operador para registrar
              </p>
            )}
          </div>

          {/* Quantidade de Facas */}
          <div className="mt-3">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Quantidade de Facas
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={64}
                value={manualFacas || ''}
                onChange={e => setManualFacas(Math.max(0, Number(e.target.value) || 0))}
                placeholder="Ex: 8"
                className="w-28 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {opFound === true && numFacas > 0 && (
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {numFacas} carregadas da OP
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Rastreio da OP */}
        <OpTraceBanner op={op} moduloAtual="corte_vinco" />

        {/* Banner: saldo recebido do processo inicial */}
        {saldoInspecao && (
          <div className="mb-4 flex items-start gap-2 px-3 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
            <span className="material-symbols-outlined text-indigo-500 text-sm mt-0.5">assignment_turned_in</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                Saldo recebido do Processo de Impressão
              </p>
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                {fmt(saldoInspecao.em_escolha)} unidades em escolha
                {saldoInspecao.rodadas > 0 && (
                  <span className="font-normal text-indigo-500">
                    {' '}de {fmt(saldoInspecao.rodadas)} rodadas
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Histórico desta OP */}
        {opHistory.length > 0 && (
          <section className="mb-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/20">
              <span className="material-symbols-outlined text-indigo-500 text-sm">history</span>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300 flex-1">
                Histórico desta OP — {opHistory.length} turno{opHistory.length > 1 ? 's' : ''}
              </h2>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {opHistory.map((r: any, i: number) => {
                const names = (r.operator_ids ?? [])
                  .map((id: string) => operators.find(o => o.id === id)?.name ?? '?')
                  .filter(Boolean).join(', ') || '—';
                const defTotal = Object.entries(r.defects ?? {})
                  .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
                const topDef = (Object.entries(r.defects ?? {}) as [string, number][])
                  .filter(([, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1])[0];
                const hasProblems = defTotal > 0;
                const ts = new Date(r.timestamp);
                return (
                  <div key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 ${hasProblems ? 'bg-rose-50/60 dark:bg-rose-950/10' : ''}`}>
                    <span className={`size-5 shrink-0 rounded-full flex items-center justify-center text-[9px] font-black ${hasProblems ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'}`}>{i + 1}</span>
                    <span className="text-[10px] font-black text-slate-500 shrink-0">
                      {ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate max-w-[160px]" title={names}>{names}</span>
                    <div className="ml-auto flex items-center gap-2 shrink-0 text-[10px] font-bold">
                      <span className="text-slate-500">{fmt(r.qty_revisadas)} rod.</span>
                      {r.qty_reprovadas > 0 && <span className="text-amber-600">{fmt(r.qty_reprovadas)} esc.</span>}
                      {topDef && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-[9px] font-black">{topDef[0].replace(/_/g, ' ')} ×{topDef[1]}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Seção 2: Quantidades */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Quantidades
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <QtyCard
              label="Rodadas"
              value={qtyRevisadas}
              onChange={setQtyRevisadas}
              colorClass="border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
            />
            <QtyCard
              label="Escolha → Revisão Final"
              value={qtyEscolha}
              onChange={setQtyEscolha}
              colorClass="border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20"
            />
          </div>
          {qtyRevisadas > 0 && (
            <p className="mt-2 text-[10px] font-bold text-slate-400">
              Aprovadas direto: {Math.max(0, qtyRevisadas - qtyEscolha).toLocaleString('pt-BR')} un.
            </p>
          )}
        </section>

        {/* Seção 3: Defeitos por Posição de Faca */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Defeitos por Posição de Faca
            </h2>
            {totalDefects > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/30 text-rose-600 text-[10px] font-black">
                {fmt(totalDefects)} total
              </span>
            )}
          </div>

          {numFacas === 0 ? (
            <div className="py-6 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-200 dark:text-slate-700">content_cut</span>
              <p className="text-xs text-slate-400 mt-2">
                Informe a quantidade de facas na seção de Identificação
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {DEFECTS.map(d => (
                <FacaDefectCounter
                  key={d.key}
                  name={d.label}
                  icon={d.icon}
                  facaCounts={facaCounts[d.key] ?? {}}
                  numFacas={numFacas}
                  onUpdate={(faca, count) => handleUpdate(d.key, faca, count)}
                  descricao={d.key === 'outros' ? outrosDescricao : undefined}
                  onDescricaoChange={d.key === 'outros' ? setOutrosDescricao : undefined}
                />
              ))}
            </div>
          )}
        </section>

        {/* Seção 4: Observações */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Observações
          </h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anotações adicionais sobre o lote..."
            rows={3}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
          />
        </section>

        {/* Registros Recentes */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Registros Recentes
          </h2>
          {loadingRecent ? (
            <div className="flex justify-center py-4">
              <div className="size-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : recentRecords.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">Nenhum registro ainda</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentRecords.map(r => {
                const totalD = Object.values(r.defects ?? {})
                  .reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0);
                return (
                  <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-indigo-600 text-sm">content_cut</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200">OP {r.op}</span>
                        {totalD > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/30 text-rose-600 text-[9px] font-black">
                            {fmt(totalD)} def.
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {fmt(r.qty_revisadas)} rodadas • {fmt(r.qty_reprovadas)} escolha
                      </p>
                    </div>
                    <span className="text-[9px] text-slate-400 shrink-0">
                      {new Date(r.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Footer fixo */}
      <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !op.trim() || !selectedMachineId || selectedOperatorIds.length === 0}
          className="flex-[2] h-11 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <span className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <span className="material-symbols-outlined text-sm">save</span>
          )}
          {saving ? 'Salvando...' : 'Salvar Registro'}
        </button>
      </div>
    </div>
  );
};

export default AcabamentoCortesVincoView;

