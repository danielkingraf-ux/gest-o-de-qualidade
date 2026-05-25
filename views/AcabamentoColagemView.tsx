import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';
import DefectPhotoUpload from '../components/DefectPhotoUpload';
import { defectPhotoService, type PendingPhoto } from '../services/defectPhotoService';

// ── Types ─────────────────────────────────────────────────────────────────────
type OperatorOption = { id: string; name: string };
type MachineOption  = { id: string; name: string; code: string };
type OrderInfo = { op: string; qtd_total: number; status: string };

type RecentRecord = {
  id: string;
  op: string;
  qty_revisadas: number;
  qty_aprovadas: number;
  qty_reprovadas: number;
  timestamp: string;
  defects: Record<string, number>;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFECTS = [
  { key: 'fundo_virado',     label: 'Fundo Virado',     icon: 'rotate_90_degrees_cw'  },
  { key: 'falta_cola',       label: 'Falta de Cola',    icon: 'water_drop'            },
  { key: 'cola_fraca',       label: 'Cola Fraca',       icon: 'opacity'               },
  { key: 'queimado_correia', label: 'Queimado Correia', icon: 'local_fire_department' },
  { key: 'rasgado',          label: 'Rasgado',          icon: 'block'                 },
  { key: 'modelo_misturado', label: 'Modelo Misturado', icon: 'shuffle'               },
  { key: 'outros',           label: 'Outros',           icon: 'more_horiz'            },
];

const emptyDefects = (): Record<string, number> =>
  Object.fromEntries(DEFECTS.map(d => [d.key, 0]));

const getShift = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Manha';
  if (hour >= 14 && hour < 22) return 'Tarde';
  return 'Noite';
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
      >-</button>
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
      >+</button>
    </div>
  </div>
);

