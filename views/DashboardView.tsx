import { useEffect, useMemo, useState } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { toDefectEntry } from '../utils/defects';

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'day' | 'week' | 'month' | 'year';

interface InspectionRow {
    id: string;
    op: string | null;
    created_at: string;
    observations: string | object | null;
    machine_id: string | null;
}

interface AcabamentoRow {
    id: string;
    op: string | null;
    modulo: string;
    qty_revisadas: number | null;
    qty_aprovadas: number | null;
    qty_reprovadas: number | null;
    timestamp: string;
    defects: unknown;
    operator_ids: string[] | null;
    machine_id: string | null;
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

// Trend badge: positive delta = worse (more desvios) = red up arrow
function TrendBadge({ current, prev }: { current: number; prev: number }) {
    const delta = current - prev;
    if (delta === 0 || prev === 0) return null;
    if (delta > 0)
        return <span className="text-red-500 text-[10px] font-black">▲ {fmt(delta)}</span>;
    return <span className="text-emerald-600 text-[10px] font-black">▼ {fmt(Math.abs(delta))}</span>;
}

// Card do Processo Inicial — mostra o volume total (rodadas, aprovadas, escolha, reprovadas)
function ProcessInicialCard({
    name,
    icon,
    metrics,
    prevMetrics,
}: {
    name: string;
    icon: string;
    color?: string;
    metrics: ProcessMetrics;
    prevMetrics: ProcessMetrics;
}) {
    const { rodadas, aprovadas, escolha, reprovadas, laudos, ops } = metrics;
    const pctAprov = rodadas > 0 ? (aprovadas / rodadas) * 100 : 0;
    const pctEsc   = rodadas > 0 ? (escolha   / rodadas) * 100 : 0;
    const pctRep   = rodadas > 0 ? (reprovadas / rodadas) * 100 : 0;

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-xl text-slate-500 dark:text-slate-400">{icon}</span>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">{name}</span>
                </div>
                <div className="flex items-center gap-2">
                    <TrendBadge current={escolha + reprovadas} prev={prevMetrics.escolha + prevMetrics.reprovadas} />
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {laudos} laudo{laudos !== 1 ? 's' : ''} · {ops} OP{ops !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>
            <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800">
                <div className="p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Unid. Rodadas</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">{fmt(rodadas)}</p>
                </div>
                <div className="p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aprovadas</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">{fmt(aprovadas)}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-emerald-600">{fmtPct(aprovadas, rodadas)}</p>
                </div>
                <div className="p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Em Escolha</p>
                    <p className={`mt-1 text-xl font-black tabular-nums ${escolha > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{fmt(escolha)}</p>
                    <p className={`mt-0.5 text-[10px] font-bold ${escolha > 0 ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>{fmtPct(escolha, rodadas)}</p>
                </div>
                <div className="p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Reprovadas</p>
                    <p className={`mt-1 text-xl font-black tabular-nums ${reprovadas > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmt(reprovadas)}</p>
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
function ProcessDesvioCard({
    name,
    icon,
    metrics,
    prevMetrics,
}: {
    name: string;
    icon: string;
    color?: string;
    metrics: ProcessMetrics;
    prevMetrics: ProcessMetrics;
}) {
    const { escolha, reprovadas, aprovadas, laudos, ops } = metrics;
    const total = escolha + reprovadas + aprovadas;
    const pctEsc = total > 0 ? (escolha / total) * 100 : 0;
    const pctRep = total > 0 ? (reprovadas / total) * 100 : 0;
    const hasAlert = escolha > 0 || reprovadas > 0;

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-xl text-slate-500 dark:text-slate-400">{icon}</span>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">{name}</span>
                </div>
                <div className="flex items-center gap-2">
                    {hasAlert && <span className="size-2 rounded-full bg-amber-400" />}
                    <TrendBadge current={escolha + reprovadas} prev={prevMetrics.escolha + prevMetrics.reprovadas} />
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {laudos} reg. · {ops} OP{ops !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
                <div className="p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aprovadas / Boas</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">{fmt(aprovadas)}</p>
                </div>
                <div className="p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saíram p/ Escolha</p>
                    <p className={`mt-1 text-xl font-black tabular-nums ${escolha > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{fmt(escolha)}</p>
                    {total > 0 && <p className={`mt-0.5 text-[10px] font-bold ${escolha > 0 ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>{fmtPct(escolha, total)}</p>}
                </div>
                <div className="p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Reprovadas / Refugo</p>
                    <p className={`mt-1 text-xl font-black tabular-nums ${reprovadas > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmt(reprovadas)}</p>
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
    const [operatorNames, setOperatorNames] = useState<Record<string, string>>({});
    const [machineNames, setMachineNames]   = useState<Record<string, string>>({});

    // ── Fetch ──────────────────────────────────────────────────────────────────

    const fetchData = async () => {
        setLoading(true);
        try {
            const [inspRes, acabRes, opsRes, machRes] = await Promise.all([
                supabase
                    .from('inspections')
                    .select('id, op, created_at, observations, machine_id')
                    .order('created_at', { ascending: false })
                    .limit(2000),
                supabase
                    .from('acabamento_registros')
                    .select('id, op, modulo, qty_revisadas, qty_aprovadas, qty_reprovadas, timestamp, defects, operator_ids, machine_id')
                    .order('timestamp', { ascending: false })
                    .limit(2000),
                supabase.from('operators').select('id, name'),
                supabase.from('machines').select('id, name'),
            ]);

            if (inspRes.error) throw inspRes.error;
            if (acabRes.error) throw acabRes.error;

            setInspections((inspRes.data ?? []) as InspectionRow[]);
            setAcabamentos((acabRes.data ?? []) as AcabamentoRow[]);

            if (!opsRes.error && opsRes.data) {
                const map: Record<string, string> = {};
                for (const row of opsRes.data) map[row.id] = row.name ?? row.id;
                setOperatorNames(map);
            }

            if (!machRes.error && machRes.data) {
                const map: Record<string, string> = {};
                for (const row of machRes.data) map[row.id] = row.name ?? row.id;
                setMachineNames(map);
            }
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

    // Previous period bounds
    const { start: prevStart, end: prevEnd } = useMemo(() => {
        const prevAnchor = shiftAnchor(period, anchor, -1);
        return getPeriodBounds(period, prevAnchor);
    }, [period, anchor]);

    // ── Filter helpers ────────────────────────────────────────────────────────

    const inRange = (dateStr: string, s: Date = start, e: Date = end) => {
        const d = new Date(dateStr);
        return d >= s && d < e;
    };

    // ── Metrics per process (current period) ──────────────────────────────────

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

    // ── Metrics per process (previous period) ─────────────────────────────────

    const prevMetrics = useMemo(() => {
        const inPrev = (dateStr: string) => inRange(dateStr, prevStart, prevEnd);

        // 1. Processo Inicial
        const inspInitial = inspections.filter((r) => {
            if (!inPrev(r.created_at)) return false;
            const obs = parseObs(r.observations);
            return obs.process_area === 'producao_inicial';
        });

        const prevMetricInicial: ProcessMetrics = {
            laudos: inspInitial.length,
            ops: new Set(inspInitial.map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size,
            rodadas: inspInitial.reduce((s, r) => s + asN(parseObs(r.observations).saldo_unidades?.rodadas), 0),
            aprovadas: inspInitial.reduce((s, r) => s + asN(parseObs(r.observations).saldo_unidades?.aprovadas), 0),
            escolha: inspInitial.reduce((s, r) => s + asN(parseObs(r.observations).saldo_unidades?.em_escolha), 0),
            reprovadas: inspInitial.reduce((s, r) => s + asN(parseObs(r.observations).saldo_unidades?.reprovadas), 0),
        };

        // 2. Corte e Vinco
        const corteRows = acabamentos.filter(
            (r) => r.modulo === 'corte_vinco' && inPrev(r.timestamp),
        );

        const prevMetricCorte: ProcessMetrics = {
            laudos: corteRows.length,
            ops: new Set(corteRows.map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size,
            rodadas: corteRows.reduce((s, r) => s + asN(r.qty_revisadas), 0),
            aprovadas: corteRows.reduce((s, r) => s + asN(r.qty_aprovadas), 0),
            escolha: corteRows.reduce((s, r) => s + asN(r.qty_reprovadas), 0),
            reprovadas: 0,
        };

        // 3. Produto Acabado
        const inspFinal = inspections.filter((r) => {
            if (!inPrev(r.created_at)) return false;
            const obs = parseObs(r.observations);
            return obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis === true;
        });

        const prevMetricAcabado: ProcessMetrics = {
            laudos: inspFinal.length,
            ops: new Set(inspFinal.map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size,
            rodadas: inspFinal.reduce((s, r) => s + asN(parseObs(r.observations).producao?.qty_produzida), 0),
            aprovadas: inspFinal.reduce((s, r) => {
                const obs = parseObs(r.observations);
                const prod = obs.producao ?? {};
                return Math.max(0, asN(prod.qty_produzida) - asN(prod.qty_escolha) - asN(prod.qty_refugo));
            }, 0),
            escolha: inspFinal.reduce((s, r) => s + asN(parseObs(r.observations).producao?.qty_escolha), 0),
            reprovadas: inspFinal.reduce((s, r) => s + asN(parseObs(r.observations).producao?.qty_refugo), 0),
        };

        // 4. Revisão Final
        const revisaoRows = acabamentos.filter(
            (r) => r.modulo === 'revisao_final' && inPrev(r.timestamp),
        );

        const prevMetricRevisao: ProcessMetrics = {
            laudos: revisaoRows.length,
            ops: new Set(revisaoRows.map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size,
            rodadas: revisaoRows.reduce((s, r) => s + asN(r.qty_revisadas), 0),
            aprovadas: revisaoRows.reduce((s, r) => s + asN(r.qty_aprovadas), 0),
            escolha: 0,
            reprovadas: revisaoRows.reduce((s, r) => s + asN(r.qty_reprovadas), 0),
        };

        return { prevMetricInicial, prevMetricCorte, prevMetricAcabado, prevMetricRevisao };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inspections, acabamentos, prevStart, prevEnd]);

    // ── Summary totals ────────────────────────────────────────────────────────

    const summary = useMemo(() => {
        const { metricInicial, metricCorte, metricAcabado, metricRevisao } = metrics;

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
            rodadas: metricInicial.rodadas,
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

    // ── Rankings ──────────────────────────────────────────────────────────────

    const rankings = useMemo(() => {
        const { metricInicial, metricCorte, metricAcabado, metricRevisao } = metrics;

        // 1. Por Setor
        const bySetor = [
            { nome: 'Processo Inicial', escolha: metricInicial.escolha, reprovadas: metricInicial.reprovadas },
            { nome: 'Corte e Vinco',    escolha: metricCorte.escolha,   reprovadas: metricCorte.reprovadas },
            { nome: 'Produto Acabado',  escolha: metricAcabado.escolha, reprovadas: metricAcabado.reprovadas },
            { nome: 'Revisão Final',    escolha: 0,                     reprovadas: metricRevisao.reprovadas },
        ]
            .map((s) => ({ ...s, total: s.escolha + s.reprovadas }))
            .sort((a, b) => b.total - a.total);

        // 2. Por Operador
        const opAcc: Record<string, { records: number; desvios: number }> = {};

        const addOp = (id: string, desvios: number) => {
            if (!opAcc[id]) opAcc[id] = { records: 0, desvios: 0 };
            opAcc[id].records += 1;
            opAcc[id].desvios += desvios;
        };

        // From inspections (producao_inicial) — use all_operator_ids in observations
        for (const r of inspections) {
            if (!inRange(r.created_at)) continue;
            const obs = parseObs(r.observations);
            if (obs.process_area !== 'producao_inicial') continue;
            const ids: string[] = Array.isArray(obs.all_operator_ids) ? obs.all_operator_ids : [];
            const desvios = asN(obs.saldo_unidades?.em_escolha) + asN(obs.saldo_unidades?.reprovadas);
            for (const id of ids) addOp(String(id), desvios);
        }

        // From acabamento_registros (corte_vinco)
        for (const r of acabamentos) {
            if (r.modulo !== 'corte_vinco') continue;
            if (!inRange(r.timestamp)) continue;
            const ids: string[] = Array.isArray(r.operator_ids) ? r.operator_ids : [];
            const desvios = asN(r.qty_reprovadas);
            for (const id of ids) addOp(String(id), desvios);
        }

        const byOperador = Object.entries(opAcc)
            .map(([id, v]) => ({ id, nome: operatorNames[id] ?? id, ...v }))
            .sort((a, b) => b.records - a.records)
            .slice(0, 8);

        // 3. Por Tipo de Defeito
        const defAcc: Record<string, number> = {};

        const addDef = (name: string, count: number) => {
            const entry = toDefectEntry(name, count);
            if (!entry) return;
            defAcc[entry.name] = (defAcc[entry.name] ?? 0) + entry.count;
        };

        // producao_inicial → defeitos.por_unidade
        for (const r of inspections) {
            if (!inRange(r.created_at)) continue;
            const obs = parseObs(r.observations);
            if (obs.process_area !== 'producao_inicial') continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const porUnidade = obs.defeitos?.por_unidade as Record<string, any> | undefined;
            if (porUnidade && typeof porUnidade === 'object') {
                for (const [k, v] of Object.entries(porUnidade)) {
                    const count = typeof v === 'object' && v !== null ? asN((v as Record<string, unknown>).count) : asN(v);
                    if (count > 0) addDef(k, count);
                }
            }
        }

        // produto_acabado → defects
        for (const r of inspections) {
            if (!inRange(r.created_at)) continue;
            const obs = parseObs(r.observations);
            if (obs.process_area !== 'produto_acabado' && obs.is_spreadsheet_analysis !== true) continue;
            const defects = obs.defects as Record<string, number> | undefined;
            if (defects && typeof defects === 'object') {
                for (const [k, v] of Object.entries(defects)) {
                    if (asN(v) > 0) addDef(k, asN(v));
                }
            }
        }

        // acabamento_registros.defects
        for (const r of acabamentos) {
            if (!inRange(r.timestamp)) continue;
            const defects = r.defects as Record<string, number> | null | undefined;
            if (defects && typeof defects === 'object') {
                for (const [k, v] of Object.entries(defects)) {
                    if (asN(v) > 0) addDef(k, asN(v));
                }
            }
        }

        const byDefeito = Object.entries(defAcc)
            .map(([nome, count]) => ({
                nome,
                count,
            }))
            .filter((d) => d.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // 4. Por Máquina
        const machAcc: Record<string, number> = {};

        const addMach = (id: string | null, desvios: number) => {
            if (!id) return;
            machAcc[id] = (machAcc[id] ?? 0) + desvios;
        };

        for (const r of inspections) {
            if (!inRange(r.created_at)) continue;
            const obs = parseObs(r.observations);
            let desvios = 0;
            if (obs.process_area === 'producao_inicial') {
                desvios = asN(obs.saldo_unidades?.em_escolha) + asN(obs.saldo_unidades?.reprovadas);
            } else if (obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis === true) {
                desvios = asN(obs.producao?.qty_escolha) + asN(obs.producao?.qty_refugo);
            }
            addMach(r.machine_id, desvios);
        }

        for (const r of acabamentos) {
            if (!inRange(r.timestamp)) continue;
            addMach(r.machine_id, asN(r.qty_reprovadas));
        }

        const byMaquina = Object.entries(machAcc)
            .map(([id, desvios]) => ({ id, nome: machineNames[id] ?? id, desvios }))
            .sort((a, b) => b.desvios - a.desvios)
            .slice(0, 6);

        return { bySetor, byOperador, byDefeito, byMaquina };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [metrics, inspections, acabamentos, start, end, operatorNames, machineNames]);

    // ── Period navigation ─────────────────────────────────────────────────────

    const handlePrev = () => setAnchor((a) => shiftAnchor(period, a, -1));
    const handleNext = () => setAnchor((a) => shiftAnchor(period, a, 1));

    const PERIOD_TABS: Array<{ value: Period; label: string }> = [
        { value: 'day', label: 'Dia' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mês' },
        { value: 'year', label: 'Ano' },
    ];

    const { bySetor, byOperador, byDefeito, byMaquina } = rankings;
    const maxDefCount = byDefeito.length > 0 ? byDefeito[0].count : 1;
    const revisaoPeriodo = acabamentos.filter((r) => r.modulo === 'revisao_final' && inRange(r.timestamp));
    const opsFecharam = new Set(revisaoPeriodo.filter((r) => {
        const d = (r.defects ?? {}) as Record<string, unknown>;
        return d.status_final === 'fechou' || d.status_final === 'aprovado_com_restricao' || asN(d.falta_para_fechar_pedido) === 0;
    }).map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size;
    const opsNaoFecharam = new Set(revisaoPeriodo.filter((r) => {
        const d = (r.defects ?? {}) as Record<string, unknown>;
        return d.status_final === 'nao_fechou' || d.status_final === 'precisa_reimpressao' || asN(d.falta_para_fechar_pedido) > 0;
    }).map((r) => (r.op ?? '').trim().toUpperCase()).filter(Boolean)).size;
    const reimpressoes = revisaoPeriodo.filter((r) => ((r.defects ?? {}) as Record<string, unknown>).status_final === 'precisa_reimpressao').length;
    const custoRevisao = revisaoPeriodo.reduce((s, r) => s + asN(((r.defects ?? {}) as Record<string, unknown>).custo_revisao), 0);
    const perdasTotais = summary.escolha + summary.reprovadas;
    const percentualPerda = summary.rodadas > 0 ? (perdasTotais / summary.rodadas) * 100 : 0;
    const topProcessosPerda = bySetor.filter((p) => p.total > 0).slice(0, 3);
    const principaisCausas = byDefeito.slice(0, 6);
    // ── Chart data (12 semanas) ─────────────────────────────────────────────
    const chartData = useMemo(() => {
        const WEEKS = 12;
        const now = new Date();
        const weekBuckets = Array.from({ length: WEEKS }, (_, i) => {
            const weekEnd = new Date(now);
            weekEnd.setDate(now.getDate() - (WEEKS - 1 - i) * 7);
            weekEnd.setHours(23, 59, 59, 999);
            const weekStart = new Date(weekEnd);
            weekStart.setDate(weekEnd.getDate() - 6);
            weekStart.setHours(0, 0, 0, 0);
            const label = `${String(weekStart.getDate()).padStart(2, '0')}/${String(weekStart.getMonth() + 1).padStart(2, '0')}`;
            return { start: weekStart, end: weekEnd, label };
        });

        const inWeek = (dateStr: string, s: Date, e: Date) => {
            const d = new Date(dateStr);
            return d >= s && d <= e;
        };

        // 1. Perdas por setor (semanal)
        const perdasPorSetor = weekBuckets.map((w) => {
            let inicial = 0; let corte = 0; let acabado = 0; let revisao = 0;

            inspections.forEach((r) => {
                if (!inWeek(r.created_at, w.start, w.end)) return;
                const obs = parseObs(r.observations);
                if (obs.process_area === 'producao_inicial') {
                    inicial += asN(obs.saldo_unidades?.em_escolha) + asN(obs.saldo_unidades?.reprovadas);
                } else if (obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis === true) {
                    acabado += asN(obs.producao?.qty_escolha) + asN(obs.producao?.qty_refugo);
                }
            });

            acabamentos.forEach((r) => {
                if (!inWeek(r.timestamp, w.start, w.end)) return;
                if (r.modulo === 'corte_vinco') corte += asN(r.qty_reprovadas);
                if (r.modulo === 'revisao_final') revisao += asN(r.qty_reprovadas);
            });

            return {
                semana: w.label,
                'Processo Inicial': inicial,
                'Corte/Vinco': corte,
                'Produto Acabado': acabado,
                'Revisao Final': revisao,
                total: inicial + corte + acabado + revisao,
            };
        });

        // 2. Top 5 defeitos — evolucao semanal
        // Primeiro, achar os top 5 defeitos globais
        const globalDefects: Record<string, number> = {};
        inspections.forEach((r) => {
            const obs = parseObs(r.observations);
            if (obs.process_area === 'producao_inicial') {
                const porUnidade = obs.defeitos?.por_unidade as Record<string, unknown> | undefined;
                if (porUnidade) {
                    for (const [k, v] of Object.entries(porUnidade)) {
                        const c = typeof v === 'object' && v !== null ? asN((v as Record<string, unknown>).count) : asN(v);
                        if (c > 0) { const e = toDefectEntry(k, c); if (e) globalDefects[e.name] = (globalDefects[e.name] ?? 0) + e.count; }
                    }
                }
            }
            if (obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis === true) {
                const defects = obs.defects as Record<string, number> | undefined;
                if (defects) for (const [k, v] of Object.entries(defects)) { if (asN(v) > 0) { const e = toDefectEntry(k, asN(v)); if (e) globalDefects[e.name] = (globalDefects[e.name] ?? 0) + e.count; } }
            }
        });
        acabamentos.forEach((r) => {
            const defects = r.defects as Record<string, number> | null;
            if (defects) for (const [k, v] of Object.entries(defects)) { if (asN(v) > 0) { const e = toDefectEntry(k, asN(v)); if (e) globalDefects[e.name] = (globalDefects[e.name] ?? 0) + e.count; } }
        });
        const top5Defects = Object.entries(globalDefects).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);

        const defeitosSemana = weekBuckets.map((w) => {
            const counts: Record<string, number> = {};
            top5Defects.forEach((d) => (counts[d] = 0));

            inspections.forEach((r) => {
                if (!inWeek(r.created_at, w.start, w.end)) return;
                const obs = parseObs(r.observations);
                const porUnidade = obs.defeitos?.por_unidade as Record<string, unknown> | undefined;
                if (porUnidade) {
                    for (const [k, v] of Object.entries(porUnidade)) {
                        const c = typeof v === 'object' && v !== null ? asN((v as Record<string, unknown>).count) : asN(v);
                        if (c > 0) { const e = toDefectEntry(k, c); if (e && counts[e.name] !== undefined) counts[e.name] += e.count; }
                    }
                }
                const defects = obs.defects as Record<string, number> | undefined;
                if (defects) for (const [k, v] of Object.entries(defects)) { if (asN(v) > 0) { const e = toDefectEntry(k, asN(v)); if (e && counts[e.name] !== undefined) counts[e.name] += e.count; } }
            });

            acabamentos.forEach((r) => {
                if (!inWeek(r.timestamp, w.start, w.end)) return;
                const defects = r.defects as Record<string, number> | null;
                if (defects) for (const [k, v] of Object.entries(defects)) { if (asN(v) > 0) { const e = toDefectEntry(k, asN(v)); if (e && counts[e.name] !== undefined) counts[e.name] += e.count; } }
            });

            return { semana: w.label, ...counts };
        });

        // 3. Taxa de aprovacao semanal (%)
        const taxaAprovacao = weekBuckets.map((w) => {
            let totalRodadas = 0; let totalAprovadas = 0;

            inspections.forEach((r) => {
                if (!inWeek(r.created_at, w.start, w.end)) return;
                const obs = parseObs(r.observations);
                if (obs.process_area === 'producao_inicial') {
                    totalRodadas += asN(obs.saldo_unidades?.rodadas);
                    totalAprovadas += asN(obs.saldo_unidades?.aprovadas);
                }
            });

            acabamentos.forEach((r) => {
                if (!inWeek(r.timestamp, w.start, w.end)) return;
                totalRodadas += asN(r.qty_revisadas);
                totalAprovadas += asN(r.qty_aprovadas);
            });

            const taxa = totalRodadas > 0 ? (totalAprovadas / totalRodadas) * 100 : null;
            return { semana: w.label, aprovacao: taxa !== null ? Number(taxa.toFixed(1)) : null, rodadas: totalRodadas };
        });

        // 4. Perdas por maquina (bar chart)
        const machAcc: Record<string, { nome: string; escolha: number; reprovadas: number }> = {};
        inspections.forEach((r) => {
            if (!r.machine_id) return;
            const obs = parseObs(r.observations);
            let esc = 0; let rep = 0;
            if (obs.process_area === 'producao_inicial') {
                esc = asN(obs.saldo_unidades?.em_escolha);
                rep = asN(obs.saldo_unidades?.reprovadas);
            } else if (obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis === true) {
                esc = asN(obs.producao?.qty_escolha);
                rep = asN(obs.producao?.qty_refugo);
            }
            if (esc > 0 || rep > 0) {
                if (!machAcc[r.machine_id]) machAcc[r.machine_id] = { nome: machineNames[r.machine_id] ?? r.machine_id, escolha: 0, reprovadas: 0 };
                machAcc[r.machine_id].escolha += esc;
                machAcc[r.machine_id].reprovadas += rep;
            }
        });
        acabamentos.forEach((r) => {
            if (!r.machine_id) return;
            const rep = asN(r.qty_reprovadas);
            if (rep > 0) {
                if (!machAcc[r.machine_id]) machAcc[r.machine_id] = { nome: machineNames[r.machine_id] ?? r.machine_id, escolha: 0, reprovadas: 0 };
                machAcc[r.machine_id].reprovadas += rep;
            }
        });
        const maquinasChart = Object.values(machAcc)
            .map((m) => ({ ...m, total: m.escolha + m.reprovadas }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 8);

        return { perdasPorSetor, defeitosSemana, top5Defects, taxaAprovacao, maquinasChart };
    }, [inspections, acabamentos, machineNames]);

    const CHART_COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899'];

    if (!loading) {
        return (
            <div className="mx-auto w-full max-w-7xl animate-fade-in space-y-5 p-4 pb-20 md:p-6">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Painel da Direção</h1>
                            <p className="mt-0.5 text-xs font-bold text-slate-400">Onde está o maior prejuízo?</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                                {PERIOD_TABS.map((tab) => (
                                    <button key={tab.value} type="button" onClick={() => setPeriod(tab.value)}
                                        className={`rounded-lg px-4 py-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${period === tab.value ? 'bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <button type="button" onClick={fetchData} disabled={loading} className="flex h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                <span className="material-symbols-outlined text-base">refresh</span>Atualizar
                            </button>
                        </div>
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button type="button" onClick={handlePrev} className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900"><span className="material-symbols-outlined text-base">chevron_left</span></button>
                        <span className="min-w-[200px] text-center text-xs font-black text-slate-700 dark:text-slate-200">{periodLabel(period, anchor)}</span>
                        <button type="button" onClick={handleNext} className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900"><span className="material-symbols-outlined text-base">chevron_right</span></button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label="Total de OPs no período" value={String(summary.totalOps)} />
                    <StatCard label="OPs que fecharam quantidade" value={String(opsFecharam)} />
                    <StatCard label="OPs que não fecharam" value={String(opsNaoFecharam)} tone={opsNaoFecharam > 0 ? 'rose' : 'slate'} />
                    <StatCard label="Número de reimpressões" value={String(reimpressoes)} tone={reimpressoes > 0 ? 'rose' : 'slate'} />
                    <StatCard label="Percentual de perda total" value={`${percentualPerda.toFixed(1)}%`} tone={percentualPerda > 3 ? 'rose' : percentualPerda > 1 ? 'amber' : 'slate'} />
                    <StatCard label="Custo estimado de revisão" value={custoRevisao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} tone={custoRevisao > 0 ? 'amber' : 'slate'} />
                    <StatCard label="Unidades em perda/escolha" value={fmt(perdasTotais)} tone={perdasTotais > 0 ? 'amber' : 'slate'} />
                    <StatCard label="Base rodada" value={fmt(summary.rodadas)} />
                </div>

                {/* ── Graficos de Tendencia ─────────────────────────────────── */}

                {/* 1. Tendencia semanal de perdas por setor */}
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-base text-indigo-500">trending_down</span>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tendência de Perdas por Setor — Últimas 12 semanas</p>
                        </div>
                    </div>
                    <div className="p-4" style={{ height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData.perdasPorSetor} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gInicial" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gCorte" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gAcabado" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gRevisao" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="semana" tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" />
                                <YAxis tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" width={45} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700 }}
                                    formatter={(value: number, name: string) => [fmt(value), name]}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 800 }} />
                                <Area type="monotone" dataKey="Processo Inicial" stroke="#6366f1" fill="url(#gInicial)" strokeWidth={2} />
                                <Area type="monotone" dataKey="Corte/Vinco" stroke="#f59e0b" fill="url(#gCorte)" strokeWidth={2} />
                                <Area type="monotone" dataKey="Produto Acabado" stroke="#ef4444" fill="url(#gAcabado)" strokeWidth={2} />
                                <Area type="monotone" dataKey="Revisao Final" stroke="#10b981" fill="url(#gRevisao)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* 2. Evolucao dos top defeitos */}
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-rose-500">bug_report</span>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Evolução dos Top 5 Defeitos</p>
                            </div>
                        </div>
                        <div className="p-4" style={{ height: 280 }}>
                            {chartData.top5Defects.length === 0 ? (
                                <div className="flex h-full items-center justify-center text-xs text-slate-400">Sem dados de defeitos</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData.defeitosSemana} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="semana" tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" />
                                        <YAxis tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" width={40} />
                                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700 }} />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: 9, fontWeight: 800 }} />
                                        {chartData.top5Defects.map((name, i) => (
                                            <Line key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* 3. Taxa de aprovacao semanal */}
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-emerald-500">check_circle</span>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Taxa de Aprovação Semanal (%)</p>
                            </div>
                        </div>
                        <div className="p-4" style={{ height: 280 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData.taxaAprovacao} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gAprov" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="semana" tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" width={40} unit="%" />
                                    <Tooltip
                                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700 }}
                                        formatter={(value: number | null) => [value !== null ? `${value}%` : '—', 'Aprovação']}
                                    />
                                    <Area type="monotone" dataKey="aprovacao" stroke="#10b981" fill="url(#gAprov)" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} connectNulls name="Aprovação" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* 4. Maquinas + listas */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {/* Perdas por maquina */}
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-amber-500">precision_manufacturing</span>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Perdas por Máquina</p>
                            </div>
                        </div>
                        <div className="p-4" style={{ height: 280 }}>
                            {chartData.maquinasChart.length === 0 ? (
                                <div className="flex h-full items-center justify-center text-xs text-slate-400">Sem dados de máquina</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData.maquinasChart} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10, fontWeight: 700 }} stroke="#94a3b8" />
                                        <YAxis type="category" dataKey="nome" width={90} tick={{ fontSize: 9, fontWeight: 700 }} stroke="#94a3b8" />
                                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700 }} />
                                        <Bar dataKey="escolha" stackId="a" fill="#f59e0b" name="Escolha" radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="reprovadas" stackId="a" fill="#ef4444" name="Reprovadas" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Top processos com mais perda */}
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Top processos com mais perda</p>
                        </div>
                        <div className="divide-y divide-slate-50 dark:divide-slate-800">
                            {topProcessosPerda.length === 0 ? <p className="px-5 py-4 text-xs text-slate-400">Sem perdas no período</p> : topProcessosPerda.map((item, i) => (
                                <div key={item.nome} className="flex items-center gap-3 px-5 py-3">
                                    <span className="w-4 text-[11px] font-black text-slate-400">{i + 1}</span>
                                    <span className="flex-1 text-xs font-bold text-slate-700 dark:text-slate-200">{item.nome}</span>
                                    <span className="text-[11px] font-black text-red-600">{fmt(item.total)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Principais causas de perda */}
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Principais causas de perda</p>
                        </div>
                        <div className="divide-y divide-slate-50 dark:divide-slate-800">
                            {principaisCausas.length === 0 ? <p className="px-5 py-4 text-xs text-slate-400">Sem defeitos reais no período</p> : principaisCausas.map((item, i) => (
                                <div key={item.nome} className="flex items-center gap-3 px-5 py-3">
                                    <span className="w-4 text-[11px] font-black text-slate-400">{i + 1}</span>
                                    <span className="flex-1 truncate text-xs font-bold text-slate-700 dark:text-slate-200">{item.nome}</span>
                                    <span className="text-[11px] font-black text-slate-500">{fmt(item.count)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <ProcessInicialCard
                            name="Processo Inicial"
                            icon="print"
                            metrics={metrics.metricInicial}
                            prevMetrics={prevMetrics.prevMetricInicial}
                        />
                        <ProcessDesvioCard
                            name="Corte e Vinco"
                            icon="content_cut"
                            metrics={metrics.metricCorte}
                            prevMetrics={prevMetrics.prevMetricCorte}
                        />
                        <ProcessDesvioCard
                            name="Produto Acabado"
                            icon="inventory_2"
                            metrics={metrics.metricAcabado}
                            prevMetrics={prevMetrics.prevMetricAcabado}
                        />
                        <ProcessDesvioCard
                            name="Revisão Final"
                            icon="checklist"
                            metrics={metrics.metricRevisao}
                            prevMetrics={prevMetrics.prevMetricRevisao}
                        />
                    </div>

                    {/* ── Rankings ──────────────────────────────────────────── */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                        {/* Por Setor */}
                        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Incidência por Setor</p>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                {bySetor.every((s) => s.total === 0) ? (
                                    <p className="px-5 py-4 text-xs text-slate-400">Sem ocorrências no período</p>
                                ) : (
                                    bySetor.map((item, i) => (
                                        <div key={item.nome} className="flex items-center gap-3 px-5 py-3">
                                            <span className="w-4 text-[11px] font-black text-slate-400">{i + 1}</span>
                                            <span className="flex-1 text-xs font-bold text-slate-700 dark:text-slate-200">{item.nome}</span>
                                            {item.escolha > 0 && (
                                                <span className="text-[11px] font-black text-amber-600">Esc: {fmt(item.escolha)}</span>
                                            )}
                                            {item.reprovadas > 0 && (
                                                <span className="text-[11px] font-black text-red-600">Rep: {fmt(item.reprovadas)}</span>
                                            )}
                                            <span className="text-[11px] font-black text-slate-500">{fmt(item.total)}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Por Operador */}
                        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operadores com mais Registros</p>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                {byOperador.length === 0 ? (
                                    <p className="px-5 py-4 text-xs text-slate-400">Sem operadores identificados no período</p>
                                ) : (
                                    byOperador.map((item, i) => (
                                        <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                                            <span className="w-4 text-[11px] font-black text-slate-400">{i + 1}</span>
                                            <span className="flex-1 truncate text-xs font-bold text-slate-700 dark:text-slate-200">{item.nome}</span>
                                            <span className="text-[11px] font-black text-slate-500">{item.records} reg.</span>
                                            {item.desvios > 0 && (
                                                <span className="text-[11px] font-black text-amber-600">{fmt(item.desvios)} desv.</span>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Por Tipo de Defeito */}
                        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Defeitos mais Frequentes</p>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                {byDefeito.length === 0 ? (
                                    <p className="px-5 py-4 text-xs text-slate-400">Sem defeitos registrados no período</p>
                                ) : (
                                    byDefeito.map((item, i) => (
                                        <div key={item.nome} className="flex items-center gap-3 px-5 py-3">
                                            <span className="w-4 text-[11px] font-black text-slate-400">{i + 1}</span>
                                            <span className="flex-1 truncate text-xs font-bold text-slate-700 dark:text-slate-200">{item.nome}</span>
                                            <div className="w-16 h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                                <div
                                                    className="h-full rounded-full bg-slate-400"
                                                    style={{ width: `${(item.count / maxDefCount) * 100}%` }}
                                                />
                                            </div>
                                            <span className="w-10 text-right text-[11px] font-black text-slate-500">{fmt(item.count)}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Por Máquina */}
                        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Máquinas com mais Desvios</p>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                {byMaquina.length === 0 ? (
                                    <p className="px-5 py-4 text-xs text-slate-400">Sem dados de máquina no período</p>
                                ) : (
                                    byMaquina.map((item, i) => (
                                        <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                                            <span className="w-4 text-[11px] font-black text-slate-400">{i + 1}</span>
                                            <span className="flex-1 truncate text-xs font-bold text-slate-700 dark:text-slate-200">{item.nome}</span>
                                            <span className={`text-[11px] font-black ${item.desvios > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                                {fmt(item.desvios)} desv.
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                    </div>
                </>
            )}
        </div>
    );
}
