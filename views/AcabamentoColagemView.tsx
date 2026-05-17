import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';

// ── Types ─────────────────────────────────────────────────────────────────────
type OperatorOption = { id: string; name: string };
type MachineOption  = { id: string; name: string; code: string };

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

  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [selectedMachineId, setSelectedMachineId]     = useState('');
  const [operators, setOperators]                     = useState<OperatorOption[]>([]);
  const [machines, setMachines]                       = useState<MachineOption[]>([]);

  const [qtyRodadas, setQtyRodadas]       = useState(0);
  const [qtyEscolha, setQtyEscolha]       = useState(0);
  const [qtyRefugo, setQtyRefugo]         = useState(0);
  const [defects, setDefects]             = useState<Record<string, number>>(emptyDefects());
  const [notes, setNotes]                 = useState('');

  const [saldoCorteVinco, setSaldoCorteVinco] = useState<number | null>(null);
  const [recentRecords, setRecentRecords]     = useState<RecentRecord[]>([]);
  const [loadingRecent, setLoadingRecent]     = useState(false);
  const [saving, setSaving]                   = useState(false);

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
    if (!op.trim()) { setOpFound(null); setSaldoCorteVinco(null); return; }
    const opUpper = op.trim().toUpperCase();

    supabase.from('orders').select('op').eq('op', opUpper).maybeSingle()
      .then(({ data }) => setOpFound(!!data));

    Promise.all([
      supabase.from('acabamento_registros')
        .select('qty_aprovadas')
        .eq('op', opUpper)
        .eq('modulo', 'corte_vinco'),
      supabase.from('acabamento_registros')
        .select('qty_revisadas')
        .eq('op', opUpper)
        .eq('modulo', 'colagem'),
    ]).then(([cvRes, colRes]) => {
      const totalAprovadosCv = (cvRes.data ?? [])
        .reduce((s: number, r: { qty_aprovadas: number }) => s + (r.qty_aprovadas || 0), 0);
      const jaProcessadoColagem = (colRes.data ?? [])
        .reduce((s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0);
      if (totalAprovadosCv > 0) {
        const liquido = Math.max(0, totalAprovadosCv - jaProcessadoColagem);
        setSaldoCorteVinco(liquido);
        setQtyRodadas(prev => prev === 0 ? liquido : prev);
      } else {
        setSaldoCorteVinco(null);
      }
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
    setNotes('');
    setOpFound(null);
    setSaldoCorteVinco(null);
  };

  const handleSave = async () => {
    if (!op.trim()) { showToast('Informe o número da OP', 'error'); return; }
    if (!selectedMachineId) { showToast('Selecione a máquina antes de registrar', 'error'); return; }
    if (selectedOperatorIds.length === 0) { showToast('Selecione ao menos um operador', 'error'); return; }
    if (qtyRodadas === 0) { showToast('Informe a quantidade rodada', 'error'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

    const defectsPayload: Record<string, number | string> = {};
    for (const d of DEFECTS) {
      if ((defects[d.key] ?? 0) > 0) defectsPayload[d.key] = defects[d.key];
    }
    // Guarda refugo junto com os defeitos
    if (qtyRefugo > 0) defectsPayload['qty_refugo'] = qtyRefugo;

    setSaving(true);
    const { error } = await supabase.from('acabamento_registros').insert({
      op: op.trim().toUpperCase(),
      modulo: 'colagem',
      auxiliar_user_id: user.id,
      operator_ids: selectedOperatorIds,
      machine_id: selectedMachineId,
      qty_revisadas: qtyRodadas,
      qty_aprovadas: Math.max(0, qtyRodadas - qtyEscolha - qtyRefugo),
      qty_reprovadas: qtyEscolha,
      defects: Object.keys(defectsPayload).length > 0 ? defectsPayload : null,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      console.error('Erro ao salvar colagem:', error);
      showToast('Erro ao salvar registro', 'error');
      return;
    }

    showToast('Registro de colagem salvo!', 'success');
    handleClear();
    loadRecent();
  };

  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const qtyAprovadas = Math.max(0, qtyRodadas - qtyEscolha - qtyRefugo);
  const totalDefects = DEFECTS.reduce((s, d) => s + (defects[d.key] ?? 0), 0);

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
              <span className="ml-auto text-[8px] font-bold text-slate-400 normal-case tracking-normal">Selecione todos que trabalharam</span>
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
                Saldo recebido do Corte e Vinco
              </p>
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                {fmt(saldoCorteVinco)} unidades aprovadas disponíveis
              </p>
            </div>
          </div>
        )}

        {/* Seção 2: Quantidades */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Quantidades</h2>
          <div className="grid grid-cols-3 gap-3">
            <QtyCard
              label="Rodadas"
              value={qtyRodadas}
              onChange={setQtyRodadas}
              colorClass="border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
            />
            <QtyCard
              label="Saiu p/ Escolha"
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
              Aprovadas direto: {fmt(qtyAprovadas)} un.
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
