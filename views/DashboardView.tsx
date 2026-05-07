import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    CalendarDays,
    ClipboardList,
    FileText,
    Layers,
    RefreshCw,
    Search,
    TrendingUp,
    Users,
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { ProcessType } from '../types';

type Period = 'day' | 'week' | 'month' | 'year';
type AreaFilter = 'all' | 'initial' | 'final';
type AreaKey = 'initial' | 'final';

interface NormalizedDefect {
    name: string;
    count: number;
}

interface NormalizedInspection {
    id: string;
    op: string;
    date: Date;
    status: string;
    area: AreaKey;
    samples: number;
    rework: number;
    defectsTotal: number;
    folhasImpressas: number;
    folhasRevisadas: number;
    unidadesEscolha: number;
    defects: NormalizedDefect[];
    operatorIds: string[];
}

interface Summary {
    inspections: number;
    samples: number;
    rework: number;
    defects: number;
    folhasImpressas: number;
    folhasRevisadas: number;
    unidadesEscolha: number;
}

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
    { value: 'day', label: 'Dia' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'year', label: 'Ano' },
];

const AREA_OPTIONS: Array<{ value: AreaFilter; label: string }> = [
    { value: 'all', label: 'Todos os processos' },
    { value: 'initial', label: 'Processo inicial' },
    { value: 'final', label: 'Produto acabado' },
];

const emptySummary = (): Summary => ({
    inspections: 0,
    samples: 0,
    rework: 0,
    defects: 0,
    folhasImpressas: 0,
    folhasRevisadas: 0,
    unidadesEscolha: 0,
});

const asNumber = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const parseObs = (value: any) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const normalizeDefects = (raw: any): NormalizedDefect[] => {
    if (!raw) return [];

    if (Array.isArray(raw)) {
        return raw
            .map((item) => ({
                name: String(item?.name || item?.label || 'Outros'),
                count: asNumber(item?.count ?? item?.qty ?? item?.value),
            }))
            .filter((item) => item.count > 0);
    }

    if (typeof raw === 'object') {
        const groups = ['critical', 'major', 'minor'];
        const hasFinishingGroups = groups.some((group) => raw[group] && typeof raw[group] === 'object');

        if (hasFinishingGroups) {
            return groups.flatMap((group) =>
                Object.entries(raw[group] || {}).map(([name, count]) => ({
                    name,
                    count: asNumber(count),
                }))
            ).filter((item) => item.count > 0);
        }

        return Object.entries(raw)
            .map(([name, count]) => ({ name, count: asNumber(count) }))
            .filter((item) => item.count > 0);
    }

    return [];
};

const getProcessArea = (record: any, obs: any): AreaKey => {
    const process = record.process_type || obs.process_type;
    if (
        process === ProcessType.ACABAMENTO ||
        obs.process_area === 'produto_acabado' ||
        obs.is_spreadsheet_analysis === true ||
        obs.is_finishing_laudo === true
    ) {
        return 'final';
    }
    return 'initial';
};

const getOperatorIds = (record: any, obs: any) => {
    if (Array.isArray(obs.all_operator_ids) && obs.all_operator_ids.length > 0) {
        return obs.all_operator_ids.filter(Boolean);
    }
    return record.operator_id ? [record.operator_id] : [];
};

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

const getPeriodBounds = (period: Period, anchor: string) => {
    const base = anchor ? new Date(`${anchor}T00:00:00`) : new Date();
    const start = new Date(base);
    const end = new Date(base);

    if (period === 'week') {
        const day = start.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        start.setDate(start.getDate() + diff);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 7);
    } else if (period === 'month') {
        start.setDate(1);
        end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
    } else if (period === 'year') {
        start.setMonth(0, 1);
        end.setFullYear(start.getFullYear() + 1, 0, 1);
    } else {
        end.setDate(start.getDate() + 1);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return { start, end };
};

const periodLabel = (period: Period, anchor: string) => {
    const { start, end } = getPeriodBounds(period, anchor);
    const format = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (period === 'day') return format.format(start);
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
    return `${format.format(start)} a ${format.format(inclusiveEnd)}`;
};