// ── Main View ─────────────────────────────────────────────────────────────────
const AcabamentoColagemView: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useUser();

  const [op, setOp]                                 = useState('');
  const [opList, setOpList]                         = useState<string[]>([]);
  const [opFound, setOpFound]                       = useState<boolean | null>(null);
  const [opInfo, setOpInfo]                         = useState<OrderInfo | null>(null);

  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [selectedMachineId, setSelectedMachineId]     = useState('');
  const [operators, setOperators]                     = useState<OperatorOption[]>([]);
  const [machines, setMachines]                       = useState<MachineOption[]>([]);

  const [qtyRodadas, setQtyRodadas]       = useState(0);
  const [qtyEscolha, setQtyEscolha]       = useState(0);
  const [qtyRefugo, setQtyRefugo]         = useState(0);
  const [defects, setDefects]             = useState<Record<string, number>>(emptyDefects());
  const [selectedDefectKey, setSelectedDefectKey] = useState('');
  const [defectQty, setDefectQty]         = useState(0);
  const [notes, setNotes]                 = useState('');
  const [recordDate, setRecordDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift]                 = useState(getShift);

  const [saldoCorteVinco, setSaldoCorteVinco] = useState<number | null>(null);
  const [opHistory, setOpHistory]             = useState<any[]>([]);
  const [recentRecords, setRecentRecords]     = useState<RecentRecord[]>([]);
  const [loadingRecent, setLoadingRecent]     = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [pendingPhotos, setPendingPhotos]     = useState<PendingPhoto[]>([]);

  // Carrega lista de OPs, operadores e máquinas de Colagem (produto_acabado ou ambos)
  useEffect(() => {
    supabase.from('orders').select('op').order('op').then(({ data }) => {
      if (data) setOpList(data.map((r: { op: string }) => r.op));
    });
    supabase.from('operators').select('id, name, area').eq('active', true)
      .in('area', ['produto_acabado', 'ambos']).order('name')
      .then(({ data }) => { if (data) setOperators(data as OperatorOption[]); });
    supabase.from('machines').select('id, name, code, area').eq('active', true)
      .in('area', ['produto_acabado', 'ambos']).order('name')
      .then(({ data }) => { if (data) setMachines(data as MachineOption[]); });
  }, []);

  // Saldo recebido do Corte e Vinco
  useEffect(() => {
    if (!op.trim()) { setOpFound(null); setOpInfo(null); setSaldoCorteVinco(null); return; }
    const opUpper = op.trim().toUpperCase();

    supabase.from('orders').select('op, qtd_total, status').eq('op', opUpper).maybeSingle()
      .then(({ data }) => {
        setOpFound(!!data);
        setOpInfo((data as OrderInfo | null) ?? null);
      });

    // Saldo recebido do Corte/Vinco: aprovadas + escolha (tudo que rodou)
    // Tudo segue para colagem; a Revisão Final decide o que é bom.
    Promise.all([
      supabase.from('acabamento_registros')
        .select('qty_revisadas')
        .eq('op', opUpper)
        .eq('modulo', 'corte_vinco'),
      supabase.from('acabamento_registros')
        .select('id, qty_revisadas, qty_reprovadas, qty_aprovadas, defects, operator_ids, machine_id, timestamp')
        .eq('op', opUpper)
        .eq('modulo', 'colagem')
        .order('timestamp', { ascending: true }),
    ]).then(([cvRes, colRes]) => {
      const totalRodadoCv = (cvRes.data ?? [])
        .reduce((s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0);
      const jaProcessadoColagem = (colRes.data ?? [])
        .reduce((s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0);
      if (totalRodadoCv > 0) {
        const liquido = Math.max(0, totalRodadoCv - jaProcessadoColagem);
        setSaldoCorteVinco(liquido);
        setQtyRodadas(prev => prev === 0 ? liquido : prev);
      } else {
        setSaldoCorteVinco(null);
      }
      setOpHistory(colRes.data ?? []);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op]);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('acabamento_registros')
      .select('id, op, qty_revisadas, qty_aprovadas, qty_reprovadas, timestamp, defects')
      .eq('modulo', 'colagem')
      .order('timestamp', { ascending: false })
      .limit(10);
    setRecentRecords((data as RecentRecord[]) ?? []);
    setLoadingRecent(false);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const handleClear = () => {
    setOp('');
    setSelectedOperatorIds([]);
    setSelectedMachineId('');
    setQtyRodadas(0);
    setQtyEscolha(0);
    setQtyRefugo(0);
    setDefects(emptyDefects());
    setSelectedDefectKey('');
    setDefectQty(0);
    setNotes('');
    setRecordDate(new Date().toISOString().slice(0, 10));
    setShift(getShift());
    setOpFound(null);
    setOpInfo(null);
    setSaldoCorteVinco(null);
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setPendingPhotos([]);
  };

  const handleSave = async () => {
    if (!op.trim()) { showToast('Informe o número da OP', 'error'); return; }
    if (!selectedMachineId) { showToast('Selecione a máquina antes de registrar', 'error'); return; }
    if (selectedOperatorIds.length === 0) { showToast('Selecione ao menos um operador', 'error'); return; }
    if (qtyRodadas === 0) { showToast('Informe a quantidade rodada', 'error'); return; }
    if (!recordDate || !shift) { showToast('Informe data e turno', 'error'); return; }
    if (!selectedDefectKey && defectQty > 0) { showToast('Selecione o defeito encontrado', 'error'); return; }
    if (saldoCorteVinco !== null && qtyRodadas > saldoCorteVinco) {
      showToast(`Quantidade rodada maior que o saldo disponivel da etapa anterior. Recebido: ${fmt(saldoCorteVinco)} un.`, 'error');
      return;
    }
    if (qtyEscolha + qtyRefugo > qtyRodadas) {
      showToast('Escolha + refugo nao pode ser maior que o rodado nesta etapa.', 'error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

    const defectsPayload: Record<string, number | string> = {};
    if (selectedDefectKey && defectQty > 0) defectsPayload[selectedDefectKey] = defectQty;
    for (const d of DEFECTS) {
      if ((defects[d.key] ?? 0) > 0) defectsPayload[d.key] = Number(defectsPayload[d.key] ?? 0) + defects[d.key];
    }
    // Guarda refugo junto com os defeitos
    if (qtyRefugo > 0) defectsPayload['qty_refugo'] = qtyRefugo;

    setSaving(true);
    const { data: inserted, error } = await supabase.from('acabamento_registros').insert({
      op: op.trim().toUpperCase(),
      modulo: 'colagem',
      auxiliar_user_id: user.id,
      operator_ids: selectedOperatorIds,
      machine_id: selectedMachineId,
      qty_revisadas: qtyRodadas,
      qty_aprovadas: Math.max(0, qtyRodadas - qtyEscolha - qtyRefugo),
      qty_reprovadas: qtyEscolha,
      defects: Object.keys(defectsPayload).length > 0 ? defectsPayload : {},
      notes: [
        `Data: ${recordDate}`,
        `Turno: ${shift}`,
        notes.trim(),
      ].filter(Boolean).join('\n') || null,
    }).select('id').single();

    if (error) {
      setSaving(false);
      console.error('Erro ao salvar colagem:', error);
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
    showToast('Registro de colagem salvo!', 'success');
    handleClear();
    loadRecent();
  };

  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const qtyAprovadas = Math.max(0, qtyRodadas - qtyEscolha - qtyRefugo);
  const totalDefects = DEFECTS.reduce((s, d) => s + (defects[d.key] ?? 0), 0);
  const saldoRecebido = saldoCorteVinco ?? 0;
  const saldoExcedido = saldoCorteVinco !== null && qtyRodadas > saldoRecebido;
  const composicaoInvalida = qtyEscolha + qtyRefugo > qtyRodadas;
  const statusLabel = opInfo?.status ? opInfo.status.replace(/_/g, ' ') : opFound === false ? 'OP nao encontrada' : 'Em preenchimento';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-5">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Processo atual</p>
              <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Colagem</h1>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Numero da OP</p>
                  <input list="col-op-list-simple" value={op} onChange={e => setOp(e.target.value)} placeholder="OP" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800" />
                  <datalist id="col-op-list-simple">{opList.map(o => <option key={o} value={o} />)}</datalist>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Quantidade solicitada</p>
                  <p className="mt-1 flex h-10 items-center rounded-xl bg-slate-50 px-3 text-sm font-black text-slate-800 dark:bg-slate-800 dark:text-slate-100">{fmt(opInfo?.qtd_total ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status da OP</p>
                  <p className={`mt-1 flex h-10 items-center rounded-xl px-3 text-xs font-black uppercase ${opFound === false ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/20' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20'}`}>{statusLabel}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Data</p>
                  <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-800" />
                </div>
              </div>
            </div>
            <div className={`rounded-2xl border p-4 ${saldoExcedido || composicaoInvalida ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20' : 'border-indigo-100 bg-indigo-50 dark:border-indigo-900/40 dark:bg-indigo-950/20'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Risco de fechamento</p>
              <p className={`mt-2 text-sm font-black ${saldoExcedido || composicaoInvalida ? 'text-rose-700 dark:text-rose-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
                {saldoExcedido ? 'Rodado acima do saldo recebido.' : composicaoInvalida ? 'Escolha + refugo maior que o rodado.' : 'Quantidades fisicas coerentes.'}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500">calculate</span>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Saldo da etapa</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Saldo recebido da etapa anterior</p>
              <p className="mt-2 text-2xl font-black text-indigo-800 dark:text-indigo-200">{fmt(saldoRecebido)}</p>
            </div>
            <QtyCard label="Quantidade rodada nesta etapa" value={qtyRodadas} onChange={setQtyRodadas} colorClass="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50" />
            <QtyCard label="Quantidade em escolha" value={qtyEscolha} onChange={setQtyEscolha} colorClass="border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20" />
            <QtyCard label="Quantidade refugada" value={qtyRefugo} onChange={setQtyRefugo} colorClass="border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20" />
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Saldo bom para proxima etapa</p>
              <p className="mt-2 text-2xl font-black text-emerald-800 dark:text-emerald-200">{fmt(qtyAprovadas)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500">assignment_ind</span>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Registro do turno</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operador</label>
              <select value={selectedOperatorIds[0] ?? ''} onChange={e => setSelectedOperatorIds(e.target.value ? [e.target.value] : [])} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                <option value="">Selecione o operador</option>
                {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Maquina</label>
              <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                <option value="">Selecione a maquina</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name}{m.code ? ` (${m.code})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Turno</label>
              <select value={shift} onChange={e => setShift(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                <option value="Manha">Manha</option>
                <option value="Tarde">Tarde</option>
                <option value="Noite">Noite</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Defeito encontrado</label>
              <select value={selectedDefectKey} onChange={e => setSelectedDefectKey(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                <option value="">Sem defeito</option>
                {DEFECTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Quantidade do defeito</label>
              <input type="number" min={0} value={defectQty} onChange={e => setDefectQty(Math.max(0, Number(e.target.value) || 0))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Observacao</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Observacoes do processo..." className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>
        </section>

        {/* Fotos de Defeito */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <DefectPhotoUpload
            pendingPhotos={pendingPhotos}
            onPendingChange={setPendingPhotos}
            disabled={saving}
          />
        </section>
      </div>

      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-5xl gap-3">
          <button type="button" onClick={handleClear} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-black text-slate-500 dark:border-slate-700">Limpar</button>
          <button type="button" onClick={handleSave} disabled={saving || !op.trim() || !selectedMachineId || selectedOperatorIds.length === 0 || saldoExcedido || composicaoInvalida} className="h-11 flex-[2] rounded-xl bg-indigo-600 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar Colagem'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="pb-24">
      <div className="p-4 md:p-6 max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-indigo-600">precision_manufacturing</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Colagem</h1>
              <p className="text-xs text-slate-500">Registro de operador, quantidades e defeitos de colagem</p>
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
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Identificação</h2>

          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Número da OP</label>
          <input
            list="col-op-list"
            value={op}
            onChange={e => setOp(e.target.value)}
            placeholder="Ex: 12345"
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <datalist id="col-op-list">
            {opList.map(o => <option key={o} value={o} />)}
          </datalist>
          {opFound === false && (
            <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">warning</span>
              OP não encontrada no cadastro
            </p>
          )}

          {/* Máquina */}
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
              <p className="text-[10px] text-amber-500 mt-1">Nenhuma máquina cadastrada para Colagem. Cadastre em Administração.</p>
            )}
          </div>

          {/* Operadores */}
          <div className="mt-3">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
              Operadores <span className="text-rose-500">*</span>
              <span className="ml-auto text-[8px] font-bold text-amber-500 normal-case tracking-normal">⚠ 1 registro por turno</span>
            </label>
            {operators.length === 0 ? (
              <p className="text-[10px] text-amber-500 mt-1">Nenhum operador cadastrado para Colagem. Cadastre em Administração.</p>
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
        </section>

        {/* Rastreio da OP */}
        <OpTraceBanner op={op} moduloAtual="colagem" />

        {/* Banner: saldo recebido do Corte e Vinco */}
        {saldoCorteVinco !== null && (
          <div className="mb-4 flex items-start gap-2 px-3 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
            <span className="material-symbols-outlined text-indigo-500 text-sm mt-0.5">content_cut</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                Recebido do Corte/Vinco
              </p>
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                {fmt(saldoCorteVinco)} unidades do Corte e Vinco disponiveis para colagem
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
                  .filter(([k]) => k !== 'qty_refugo')
                  .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
                const topDef = (Object.entries(r.defects ?? {}) as [string, number][])
                  .filter(([k, v]) => k !== 'qty_refugo' && v > 0)
                  .sort((a, b) => b[1] - a[1])[0];
                const refugo = r.defects?.qty_refugo ?? 0;
                const hasProblems = defTotal > 0 || refugo > 0;
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
                      {refugo > 0 && <span className="text-rose-500">{fmt(refugo)} ref.</span>}
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
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Quantidades</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50 dark:bg-indigo-950/20">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Recebido da etapa anterior</span>
              <span className="h-6 flex items-center justify-center font-black text-xs text-indigo-700 dark:text-indigo-300">{fmt(saldoCorteVinco ?? 0)}</span>
            </div>
            <QtyCard
              label="Rodado nesta etapa"
              value={qtyRodadas}
              onChange={setQtyRodadas}
              colorClass="border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
            />
            <QtyCard
              label="Em escolha"
              value={qtyEscolha}
              onChange={setQtyEscolha}
              colorClass="border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20"
            />
            <QtyCard
              label="Refugo"
              value={qtyRefugo}
              onChange={setQtyRefugo}
              colorClass="border-rose-100 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-950/20"
            />
          </div>
          {qtyRodadas > 0 && (
            <p className="mt-2 text-[10px] font-bold text-slate-400">
              Saldo bom para proxima etapa: {fmt(qtyAprovadas)} un.
            </p>
          )}
        </section>

        {/* Seção 3: Defeitos */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Defeitos</h2>
            {totalDefects > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/30 text-rose-600 text-[10px] font-black">
                {fmt(totalDefects)} total
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEFECTS.map(d => {
              const count = defects[d.key] ?? 0;
              return (
                <div
                  key={d.key}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition-colors ${
                    count > 0
                      ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20'
                      : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'
                  }`}
                >
                  <span className={`material-symbols-outlined text-sm ${count > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{d.icon}</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1 truncate">{d.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDefects(p => ({ ...p, [d.key]: Math.max(0, (p[d.key] ?? 0) - 1) }))}
                      className="size-5 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 text-xs flex items-center justify-center"
                    >-</button>
                    <span className={`w-7 text-center text-xs font-black ${count > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{count}</span>
                    <button
                      type="button"
                      onClick={() => setDefects(p => ({ ...p, [d.key]: (p[d.key] ?? 0) + 1 }))}
                      className="size-5 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 text-xs flex items-center justify-center"
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Seção 4: Observações */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Observações</h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ajustes de máquina, observações sobre o lote..."
            rows={3}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
          />
        </section>

        {/* Registros Recentes */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Registros Recentes</h2>
          {loadingRecent ? (
            <div className="flex justify-center py-4">
              <div className="size-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : recentRecords.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">Nenhum registro ainda</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentRecords.map(r => {
                const totalD = Object.entries(r.defects ?? {})
                  .filter(([k]) => k !== 'qty_refugo')
                  .reduce<number>((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
                return (
                  <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-indigo-600 text-sm">precision_manufacturing</span>
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
                        {fmt(r.qty_revisadas)} rodadas • {fmt(r.qty_reprovadas)} escolha • {fmt(r.qty_aprovadas)} aprovadas
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

export default AcabamentoColagemView;
