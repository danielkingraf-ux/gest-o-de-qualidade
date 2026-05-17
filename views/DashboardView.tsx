import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month' | 'year';

interface InspectionRow {
    id: string;
    op: string | null;
    created_at: string;
    observations: string | object | null;
}

interface AcabamentoRow {
    id: string;
    op: string | null;
    modulo: string;
    qty_revisadas: number | null;
    qty_aprovadas: number | null;
    qty_reprovadas: number | null;
    timestamp: string;
}

interface ProcessMetrics {
    laudos: number;
    ops: number;
    rodadas: number;
    aprovadas: number;
    escolha: number;
    reprovadas: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseObs = (v: string | object | null): Record<string, any> => {
    if (!v) return {};
    if (typeof v === 'object') return v as Record<string, any>;
    try { return JSON.parse(v as string); } catch { return {}; }
};

const asN = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(Math.round(n));

const fmtPct = (n: number, d: number) =>
    d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '—';

const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Returns [start, end) bounds for the given period and anchor date string (YYYY-MM-DD)
const getPeriodBounds = (period: Period, anchor: string): { start: Date; end: Date } => {
    const base = anchor ? new Date(`${anchor}T00:00:00`) : new Date();
    const start = new Date(base);
    const end = new Date(base);

    if (period === 'day') {
        end.setDate(start.getDate() + 1);
    } else if (period === 'week') {
        const dow = start.getDay(); // 0=Sun
        const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
        start.setDate(start.getDate() + diff);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 7);
    } else if (period === 'month') {
        start.setDate(1);
        end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
    } else {
        start.setMonth(0, 1);
        end.setFullYear(start.getFullYear() + 1, 0, 1);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return { start, end };
};

const periodLabel = (period: Period, anchor: string): string => {
    const { start, end } = getPeriodBounds(period, anchor);
    const f = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (period === 'day') return f.format(start);
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
    return `${f.format(start)} a ${f.format(inclusiveEnd)}`;
};

// Advance anchor by ±1 period unit, returning new YYYY-MM-DD string
const shiftAnchor = (period: Period, anchor: string, direction: -1 | 1): string => {
    const base = new Date(`${anchor}T00:00:00`);

    if (period === 'day') {
        base.setDate(base.getDate() + direction);
    } else if (period === 'week') {
        base.setDate(base.getDate() + direction * 7);
    } else if (period === 'month') {
        base.setMonth(base.getMonth() + direction);
    } else {
        base.setFullYear(base.getFullYear() + direction);
    }

    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
};

const emptyMetrics = (): ProcessMetrics => ({
    laudos: 0,
    ops: 0,
    rodadas: 0,
    aprovadas: 0,
    escolha: 0,
    reprovadas: 0,
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    tone = 'slate',
}: {
    label: string;
    value: string;
    tone?: 'slate' | 'amber' | 'rose';
}) {
    const valueColors: Record<string, string> = {
        slate: 'text-slate-900 dark:text-white',
        amber: 'text-amber-600 dark:text-amber-400',
        rose:  'text-red-600   dark:text-red-400',
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className={`mt-1 text-2xl font-black tabular-nums ${valueColors[tone]}`}>{value}</p>
        </div>
    );
}

// Card do Processo Inicial — mostra o volume total (rodadas, aprovadas, escolha, reprovadas)
function ProcessInicialCard({ name, icon, metrics }: { name: string; icon: string; color?: string; metrics: ProcessMetrics }) {
    const { rodadas, aprovadas, escolha, reprovadas, laudos, ops } = metrics;
    const pctAprov = rodadas > 0 ? (aprovadas / rodadas) * 100 : 0;
    const pctEsc   = rodadas > 0 ? (escolha   / rodadas) * 100 : 0;
    const pctRep   = rodadas > 0 ? (reprovadas / rodadas) * 100 : 0;

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-xl text-slate-500 dark:text-slate-400">{icon}</span>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">{name}</span>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {laudos} laudo{laudos !== 1 ? 's' : ''} · {ops} OP{ops !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800">
                <div className="p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Unid. Rodadas</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{fmt(rodadas)}</p>
                </div>
                <div className="p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aprovadas</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{fmt(aprovadas)}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-emerald-600">{fmtPct(aprovadas, rodadas)}</p>
                </div>
                <div className="p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Em Escolha</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums ${escolha > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{fmt(escolha)}</p>
                    <p className={`mt-0.5 text-[10px] font-bold ${escolha > 0 ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>{fmtPct(escolha, rodadas)}</p>
                </div>
                <div className="p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Reprovadas</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums ${reprovadas > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmt(reprovadas)}</p>
                    <p className={`mt-0.5 text-[10px] font-bold ${reprovadas > 0 ? 'text-red-500' : 'text-slate-300 dark:text-slate-600'}`}>{fmtPct(reprovadas, rodadas)}</p>
                </div>
            </div>
            {rodadas > 0 && (
                <div className="flex h-1.5 w-full overflow-hidden rounded-b-xl bg-slate-100 dark:bg-slate-800">
                    <div className="h-full bg-slate-300 transition-all duration-500 dark:bg-slate-600" style={{ width: `${Math.min(pctAprov, 100)}%` }} />
                    <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${Math.min(pctEsc, 100 - pctAprov)}%` }} />
                    <div className="h-full bg-red-500 transition-all duration-500"  style={{ width: `${Math.min(pctRep, 100 - pctAprov - pctEsc)}%` }} />
                </div>
            )}
        </div>
    );
}