const bucketKey = (date: Date, period: Period) => {
    if (period === 'year') {
        return date.toLocaleDateString('pt-BR', { month: 'short' });
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const summarize = (items: NormalizedInspection[]): Summary =>
    items.reduce((acc, item) => {
        acc.inspections += 1;
        acc.samples += item.samples;
        acc.rework += item.rework;
        acc.defects += item.defectsTotal;
        acc.folhasImpressas += item.folhasImpressas;
        acc.folhasRevisadas += item.folhasRevisadas;
        acc.unidadesEscolha += item.unidadesEscolha;
        return acc;
    }, emptySummary());

const deviationPercent = (summary: Summary) => {
    const base = summary.samples || summary.folhasRevisadas || summary.folhasImpressas || summary.unidadesEscolha;
    return base > 0 ? (summary.defects / base) * 100 : 0;
};

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));
const formatPercent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export default function DashboardView() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [rawInspections, setRawInspections] = useState<any[]>([]);
    const [operators, setOperators] = useState<Record<string, string>>({});
    const [period, setPeriod] = useState<Period>('month');
    const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
    const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
    const [opFilter, setOpFilter] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: inspections, error: inspectionsError } = await supabase
                .from('inspections')
                .select('*, machines(name), operators(name), analysts(name)')
                .order('created_at', { ascending: false });

            if (inspectionsError) throw inspectionsError;

            const { data: operatorsData, error: operatorsError } = await supabase
                .from('operators')
                .select('id, name');

            if (operatorsError) throw operatorsError;

            const names = (operatorsData || []).reduce((acc: Record<string, string>, operator: any) => {
                acc[operator.id] = operator.name;
                return acc;
            }, {});

            setRawInspections(inspections || []);
            setOperators(names);
        } catch (error) {
            showToast('Erro ao carregar painel da diretoria', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const normalized = useMemo<NormalizedInspection[]>(() => {
        return rawInspections.map((record) => {
            const obs = parseObs(record.observations);
            const defects = normalizeDefects(obs.defects);
            const totalDefects = asNumber(obs.totalDefects) || defects.reduce((sum, defect) => sum + defect.count, 0);
            const escolha = obs.escolha || record.escolha || {};

            return {
                id: record.id,
                op: String(record.op || 'Sem OP'),
                date: new Date(record.created_at || record.timestamp),
                status: record.status,
                area: getProcessArea(record, obs),
                samples: asNumber(record.samples_count),
                rework: asNumber(record.rework_count),
                defectsTotal: totalDefects,
                folhasImpressas: asNumber(escolha.folhas_impressas_total),
                folhasRevisadas: asNumber(escolha.folhas_revisadas_pilha),
                unidadesEscolha: asNumber(escolha.escolhas_unidades),
                defects,
                operatorIds: getOperatorIds(record, obs),
            };
        }).filter((item) => !Number.isNaN(item.date.getTime()));
    }, [rawInspections]);

    const opOptions = useMemo(() => {
        const map = new Map<string, number>();
        normalized.forEach((item) => {
            map.set(item.op, (map.get(item.op) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([op, count]) => ({ op, count }))
            .sort((a, b) => a.op.localeCompare(b.op, 'pt-BR', { numeric: true }));
    }, [normalized]);

    const filtered = useMemo(() => {
        const { start, end } = getPeriodBounds(period, selectedDate);
        const op = opFilter.trim().toLowerCase();

        return normalized.filter((item) => {
            if (item.date < start || item.date >= end) return false;
            if (areaFilter !== 'all' && item.area !== areaFilter) return false;
            if (op && !item.op.toLowerCase().includes(op)) return false;
            return true;
        });
    }, [areaFilter, normalized, opFilter, period, selectedDate]);

    const analytics = useMemo(() => {
        const total = summarize(filtered);
        const initial = summarize(filtered.filter((item) => item.area === 'initial'));
        const final = summarize(filtered.filter((item) => item.area === 'final'));

        const defectMap = new Map<string, number>();
        const operatorMap = new Map<string, { name: string; defects: number; inspections: number }>();
        const timelineMap = new Map<string, { periodo: string; inicial: number; final: number; desvios: number }>();

        filtered.forEach((item) => {
            item.defects.forEach((defect) => {
                defectMap.set(defect.name, (defectMap.get(defect.name) || 0) + defect.count);
            });

            const ids = item.operatorIds.length > 0 ? item.operatorIds : ['sem-operador'];
            ids.forEach((id) => {
                const name = id === 'sem-operador' ? 'Sem operador' : operators[id] || 'Desconhecido';
                const current = operatorMap.get(id) || { name, defects: 0, inspections: 0 };
                current.defects += item.defectsTotal;
                current.inspections += 1;
                operatorMap.set(id, current);
            });

            const key = bucketKey(item.date, period);
            const current = timelineMap.get(key) || { periodo: key, inicial: 0, final: 0, desvios: 0 };
            if (item.area === 'initial') current.inicial += 1;
            if (item.area === 'final') current.final += 1;
            current.desvios += item.defectsTotal;
            timelineMap.set(key, current);
        });

        const defects = Array.from(defectMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const byOperator = Array.from(operatorMap.values())
            .map((item) => ({
                ...item,
                percent: total.defects > 0 ? (item.defects / total.defects) * 100 : 0,
            }))
            .sort((a, b) => b.defects - a.defects)
            .slice(0, 10);

        const timeline = Array.from(timelineMap.values());

        return {
            total,
            initial,
            final,
            defects,
            byOperator,
            timeline,
            areaPie: [
                { name: 'Processo inicial', value: initial.defects, color: '#2563eb' },
                { name: 'Produto acabado', value: final.defects, color: '#f97316' },
            ].filter((item) => item.value > 0),
        };
    }, [filtered, operators, period]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
            </div>
        );
    }

    const hasData = filtered.length > 0;

    return (
        <div className="mx-auto w-full max-w-7xl animate-fade-in space-y-5 p-4 pb-20 md:p-6">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <BarChart3 className="size-7 text-primary" />
                            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                                Painel da Diretoria
                            </h1>
                        </div>
                        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                            Filtro atual: {periodLabel(period, selectedDate)}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={fetchData}
                        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                        <RefreshCw className="size-4" />
                        Atualizar
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
                    <label className="relative block">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">OP</span>
                        <Search className="pointer-events-none absolute bottom-3 left-3 size-4 text-slate-400" />
                        <input
                            value={opFilter}
                            onChange={(event) => setOpFilter(event.target.value)}
                            list="dashboard-op-list"
                            placeholder="Filtrar por OP"
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-bold text-slate-800 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                        <datalist id="dashboard-op-list">
                            {opOptions.map((item) => (
                                <option key={item.op} value={item.op}>{`${item.op} (${item.count})`}</option>
                            ))}
                        </datalist>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Periodo</span>
                        <div className="grid h-11 grid-cols-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                            {PERIOD_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setPeriod(option.value)}
                                    className={`text-[10px] font-black uppercase tracking-wide transition ${period === option.value ? 'bg-primary text-white' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Data base</span>
                        <div className="relative">
                            <CalendarDays className="pointer-events-none absolute left-3 top-3.5 size-4 text-slate-400" />
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(event) => setSelectedDate(event.target.value)}
                                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-bold text-slate-800 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                        </div>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Area</span>
                        <select
                            value={areaFilter}
                            onChange={(event) => setAreaFilter(event.target.value as AreaFilter)}
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        >
                            {AREA_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <MetricCard title="Folhas impressas" value={formatNumber(analytics.total.folhasImpressas)} icon={<FileText />} />
                <MetricCard title="Folhas revisadas" value={formatNumber(analytics.total.folhasRevisadas)} icon={<ClipboardList />} />
                <MetricCard title="Unid. escolha" value={formatNumber(analytics.total.unidadesEscolha)} icon={<Layers />} />
                <MetricCard title="Para revisao" value={formatNumber(analytics.total.rework)} icon={<AlertTriangle />} tone="amber" />
                <MetricCard title="% desvios" value={formatPercent(deviationPercent(analytics.total))} icon={<TrendingUp />} tone="rose" />
                <MetricCard title="Total desvios" value={formatNumber(analytics.total.defects)} icon={<BarChart3 />} tone="blue" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AreaSummary title="Processo inicial" summary={analytics.initial} color="blue" />
                <AreaSummary title="Produto acabado" summary={analytics.final} color="orange" />
            </div>

            {!hasData ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-sm font-black uppercase tracking-widest text-slate-400">Nenhum registro encontrado para os filtros atuais</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <ChartPanel title="Evolucao por periodo" subtitle="Inspecoes por processo e desvios apontados" className="lg:col-span-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analytics.timeline} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="periodo" tick={{ fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="inicial" name="Inicial" stroke="#2563eb" strokeWidth={3} dot={false} />
                                    <Line type="monotone" dataKey="final" name="Final" stroke="#f97316" strokeWidth={3} dot={false} />
                                    <Line type="monotone" dataKey="desvios" name="Desvios" stroke="#e11d48" strokeWidth={3} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </ChartPanel>

                        <ChartPanel title="Desvios por processo" subtitle="Separacao inicial x final">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={analytics.areaPie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={4}>
                                        {analytics.areaPie.map((item) => (
                                            <Cell key={item.name} fill={item.color} stroke={item.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartPanel>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <ChartPanel title="Principais desvios" subtitle="Maiores recorrencias no filtro atual">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.defects} layout="vertical" margin={{ top: 5, right: 20, left: 35, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" tick={{ fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" width={115} tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Bar dataKey="count" name="Desvios" fill="#e11d48" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartPanel>

                        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Desvios por operador</h3>
                                    <p className="text-xs font-bold text-slate-400">Operadores vinculados aos apontamentos</p>
                                </div>
                                <Users className="size-5 text-slate-400" />
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] text-left">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                                            <th className="py-3">Operador</th>
                                            <th className="py-3 text-right">Desvios</th>
                                            <th className="py-3 text-right">% desvios</th>
                                            <th className="py-3 text-right">Registros</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.byOperator.map((operator) => (
                                            <tr key={operator.name} className="border-b border-slate-50 text-sm font-bold text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-200">
                                                <td className="py-3">{operator.name}</td>
                                                <td className="py-3 text-right">{formatNumber(operator.defects)}</td>
                                                <td className="py-3 text-right">{formatPercent(operator.percent)}</td>
                                                <td className="py-3 text-right">{formatNumber(operator.inspections)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function MetricCard({ title, value, icon, tone = 'slate' }: { title: string; value: string; icon: React.ReactElement; tone?: 'slate' | 'amber' | 'rose' | 'blue' }) {
    const colors = {
        slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
        blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    };

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className={`mb-3 flex size-10 items-center justify-center rounded-lg ${colors[tone]}`}>
                {React.cloneElement(icon, { size: 19 })}
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
            <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{value}</p>
        </div>
    );
}

function AreaSummary({ title, summary, color }: { title: string; summary: Summary; color: 'blue' | 'orange' }) {
    const colorClass = color === 'blue' ? 'border-blue-500 text-blue-600' : 'border-orange-500 text-orange-600';

    return (
        <div className={`rounded-lg border-l-4 ${colorClass} border-y border-r border-slate-200 bg-white p-5 shadow-sm dark:border-y-slate-800 dark:border-r-slate-800 dark:bg-slate-900`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">{title}</h2>
                    <p className="mt-1 text-xs font-bold text-slate-400">{formatNumber(summary.inspections)} registros analisados</p>
                </div>
                <p className="text-lg font-black">{formatPercent(deviationPercent(summary))}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <SmallMetric label="Folhas impressas" value={summary.folhasImpressas} />
                <SmallMetric label="Folhas revisadas" value={summary.folhasRevisadas} />
                <SmallMetric label="Unid. escolha" value={summary.unidadesEscolha} />
                <SmallMetric label="Para revisao" value={summary.rework} />
                <SmallMetric label="Amostras" value={summary.samples} />
                <SmallMetric label="Desvios" value={summary.defects} />
            </div>
        </div>
    );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-base font-black text-slate-800 dark:text-white">{formatNumber(value)}</p>
        </div>
    );
}

function ChartPanel({ title, subtitle, className = '', children }: { title: string; subtitle: string; className?: string; children: React.ReactNode }) {
    return (
        <div className={`flex h-[360px] flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
            <div className="mb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">{title}</h3>
                <p className="text-xs font-bold text-slate-400">{subtitle}</p>
            </div>
            <div className="min-h-0 flex-1">{children}</div>
        </div>
    );
}
