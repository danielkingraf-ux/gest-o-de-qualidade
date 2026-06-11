import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';
import DefectPhotoUpload from '../components/DefectPhotoUpload';
import EscolhaMotivoInput from '../components/EscolhaMotivoInput';
import { defectPhotoService, type PendingPhoto } from '../services/defectPhotoService';
import { escolhaProblemasService } from '../services/escolhaProblemasService';
import { dedupInspections, parseObsSafe } from '../utils/inspectionDedup';

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
type OrderInfo = { op: string; qtd_total: number; status: string; unidades_por_folha?: number };

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

const getShift = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Manha';
  if (hour >= 14 && hour < 22) return 'Tarde';
  return 'Noite';
};

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
  const [escolhaMotivo, setEscolhaMotivo] = useState(''); // motivo/problema da escolha gerada no C/V
  const [escolhaProblemas, setEscolhaProblemas] = useState<string[]>([]); // sugestões (cadastro + fallback)
  const [qtyRefugo, setQtyRefugo] = useState(0);
  const [facaCounts, setFacaCounts] = useState<Record<string, FacaCount>>(emptyFacaCounts());
  const [outrosDescricao, setOutrosDescricao] = useState('');
  const [notes, setNotes] = useState('');
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState(getShift);
  const [selectedDefectKey, setSelectedDefectKey] = useState('');
  const [defectQty, setDefectQty] = useState(0);
  const [numFacas, setNumFacas] = useState(0);
  const [manualFacas, setManualFacas] = useState(0);
  const [opFound, setOpFound] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);

  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [selectedMachineId, setSelectedMachineId]     = useState('');
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [machines, setMachines]   = useState<MachineOption[]>([]);

  const [opList, setOpList] = useState<string[]>([]);
  const [opInfo, setOpInfo] = useState<OrderInfo | null>(null);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [saldoInspecao, setSaldoInspecao] = useState<{ recebido: number; rodadas: number; boas: number; escolha: number } | null>(null);
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
    escolhaProblemasService.listLabels('corte_vinco').then(setEscolhaProblemas);
  }, []);

  // Carrega detalhes da OP ao digitar — pré-preenche facas e saldo do processo inicial
  useEffect(() => {
    if (!op.trim()) {
      setOpFound(null);
      setSaldoInspecao(null);
      setOpInfo(null);
      return;
    }
    const opUpper = op.trim().toUpperCase();

    supabase
      .from('orders')
      .select('op, qtd_total, status, unidades_por_folha')
      .eq('op', opUpper)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setOpInfo(data as OrderInfo);
          const fromOp = data.unidades_por_folha ?? 0;
          if (fromOp > 0) setManualFacas(fromOp);
          setOpFound(true);
        } else {
          setOpInfo(null);
          setOpFound(false);
        }
      });

    // Saldo líquido = aprovadas + em_escolha da impressão − o que já foi registrado neste módulo
    // Escolhas da impressão também vão para o acabamento; a Revisão Final decide o que sai bom.
    Promise.all([
      supabase
        .from('inspections')
        .select('observations, created_at')
        .eq('op', opUpper)
        .order('created_at', { ascending: false }),
      supabase
        .from('acabamento_registros')
        .select('id, qty_revisadas, qty_reprovadas, qty_aprovadas, defects, operator_ids, machine_id, timestamp')
        .eq('op', opUpper)
        .eq('modulo', 'corte_vinco')
        .order('timestamp', { ascending: true }),
    ]).then(([inspRes, cvRes]) => {
      let boasImpressao = 0;
      let escolhaImpressao = 0;
      let rodadas = 0;
      // Parciais da mesma rodada SOMAM; só duplo-save idêntico é descartado.
      const inspRows = dedupInspections((inspRes.data ?? []) as Array<{ observations: string; created_at: string }>, {
        getObs: row => parseObsSafe(row.observations),
        getCreatedAt: row => row.created_at,
      });
      for (const row of inspRows) {
        const obs = parseObsSafe(row.observations);
        if (obs.process_area === 'producao_inicial' && obs.saldo_unidades) {
          boasImpressao += Number(obs.saldo_unidades.aprovadas) || 0;
          escolhaImpressao += Number(obs.saldo_unidades.em_escolha) || 0;
          rodadas += Number(obs.saldo_unidades.rodadas) || 0;
        }
      }
      // C/V recebe SÓ as APROVADAS da impressão.
      // A escolha da impressão vai direto pra Revisão Final — não passa pelo C/V.
      const totalDisponivel = boasImpressao;
      const jaProcessado = (cvRes.data ?? []).reduce(
        (s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0
      );
      const liquido = Math.max(0, totalDisponivel - jaProcessado);
      if (totalDisponivel > 0 || rodadas > 0) {
        setSaldoInspecao({ recebido: liquido, rodadas, boas: boasImpressao, escolha: escolhaImpressao });
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
    setEscolhaMotivo('');
    setQtyRefugo(0);
    setFacaCounts(emptyFacaCounts());
    setOutrosDescricao('');
    setNotes('');
    setRecordDate(new Date().toISOString().slice(0, 10));
    setShift(getShift());
    setSelectedDefectKey('');
    setDefectQty(0);
    setNumFacas(0);
    setManualFacas(0);
    setOpFound(null);
    setOpInfo(null);
    setSaldoInspecao(null);
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setPendingPhotos([]);
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
    if (!recordDate || !shift) {
      showToast('Informe data e turno', 'error');
      return;
    }
    if (!selectedDefectKey && defectQty > 0) {
      showToast('Selecione o defeito encontrado', 'error');
      return;
    }
    if (saldoInspecao && qtyRevisadas > saldoInspecao.recebido) {
      showToast(`Quantidade rodada maior que o saldo disponivel da etapa anterior. Recebido: ${fmt(saldoInspecao.recebido)} un.`, 'error');
      return;
    }
    if (qtyEscolha + qtyRefugo > qtyRevisadas) {
      showToast('Escolha + refugo nao pode ser maior que o rodado nesta etapa.', 'error');
      return;
    }
    if (qtyEscolha > 0 && !escolhaMotivo.trim()) {
      showToast('Informe o motivo da escolha gerada no C/V antes de salvar.', 'error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('Sessão expirada. Faça login novamente.', 'error');
      return;
    }

    // Totais simples de defeitos
    const defectsPayload: Record<string, number> = {};
    if (selectedDefectKey && defectQty > 0) {
      defectsPayload[selectedDefectKey] = defectQty;
    }
    for (const d of DEFECTS) {
      const total = facaTotal(facaCounts[d.key] ?? {});
      if (total > 0) defectsPayload[d.key] = (defectsPayload[d.key] ?? 0) + total;
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
    if (qtyRefugo > 0) {
      defectsPayload['qty_refugo'] = qtyRefugo;
    }
    // A escolha da impressão vai direto à Revisão Final — não passa pelo C/V.
    // O C/V registra apenas a escolha que ele próprio gerou.

    setSaving(true);
    const { data: inserted, error } = await supabase.from('acabamento_registros').insert({
      op: op.trim().toUpperCase(),
      modulo: 'corte_vinco',
      auxiliar_user_id: user.id,
      operator_ids: selectedOperatorIds,
      machine_id: selectedMachineId,
      qty_revisadas: qtyRevisadas,
      qty_aprovadas: Math.max(0, qtyRevisadas - qtyEscolha - qtyRefugo),
      qty_reprovadas: qtyEscolha,
      defects: escolhaMotivo.trim() ? { ...defectsPayload, escolha_motivo: escolhaMotivo.trim() } : defectsPayload,
      faca_defects: Object.keys(facaDefectsPayload).length > 0 ? facaDefectsPayload : null,
      unidades_por_folha: numFacas > 0 ? numFacas : null,
      notes: [
        `Data: ${recordDate}`,
        `Turno: ${shift}`,
        notes.trim(),
      ].filter(Boolean).join('\n') || null,
    }).select('id').single();

    if (error) {
      setSaving(false);
      console.error('Erro ao salvar:', error);
      showToast(error.message || 'Erro ao salvar registro', 'error');
      return;
    }

    // Upload de fotos de defeito (se houver)
    if (inserted && pendingPhotos.length > 0) {
      try {
        await defectPhotoService.uploadMany({
          recordId: inserted.id,
          recordTable: 'acabamento_registros',
          photos: pendingPhotos,
          userId: user.id,
        });
        pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview));
        setPendingPhotos([]);
      } catch (photoErr) {
        console.error('Erro ao enviar fotos:', photoErr);
        showToast('Registro salvo, mas houve erro ao enviar algumas fotos.', 'warning');
      }
    }

    setSaving(false);
    showToast('Registro salvo com sucesso!', 'success');
    handleClear();
    loadRecent();
  };

  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const qtyAprovadas = Math.max(0, qtyRevisadas - qtyEscolha - qtyRefugo);
  const saldoRecebido = saldoInspecao?.recebido ?? 0;
  const saldoExcedido = saldoInspecao !== null && qtyRevisadas > saldoRecebido;
  const composicaoInvalida = qtyEscolha + qtyRefugo > qtyRevisadas;
  const statusLabel = opInfo?.status ? opInfo.status.replace(/_/g, ' ') : opFound === false ? 'OP nao encontrada' : 'Em preenchimento';

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-16">
      <div className="mx-auto max-w-5xl p-3 md:p-4 space-y-3">

        {/* ── Cabeçalho compacto ── */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-indigo-500">content_cut</span>
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black uppercase tracking-widest text-indigo-500 leading-none">Processo</p>
              <h1 className="text-lg font-black uppercase text-slate-900 dark:text-white leading-tight">Corte e Vinco</h1>
            </div>
            {(saldoExcedido || composicaoInvalida) && (
              <span className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 text-[9px] font-black uppercase tracking-widest">
                ⚠ {saldoExcedido ? 'Saldo excedido' : 'Composição inválida'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="md:col-span-2">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Nº da OP</label>
              <input list="cv-op-list-simple" value={op} onChange={e => setOp(e.target.value)} placeholder="OP"
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800" />
              <datalist id="cv-op-list-simple">{opList.map(o => <option key={o} value={o} />)}</datalist>
            </div>
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Qtd. pedido</label>
              <p className="mt-0.5 flex h-9 items-center rounded-lg bg-slate-50 px-2.5 text-sm font-black text-slate-700 dark:bg-slate-800 dark:text-slate-100">{fmt(opInfo?.qtd_total ?? 0)}</p>
            </div>
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Status</label>
              <p className={`mt-0.5 flex h-9 items-center rounded-lg px-2.5 text-xs font-black uppercase truncate ${opFound === false ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/20' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20'}`}>{statusLabel}</p>
            </div>
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Data</label>
              <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)}
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>
        </section>

        {/* ── Grid principal ── */}
        <div className="grid md:grid-cols-[1fr_296px] gap-3 items-start">

          {/* Coluna esquerda: saldo + escolha + fotos */}
          <div className="space-y-3">

            {/* Saldo da etapa */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-indigo-500 text-sm">calculate</span>
                Saldo da etapa
              </p>
              {/* Informativo: escolha da impressão não passa pelo C/V */}
              {(saldoInspecao?.escolha ?? 0) > 0 && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/10">
                  <span className="material-symbols-outlined text-amber-500 text-sm">info</span>
                  <p className="text-[9px] text-amber-700 dark:text-amber-300 font-semibold">
                    {fmt(saldoInspecao?.escolha ?? 0)} un. em escolha da impressão seguem direto à <strong>Revisão Final</strong> — não passam pelo C/V.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-5 gap-1.5">
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/20 p-2.5 flex flex-col gap-1">
                  <p className="text-[7px] font-black uppercase tracking-widest text-indigo-500 leading-tight">Boas recebidas</p>
                  <p className="text-xl font-black text-indigo-800 dark:text-indigo-200 leading-none">{fmt(saldoRecebido)}</p>
                </div>
                <QtyCard label="Rodado" value={qtyRevisadas} onChange={setQtyRevisadas} colorClass="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50" />
                <QtyCard label="Escolha C/V" value={qtyEscolha} onChange={setQtyEscolha} colorClass="border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20" />
                <QtyCard label="Refugo" value={qtyRefugo} onChange={setQtyRefugo} colorClass="border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20" />
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 p-2.5 flex flex-col gap-1">
                  <p className="text-[7px] font-black uppercase tracking-widest text-emerald-600 leading-tight">Saldo bom</p>
                  <p className="text-xl font-black text-emerald-800 dark:text-emerald-200 leading-none">{fmt(qtyAprovadas)}</p>
                </div>
              </div>
              {/* Motivo da escolha gerada no C/V */}
              {qtyEscolha > 0 && (
                <div className="mt-2.5">
                  <EscolhaMotivoInput
                    etapa="corte_vinco"
                    value={escolhaMotivo}
                    onChange={setEscolhaMotivo}
                    label="Motivo da escolha C/V (obrigatório)"
                    required
                    problemas={escolhaProblemas}
                  />
                </div>
              )}
            </section>

            {/* Fotos de defeito */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <DefectPhotoUpload pendingPhotos={pendingPhotos} onPendingChange={setPendingPhotos} disabled={saving} />
            </section>
          </div>

          {/* Coluna direita: turno */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-indigo-500 text-sm">assignment_ind</span>
              Registro do turno
            </p>
            <div className="space-y-2.5">
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Operador</label>
                <select value={selectedOperatorIds[0] ?? ''} onChange={e => setSelectedOperatorIds(e.target.value ? [e.target.value] : [])}
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Selecione o operador</option>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Máquina</label>
                <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)}
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Selecione a máquina</option>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.name}{m.code ? ` (${m.code})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Turno</label>
                <select value={shift} onChange={e => setShift(e.target.value)}
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="Manha">Manhã</option>
                  <option value="Tarde">Tarde</option>
                  <option value="Noite">Noite</option>
                </select>
              </div>
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Defeito encontrado</label>
                <select value={selectedDefectKey} onChange={e => setSelectedDefectKey(e.target.value)}
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Sem defeito</option>
                  {DEFECTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              {selectedDefectKey && (
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Qtd. do defeito</label>
                  <input type="number" min={0} value={defectQty}
                    onChange={e => setDefectQty(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-black outline-none dark:border-slate-700 dark:bg-slate-800" />
                </div>
              )}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Observação</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                  placeholder="Observações do processo..."
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs outline-none dark:border-slate-700 dark:bg-slate-800 resize-none" />
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-5xl gap-3">
          <button type="button" onClick={handleClear} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-black text-slate-500 dark:border-slate-700">Limpar</button>
          <button type="button" onClick={handleSave} disabled={saving || !op.trim() || !selectedMachineId || selectedOperatorIds.length === 0 || saldoExcedido || composicaoInvalida} className="h-11 flex-[2] rounded-xl bg-indigo-600 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar Corte/Vinco'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AcabamentoCortesVincoView;
