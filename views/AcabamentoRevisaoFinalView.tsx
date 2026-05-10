import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import DefectCounter from '../components/DefectCounter';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFECTS = [
  { key: 'manchas',               label: 'Manchas',             icon: 'texture' },
  { key: 'amassados',             label: 'Amassados',            icon: 'compress' },
  { key: 'dobras',                label: 'Dobras',               icon: 'layers' },
  { key: 'embalagem_incorreta',   label: 'Embalagem Incorreta',  icon: 'inventory_2' },
  { key: 'identificacao_errada',  label: 'Identificação Errada', icon: 'label_off' },
  { key: 'falta_pecas',           label: 'Falta de Peças',       icon: 'remove_circle' },
  { key: 'outros',                label: 'Outros',                icon: 'more_horiz' },
];

const emptyDefects = (): Record<string, number> => Object.fromEntries(DEFECTS.map(d => [d.key, 0]));

type RecentRecord = {
  id: string;
  op: string;
  qty_revisadas: number;
  qty_aprovadas: number;
  qty_reprovadas: number;
  timestamp: string;
  defects: Record<string, number>;
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

// ── Status de aprovação ───────────────────────────────────────────────────────
type LoteStatus = 'aprovado' | 'reprovado' | 'pendente';

const statusConfig: Record<LoteStatus, { label: string; icon: string; colorClass: string }> = {
  aprovado:  { label: 'Aprovado',  icon: 'check_circle', colorClass: 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300' },
  reprovado: { label: 'Reprovado', icon: 'cancel',        colorClass: 'border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300' },
  pendente:  { label: 'Pendente',  icon: 'schedule',      colorClass: 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300' },
};

// ── Main View ─────────────────────────────────────────────────────────────────
const AcabamentoRevisaoFinalView: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useUser();

  const [op, setOp] = useState('');
  const [qtyRevisadas, setQtyRevisadas] = useState(0);
  const [qtyAprovadas, setQtyAprovadas] = useState(0);
  const [qtyReprovadas, setQtyReprovadas] = useState(0);
  const [loteStatus, setLoteStatus] = useState<LoteStatus>('pendente');
  const [defects, setDefects] = useState<Record<string, number>>(emptyDefects());
  const [outrosDescricao, setOutrosDescricao] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [opList, setOpList] = useState<string[]>([]);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  useEffect(() => {
    supabase.from('orders').select('op').order('op').then(({ data }) => {
      if (data) setOpList(data.map((r: { op: string }) => r.op));
    });
  }, []);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('acabamento_registros')
      .select('id, op, qty_revisadas, qty_aprovadas, qty_reprovadas, timestamp, defects')
      .eq('modulo', 'revisao_final')
      .order('timestamp', { ascending: false })
      .limit(10);
    setRecentRecords((data as RecentRecord[]) ?? []);
    setLoadingRecent(false);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const updateDefect = (key: string, delta: number) =>
    setDefects(prev => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }));

  const setDefect = (key: string, val: number) =>
    setDefects(prev => ({ ...prev, [key]: Math.max(0, val) }));

  const totalDefects = Object.values(defects).reduce<number>((s, v) => s + Number(v), 0);

  const handleClear = () => {
    setOp('');
    setQtyRevisadas(0);
    setQtyAprovadas(0);
    setQtyReprovadas(0);
    setLoteStatus('pendente');
    setDefects(emptyDefects());
    setOutrosDescricao('');
    setNotes('');
  };

  const handleSave = async () => {
    if (!op.trim()) {
      showToast('Informe o número da OP', 'error');
      return;
    }
    if (qtyRevisadas === 0) {
      showToast('Informe a quantidade revisada', 'error');
      return;
    }
    if (loteStatus === 'pendente') {
      showToast('Defina o status do lote antes de salvar', 'error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('Sessão expirada. Faça login novamente.', 'error');
      return;
    }

    const defectsPayload: Record<string, unknown> = { _status_lote: loteStatus };
    for (const d of DEFECTS) {
      if (defects[d.key] > 0) defectsPayload[d.key] = defects[d.key];
    }
    if (outrosDescricao.trim()) defectsPayload['outros_descricao'] = outrosDescricao.trim();

    setSaving(true);
    const { error } = await supabase.from('acabamento_registros').insert({
      op: op.trim().toUpperCase(),
      modulo: 'revisao_final',
      auxiliar_user_id: user.id,
      qty_revisadas: qtyRevisadas,
      qty_aprovadas: qtyAprovadas,
      qty_reprovadas: qtyReprovadas,
      defects: defectsPayload,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      console.error('Erro ao salvar:', error);
      showToast('Erro ao salvar registro', 'error');
      return;
    }

    showToast('Revisão final registrada com sucesso!', 'success');
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
            <div className="size-10 rounded-xl bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-teal-600">verified</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Revisão Final
              </h1>
              <p className="text-xs text-slate-500">Controle de qualidade e liberação do lote</p>
            </div>
          </div>
          {profile?.name && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40">
              <span className="material-symbols-outlined text-teal-500 text-sm">person</span>
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300">{profile.name}</span>
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
            list="rf-op-list"
            value={op}
            onChange={e => setOp(e.target.value)}
            placeholder="Ex: 12345"
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20"
          />
          <datalist id="rf-op-list">
            {opList.map(o => <option key={o} value={o} />)}
          </datalist>
        </section>

        {/* Seção 2: Quantidades */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Quantidades
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <QtyCard
              label="Revisadas"
              value={qtyRevisadas}
              onChange={setQtyRevisadas}
              colorClass="border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
            />
            <QtyCard
              label="Aprovadas"
              value={qtyAprovadas}
              onChange={setQtyAprovadas}
              colorClass="border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20"
            />
            <QtyCard
              label="Reprovadas"
              value={qtyReprovadas}
              onChange={setQtyReprovadas}
              colorClass="border-rose-100 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-950/20"
            />
          </div>
        </section>

        {/* Seção 3: Status do Lote */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Decisão do Lote
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(statusConfig) as [LoteStatus, typeof statusConfig[LoteStatus]][]).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLoteStatus(key)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  loteStatus === key
                    ? cfg.colorClass + ' border-current'
                    : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-400 hover:border-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-xl">{cfg.icon}</span>
                <span className="text-[10px] font-black uppercase tracking-wide">{cfg.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Seção 4: Defeitos */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Defeitos Encontrados
            </h2>
            {totalDefects > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/30 text-rose-600 text-[10px] font-black">
                {fmt(totalDefects)} total
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {DEFECTS.map(d => (
              <DefectCounter
                key={d.key}
                name={d.label}
                icon={d.icon}
                count={defects[d.key] ?? 0}
                onUpdate={delta => updateDefect(d.key, delta)}
                onSet={val => setDefect(d.key, val)}
                variant="rose"
              />
            ))}
          </div>

          {(defects['outros'] ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Descreva o defeito "Outros"
              </label>
              <textarea
                value={outrosDescricao}
                onChange={e => setOutrosDescricao(e.target.value)}
                placeholder="Ex: embalagem suja, lacre danificado..."
                rows={2}
                className="mt-1 w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-teal-500/20 resize-none"
              />
            </div>
          )}
        </section>

        {/* Seção 5: Observações */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Observações
          </h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anotações para o supervisor, liberação especial, destino do lote..."
            rows={3}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
          />
        </section>

        {/* Registros Recentes */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Registros Recentes
          </h2>
          {loadingRecent ? (
            <div className="flex justify-center py-4">
              <div className="size-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
            </div>
          ) : recentRecords.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">Nenhum registro ainda</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentRecords.map(r => {
                const st = (r.defects as Record<string, unknown>)['_status_lote'] as LoteStatus | undefined;
                const totalD = Object.entries(r.defects ?? {})
                  .filter(([k]) => k !== '_status_lote' && k !== 'outros_descricao')
                  .reduce<number>((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
                const stCfg = st ? statusConfig[st] : null;
                return (
                  <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="size-8 rounded-lg bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-teal-600 text-sm">verified</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200">OP {r.op}</span>
                        {stCfg && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black border ${stCfg.colorClass}`}>
                            {stCfg.label}
                          </span>
                        )}
                        {totalD > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/30 text-rose-600 text-[9px] font-black">
                            {fmt(totalD)} def.
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {fmt(r.qty_revisadas)} rev • {fmt(r.qty_aprovadas)} apr • {fmt(r.qty_reprovadas)} rep
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
          disabled={saving || !op.trim() || loteStatus === 'pendente'}
          className="flex-[2] h-11 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <span className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <span className="material-symbols-outlined text-sm">save</span>
          )}
          {saving ? 'Salvando...' : 'Salvar Revisão Final'}
        </button>
      </div>
    </div>
  );
};

export default AcabamentoRevisaoFinalView;