// Card dos processos subsequentes — mostra apenas os desvios do fluxo (escolha e reprovadas)
// "Rodadas" não é exibido pois o volume total é definido pelo Processo Inicial
function ProcessDesvioCard({ name, icon, metrics }: { name: string; icon: string; color?: string; metrics: ProcessMetrics }) {
    const { escolha, reprovadas, aprovadas, laudos, ops } = metrics;
    const total = escolha + reprovadas + aprovadas;
    const pctEsc = total > 0 ? (escolha / total) * 100 : 0;
    const pctRep = total > 0 ? (reprovadas / total) * 100 : 0;
    const hasAlert = escolha > 0 || reprovadas > 0;

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-xl text-slate-500 dark:text-slate-400">{icon}</span>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">{name}</span>
                </div>
                <div className="flex items-center gap-2">
                    {hasAlert && <span className="size-2 rounded-full bg-amber-400" />}
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {laudos} reg. · {ops} OP{ops !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
                <div className="p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aprovadas / Boas</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{fmt(aprovadas)}</p>
                </div>
                <div className="p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saíram p/ Escolha</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums ${escolha > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{fmt(escolha)}</p>
                    {total > 0 && <p className={`mt-0.5 text-[10px] font-bold ${escolha > 0 ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>{fmtPct(escolha, total)}</p>}
                </div>
                <div className="p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Reprovadas / Refugo</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums ${reprovadas > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmt(reprovadas)}</p>
                    {total > 0 && <p className={`mt-0.5 text-[10px] font-bold ${reprovadas > 0 ? 'text-red-500' : 'text-slate-300 dark:text-slate-600'}`}>{fmtPct(reprovadas, total)}</p>}
                </div>
            </div>
            {(pctEsc > 0 || pctRep > 0) && (
                <div className="flex h-1.5 w-full overflow-hidden rounded-b-xl bg-slate-100 dark:bg-slate-800">
                    <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${Math.min(pctEsc, 100)}%` }} />
                    <div className="h-full bg-red-500 transition-all duration-500"  style={{ width: `${Math.min(pctRep, 100 - pctEsc)}%` }} />
                </div>
            )}
        </div>
    );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function DashboardView() {
    const { showToast } = useToast();

    const [loading, setLoading] = useState(true);
    const [inspections, setInspections] = useState<InspectionRow[]>([]);
    const [acabamentos, setAcabamentos] = useState<AcabamentoRow[]>([]);
    const [period, setPeriod] = useState<Period>('month');
    const [anchor, setAnchor] = useState<string>(todayStr());

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchData = async () => {
        setLoading(true);
        try {
            const [inspRes, acabRes] = await Promise.all([
                supabase
                    .from('inspections')
                    .select('id, op, created_at, observations')
                    .order('created_at', { ascending: false })
                    .limit(2000),
                supabase
                    .from('acabamento_registros')
                    .select('id, op, modulo, qty_revisadas, qty_aprovadas, qty_reprovadas, timestamp')
                    .order('timestamp', { ascending: false })
                    .limit(2000),
            ]);

            if (inspRes.error) throw inspRes.error;
            if (acabRes.error) throw acabRes.error;

            setInspections((inspRes.data ?? []) as InspectionRow[]);
            setAcabamentos((acabRes.data ?? []) as AcabamentoRow[]);
        } catch (err) {
            console.error(err);
            showToast('Erro ao carregar dados do painel', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Period bounds ─────────────────────────────────────────────────────────

    const { start, end } = useMemo(() => getPeriodBounds(period, anchor), [period, anchor]);

    // ── Filter helpers ────────────────────────────────────────────────────────

    const inRange = (dateStr: string) => {
        const d = new Date(dateStr);
        return d >= start && d < end;
    };

    // ── Metrics per process ───────────────────────────────────────────────────

    const metrics = useMemo(() => {
        // 1. Processo Inicial
        const inspInitial = inspections.filter((r) => {
            if (!inRange(r.created_at)) return false;
            const obs = parseObs(r.observations);
            return obs.process_area === 'producao_inicial';
        });

        const metricInicial: ProcessMetrics = {
            laudos: inspInitial.length,
            ops: new Set(inspInitial.map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size,
            rodadas: inspInitial.reduce((s, r) => s + asN(parseObs(r.observations).saldo_unidades?.rodadas), 0),
            aprovadas: inspInitial.reduce((s, r) => s + asN(parseObs(r.observations).saldo_unidades?.aprovadas), 0),
            escolha: inspInitial.reduce((s, r) => s + asN(parseObs(r.observations).saldo_unidades?.em_escolha), 0),
            reprovadas: inspInitial.reduce((s, r) => s + asN(parseObs(r.observations).saldo_unidades?.reprovadas), 0),
        };

        // 2. Corte e Vinco
        const corteRows = acabamentos.filter(
            (r) => r.modulo === 'corte_vinco' && inRange(r.timestamp),
        );

        const metricCorte: ProcessMetrics = {
            laudos: corteRows.length,
            ops: new Set(corteRows.map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size,
            rodadas: corteRows.reduce((s, r) => s + asN(r.qty_revisadas), 0),
            aprovadas: corteRows.reduce((s, r) => s + asN(r.qty_aprovadas), 0),
            escolha: corteRows.reduce((s, r) => s + asN(r.qty_reprovadas), 0), // sent to revision
            reprovadas: 0,
        };

        // 3. Produto Acabado
        const inspFinal = inspections.filter((r) => {
            if (!inRange(r.created_at)) return false;
            const obs = parseObs(r.observations);
            return obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis === true;
        });

        const metricAcabado: ProcessMetrics = {
            laudos: inspFinal.length,
            ops: new Set(inspFinal.map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size,
            rodadas: inspFinal.reduce((s, r) => s + asN(parseObs(r.observations).producao?.qty_produzida), 0),
            aprovadas: inspFinal.reduce((s, r) => {
                const obs = parseObs(r.observations);
                const prod = obs.producao ?? {};
                const total = asN(prod.qty_produzida);
                const esc = asN(prod.qty_escolha);
                const ref = asN(prod.qty_refugo);
                return s + Math.max(0, total - esc - ref);
            }, 0),
            escolha: inspFinal.reduce((s, r) => s + asN(parseObs(r.observations).producao?.qty_escolha), 0),
            reprovadas: inspFinal.reduce((s, r) => s + asN(parseObs(r.observations).producao?.qty_refugo), 0),
        };

        // 4. Revisão Final
        const revisaoRows = acabamentos.filter(
            (r) => r.modulo === 'revisao_final' && inRange(r.timestamp),
        );

        const metricRevisao: ProcessMetrics = {
            laudos: revisaoRows.length,
            ops: new Set(revisaoRows.map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size,
            rodadas: revisaoRows.reduce((s, r) => s + asN(r.qty_revisadas), 0),
            aprovadas: revisaoRows.reduce((s, r) => s + asN(r.qty_aprovadas), 0),
            escolha: 0,
            reprovadas: revisaoRows.reduce((s, r) => s + asN(r.qty_reprovadas), 0),
        };

        return { metricInicial, metricCorte, metricAcabado, metricRevisao };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inspections, acabamentos, start, end]);

    // ── Summary totals ────────────────────────────────────────────────────────

    const summary = useMemo(() => {
        const { metricInicial, metricCorte, metricAcabado, metricRevisao } = metrics;

        // Unique OPs across all sources
        const allOps = new Set<string>();
        [inspections, acabamentos].forEach((rows) =>
            rows.forEach((r) => {
                const op = (r.op ?? '').trim().toUpperCase();
                if (op) allOps.add(op);
            }),
        );

        // filter to period
        const periodInspOps = new Set<string>();
        inspections.filter((r) => inRange(r.created_at)).forEach((r) => {
            const op = (r.op ?? '').trim().toUpperCase();
            if (op) periodInspOps.add(op);
        });
        const periodAcabOps = new Set<string>();
        acabamentos.filter((r) => inRange(r.timestamp)).forEach((r) => {
            const op = (r.op ?? '').trim().toUpperCase();
            if (op) periodAcabOps.add(op);
        });
        const totalOps = new Set([...periodInspOps, ...periodAcabOps]).size;

        return {
            totalOps,
            rodadas: metricInicial.rodadas, // avoid double-counting
            escolha:
                metricInicial.escolha +
                metricCorte.escolha +
                metricAcabado.escolha +
                metricRevisao.escolha,
            reprovadas:
                metricInicial.reprovadas +
                metricCorte.reprovadas +
                metricAcabado.reprovadas +
                metricRevisao.reprovadas,
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [metrics, inspections, acabamentos, start, end]);

    // ── Period navigation ─────────────────────────────────────────────────────

    const handlePrev = () => setAnchor((a) => shiftAnchor(period, a, -1));
    const handleNext = () => setAnchor((a) => shiftAnchor(period, a, 1));

    const PERIOD_TABS: Array<{ value: Period; label: string }> = [
        { value: 'day', label: 'Dia' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mês' },
        { value: 'year', label: 'Ano' },
    ];

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="mx-auto w-full max-w-7xl animate-fade-in space-y-5 p-4 pb-20 md:p-6">
            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    {/* Title */}
                    <div>
                        <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                            Painel da Direção
                        </h1>
                        <p className="mt-0.5 text-xs font-bold text-slate-400">
                            Métricas consolidadas de produção — todas as unidades
                        </p>
                    </div>

                    {/* Actions */}
                    <button
                        type="button"
                        onClick={fetchData}
                        disabled={loading}
                        className="flex h-10 items-center gap-2 rounded-lg bg-slate-100 px-4 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                        <span
                            className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}
                        >
                            refresh
                        </span>
                        Atualizar
                    </button>
                </div>

                {/* Period tabs + date navigator */}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Pill tabs */}
                    <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                        {PERIOD_TABS.map((tab) => (
                            <button
                                key={tab.value}
                                type="button"
                                onClick={() => setPeriod(tab.value)}
                                className={`rounded-lg px-4 py-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${
                                    period === tab.value
                                        ? 'bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Date navigator */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handlePrev}
                            className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                            aria-label="Período anterior"
                        >
                            <span className="material-symbols-outlined text-base">chevron_left</span>
                        </button>
                        <span className="min-w-[200px] text-center text-xs font-black text-slate-700 dark:text-slate-200">
                            {periodLabel(period, anchor)}
                        </span>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                            aria-label="Próximo período"
                        >
                            <span className="material-symbols-outlined text-base">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Summary row ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="OPs analisadas" value={String(summary.totalOps)} />
                <StatCard
                    label="Unidades rodadas"
                    value={fmt(summary.rodadas)}
                />
                <StatCard
                    label="Unidades em escolha"
                    value={fmt(summary.escolha)}
                    tone="amber"
                />
                <StatCard
                    label="Unidades reprovadas"
                    value={fmt(summary.reprovadas)}
                    tone="rose"
                />
            </div>

            {/* ── Process cards ─────────────────────────────────────────────── */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-600" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ProcessInicialCard
                        name="Processo Inicial"
                        icon="print"
                        metrics={metrics.metricInicial}
                    />
                    <ProcessDesvioCard
                        name="Corte e Vinco"
                        icon="content_cut"
                        metrics={metrics.metricCorte}
                    />
                    <ProcessDesvioCard
                        name="Produto Acabado"
                        icon="inventory_2"
                        metrics={metrics.metricAcabado}
                    />
                    <ProcessDesvioCard
                        name="Revisão Final"
                        icon="checklist"
                        metrics={metrics.metricRevisao}
                    />
                </div>
            )}
        </div>
    );
}
