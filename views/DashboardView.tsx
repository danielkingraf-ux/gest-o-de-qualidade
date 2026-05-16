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
    folhasRodadas: number;
    folhasVerificadas: number;
    folhasAprovadas: number;
    folhasEscolha: number;
    folhasReprovadas: number;
    desviosTotal: number;
    defects: NormalizedDefect[];
    operatorIds: string[];
    machineId: string | null;
}

interface Summary {
    laudos: number;
    ops: number;
    folhasRodadas: number;
    folhasVerificadas: number;
    folhasAprovadas: number;
    folhasEscolha: number;
    folhasReprovadas: number;
    saldoSemRevisao: number;
    desviosTotal: number;
    taxaAprovacao: number;
    taxaReprovacao: number;
}

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
    { value: 'day', label: 'Dia' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mês' },
    { value: 'year', label: 'Ano' },
];

const AREA_OPTIONS: Array<{ value: AreaFilter; label: string }> = [
    { value: 'all', label: 'Todos os processos' },
    { value: 'initial', label: 'Processo inicial' },
    { value: 'final', label: 'Produto acabado' },
];

const emptySummary = (): Summary => ({
    laudos: 0,
    ops: 0,
    folhasRodadas: 0,
    folhasVerificadas: 0,
    folhasAprovadas: 0,
    folhasEscolha: 0,
    folhasReprovadas: 0,
    saldoSemRevisao: 0,
    desviosTotal: 0,
    taxaAprovacao: 0,
    taxaReprovacao: 0,
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
        // Formato InspectionView v2: { por_unidade: { key: { count: N } } }
        if (raw.por_unidade && typeof raw.por_unidade === 'object') {
            return Object.entries(raw.por_unidade)
                .map(([name, val]: [string, any]) => ({
                    name: name.replace(/_/g, ' '),
                    count: asNumber(typeof val === 'object' ? val?.count : val),
                }))
                .filter((item) => item.count > 0);
        }

        // Formato FinishingView: { critical, major, minor }
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

const extractAllDefects = (obs: any): NormalizedDefect[] => {
    const result: NormalizedDefect[] = [];
    // InspectionView salva em "defeitos" (pt), FinishingView em "defects" (en)
    result.push(...normalizeDefects(obs.defeitos ?? obs.defects));
    if (obs.verniz_uv?.aplicavel && obs.verniz_uv?.defeitos)
        normalizeDefects(obs.verniz_uv.defeitos).forEach(d => result.push({ name: `UV: ${d.name}`, count: d.count }));
    if (obs.hot_stamping?.aplicavel && obs.hot_stamping?.defeitos)
        normalizeDefects(obs.hot_stamping.defeitos).forEach(d => result.push({ name: `HS: ${d.name}`, count: d.count }));
    return result;
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

const summarize = (items: NormalizedInspection[]): Summary => {
    const uniqueOps = new Set<string>();
    const s = items.reduce((acc, item) => {
        acc.laudos += 1;
        uniqueOps.add(item.op);
        acc.folhasRodadas += item.folhasRodadas;
        acc.folhasVerificadas += item.folhasVerificadas;
        acc.folhasAprovadas += item.folhasAprovadas;
        acc.folhasEscolha += item.folhasEscolha;
        acc.folhasReprovadas += item.folhasReprovadas;
        acc.desviosTotal += item.desviosTotal;
        return acc;
    }, emptySummary());
    s.ops = uniqueOps.size;
    s.saldoSemRevisao = Math.max(0, s.folhasRodadas - s.folhasVerificadas);
    s.taxaAprovacao = s.folhasVerificadas > 0 ? (s.folhasAprovadas / s.folhasVerificadas) * 100 : 0;
    s.taxaReprovacao = s.folhasVerificadas > 0 ? (s.folhasReprovadas / s.folhasVerificadas) * 100 : 0;
    return s;
};

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));
const formatPercent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export default function DashboardView() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [rawInspections, setRawInspections] = useState<any[]>([]);
    const [operators, setOperators] = useState<Record<string, string>>({});
    const [machines, setMachines] = useState<Record<string, string>>({});
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

            const [{ data: operatorsData, error: operatorsError }, { data: machinesData, error: machinesError }] = await Promise.all([
                supabase.from('operators').select('id, name'),
                supabase.from('machines').select('id, name'),
            ]);

            if (operatorsError) throw operatorsError;
            if (machinesError) throw machinesError;

            const names = (operatorsData || []).reduce((acc: Record<string, string>, operator: any) => {
                acc[operator.id] = operator.name;
                return acc;
            }, {});

            const machineNames = (machinesData || []).reduce((acc: Record<string, string>, machine: any) => {
                acc[machine.id] = machine.name;
                return acc;
            }, {});

            setRawInspections(inspections || []);
            setOperators(names);
            setMachines(machineNames);
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
            const defects = extractAllDefects(obs);

            // Produção: InspectionView salva em obs.producao
            const producao = obs.producao || {};
            const area = getProcessArea(record, obs);

            let folhasRodadas = 0;
            let folhasVerificadas = 0;
            let folhasAprovadas = 0;
            let folhasEscolha = 0;
            let folhasReprovadas = 0;

            if (area === 'initial') {
                // InspectionView: campos em folhas/pilhas
                const folhasPorPilha = Math.max(1, asNumber(producao.folhas_por_pilha ?? 1));
                const unidadesPorFolha = Math.max(1, asNumber(producao.unidades_por_folha ?? 1));
                const unidadesAprovadas = asNumber(producao.unidades_aprovadas);
                const unidadesEscolha = asNumber(producao.unidades_escolha);
                const unidadesReprovadas = asNumber(producao.unidades_reprovadas);
                folhasRodadas = asNumber(producao.quantidade_rodada_folhas);
                folhasVerificadas = asNumber(producao.pilhas_verificadas) * folhasPorPilha;
                folhasAprovadas = unidadesAprovadas > 0
                    ? Math.round(unidadesAprovadas / unidadesPorFolha)
                    : asNumber(producao.pilhas_aprovadas) * folhasPorPilha;
                folhasEscolha = unidadesEscolha > 0
                    ? Math.round(unidadesEscolha / unidadesPorFolha)
                    : asNumber(producao.folhas_escolha);
                folhasReprovadas = unidadesReprovadas > 0
                    ? Math.round(unidadesReprovadas / unidadesPorFolha)
                    : asNumber(producao.folhas_reprovadas);
            } else {
                // FinishingAnalysisView: campos em unidades (qty_produzida, qty_escolha, qty_refugo)
                const qtyTotal = asNumber(producao.qty_produzida);
                const qtyEscolha = asNumber(producao.qty_escolha);
                const qtyRefugo = asNumber(producao.qty_refugo);
                folhasRodadas = qtyTotal;
                folhasVerificadas = asNumber(record.samples_count) || qtyTotal;
                folhasEscolha = qtyEscolha;
                folhasReprovadas = qtyRefugo;
                folhasAprovadas = record.status === 'APPROVED'
                    ? Math.max(0, qtyTotal - qtyEscolha - qtyRefugo)
                    : 0;
            }

            return {
                id: record.id,
                op: String(record.op || 'Sem OP'),
                date: new Date(record.created_at || record.timestamp),
                status: record.status,
                area,
                folhasRodadas,
                folhasVerificadas,
                folhasAprovadas,
                folhasEscolha,
                folhasReprovadas,
                desviosTotal:
                    asNumber(obs.metricas_falha?.falhas_por_unidade) ||
                    asNumber(obs.totalDefects) ||
                    defects.reduce((sum, d) => sum + d.count, 0),
                defects,
                operatorIds: getOperatorIds(record, obs),
                machineId: record.machine_id || null,
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
        const initial = summarize(filtered.filter((item) => item.area === 'initial'));
        const final = summarize(filtered.filter((item) => item.area === 'final'));

        // Folhas rodadas representa a entrada da OP (quantidade da máquina, processo inicial).
        // Não somar com produto acabado — é a mesma OP em estágio diferente.
        const total = summarize(filtered);
        if (areaFilter === 'all') {
            total.folhasRodadas = initial.folhasRodadas;
            total.folhasVerificadas = initial.folhasVerificadas;
            total.folhasAprovadas = initial.folhasAprovadas;
            total.saldoSemRevisao = Math.max(0, total.folhasRodadas - initial.folhasVerificadas);
            total.taxaAprovacao = initial.taxaAprovacao;
            total.taxaReprovacao = initial.taxaReprovacao;
        }

        const defectMap = new Map<string, number>();
        const operatorMap = new Map<string, { name: string; defects: number; inspections: number }>();
        const machineMap = new Map<string, { name: string; defects: number; inspections: number }>();
        const timelineMap = new Map<string, { periodo: string; inicial: number; final: number; desvios: number }>();

        filtered.forEach((item) => {
            item.defects.forEach((defect) => {
                defectMap.set(defect.name, (defectMap.get(defect.name) || 0) + defect.count);
            });

            const ids = item.operatorIds.length > 0 ? item.operatorIds : ['sem-operador'];
            ids.forEach((id) => {
                const name = id === 'sem-operador' ? 'Sem operador' : operators[id] || 'Desconhecido';
                const current = operatorMap.get(id) || { name, defects: 0, inspections: 0 };
                current.defects += item.desviosTotal;
                current.inspections += 1;
                operatorMap.set(id, current);
            });

            if (item.machineId) {
                const machineName = machines[item.machineId] || 'Desconhecida';
                const cur = machineMap.get(item.machineId) || { name: machineName, defects: 0, inspections: 0 };
                cur.defects += item.desviosTotal;
                cur.inspections += 1;
                machineMap.set(item.machineId, cur);
            }

            const key = bucketKey(item.date, period);
            const current = timelineMap.get(key) || { periodo: key, inicial: 0, final: 0, desvios: 0 };
            if (item.area === 'initial') current.inicial += 1;
            if (item.area === 'final') current.final += 1;
            current.desvios += item.desviosTotal;
            timelineMap.set(key, current);
        });

        const defects = Array.from(defectMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const byOperator = Array.from(operatorMap.values())
            .map((item) => ({
                ...item,
                sharePercent: total.desviosTotal > 0 ? (item.defects / total.desviosTotal) * 100 : 0,
                defectsPerRecord: item.inspections > 0 ? item.defects / item.inspections : 0,
            }))
            .sort((a, b) => b.defects - a.defects)
            .slice(0, 10);

        const byMachine = Array.from(machineMap.values())
            .map((item) => ({
                ...item,
                sharePercent: total.desviosTotal > 0 ? (item.defects / total.desviosTotal) * 100 : 0,
                defectsPerRecord: item.inspections > 0 ? item.defects / item.inspections : 0,
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
            byMachine,
            timeline,
            areaPie: [
                { name: 'Processo inicial', value: initial.desviosTotal, color: '#2563eb' },
                { name: 'Produto acabado', value: final.desviosTotal, color: '#f97316' },
            ].filter((item) => item.value > 0),
        };
    }, [filtered, operators, machines, period]);

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
                                Painel Direção
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
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Período</span>
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
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Área</span>
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

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
                <MetricCard title="OPs Analisadas" value={String(analytics.total.ops)} icon={<ClipboardList />} />
                <MetricCard title="Folhas Rodadas" value={formatNumber(analytics.total.folhasRodadas)} icon={<FileText />} />
                <MetricCard title="Verificadas" value={formatNumber(analytics.total.folhasVerificadas)} icon={<Search />} tone="blue" />
                <MetricCard title="Aprovadas" value={formatNumber(analytics.total.folhasAprovadas)} icon={<Layers />} tone="blue" />
                <MetricCard title="Em Escolha" value={formatNumber(analytics.total.folhasEscolha)} icon={<TrendingUp />} tone="amber" />
                <MetricCard title="Reprovadas" value={formatNumber(analytics.total.folhasReprovadas)} icon={<AlertTriangle />} tone="rose" />
                <MetricCard title="Sem Revisão" value={formatNumber(analytics.total.saldoSemRevisao)} icon={<BarChart3 />} tone="amber" />
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
                        <ChartPanel title="Evolução por período" subtitle="Inspeções por processo e desvios apontados" className="lg:col-span-2">
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

                        <ChartPanel title="Desvios por processo" subtitle="Separação inicial x final">
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
                        <ChartPanel title="Principais desvios" subtitle="Maiores recorrências no filtro atual" className="lg:col-span-2">
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
                                    <p className="text-xs font-bold text-slate-400">Média = desvios por registro. % do total = participação nos desvios do filtro.</p>
                                </div>
                                <Users className="size-5 text-slate-400" />
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] text-left">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                                            <th className="py-3">Operador</th>
                                            <th className="py-3 text-right">Desvios</th>
                                            <th className="py-3 text-right">Média</th>
                                            <th className="py-3 text-right">% do total</th>
                                            <th className="py-3 text-right">Registros</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.byOperator.map((operator) => (
                                            <tr key={operator.name} className="border-b border-slate-50 text-sm font-bold text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-200">
                                                <td className="py-3">{operator.name}</td>
                                                <td className="py-3 text-right">{formatNumber(operator.defects)}</td>
                                                <td className="py-3 text-right">{operator.defectsPerRecord.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                                                <td className="py-3 text-right">{formatPercent(operator.sharePercent)}</td>
                                                <td className="py-3 text-right">{formatNumber(operator.inspections)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Desvios por máquina</h3>
                                    <p className="text-xs font-bold text-slate-400">Média = desvios por registro. % do total = participação nos desvios do filtro.</p>
                                </div>
                                <BarChart3 className="size-5 text-slate-400" />
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] text-left">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                                            <th className="py-3">Máquina</th>
                                            <th className="py-3 text-right">Desvios</th>
                                            <th className="py-3 text-right">Média</th>
                                            <th className="py-3 text-right">% do total</th>
                                            <th className="py-3 text-right">Registros</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.byMachine.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-6 text-center text-xs font-bold text-slate-400">Nenhum dado disponível</td>
                                            </tr>
                                        ) : analytics.byMachine.map((machine) => (
                                            <tr key={machine.name} className="border-b border-slate-50 text-sm font-bold text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-200">
                                                <td className="py-3">{machine.name}</td>
                                                <td className="py-3 text-right">{formatNumber(machine.defects)}</td>
                                                <td className="py-3 text-right">{machine.defectsPerRecord.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                                                <td className="py-3 text-right">{formatPercent(machine.sharePercent)}</td>
                                                <td className="py-3 text-right">{formatNumber(machine.inspections)}</td>
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
                    <p className="mt-1 text-xs font-bold text-slate-400">{formatNumber(summary.laudos)} registros analisados</p>
                </div>
                <div className="text-right">
                    <p className="text-lg font-black">{formatPercent(summary.taxaAprovacao)}</p>
                    <p className="text-xs font-bold text-slate-400">Aprovação</p>
                    <p className="text-xs font-bold text-rose-500">{formatPercent(summary.taxaReprovacao)} reprovação</p>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <SmallMetric label="Folhas rodadas" value={summary.folhasRodadas} />
                <SmallMetric label="Verificadas" value={summary.folhasVerificadas} />
                <SmallMetric label="Aprovadas" value={summary.folhasAprovadas} />
                <SmallMetric label="Em Escolha" value={summary.folhasEscolha} />
                <SmallMetric label="Reprovadas" value={summary.folhasReprovadas} />
                <SmallMetric label="Aguardando Revisão" value={summary.saldoSemRevisao} />
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
