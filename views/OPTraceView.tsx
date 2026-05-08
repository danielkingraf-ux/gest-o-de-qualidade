import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { InspectionStatus, Order, ProcessType } from '../types';
import { useToast } from '../contexts/ToastContext';

type AreaKey = 'initial' | 'final';

type TraceInspection = {
    id: string;
    op: string;
    laudoNumero: string;
    status: InspectionStatus;
    processType: string;
    area: AreaKey;
    createdAt: string;
    samples: number;
    rework: number;
    totalDefects: number;
    defects: Array<{ name: string; count: number }>;
    machineName: string;
    operatorName: string;
    analystName: string;
    observationsText: string;
};

type TraceOrder = Order & {
    synthetic?: boolean;
    laudos?: string[];
};

const PROCESS_LABELS: Record<string, string> = {
    OFFSET: 'Offset',
    UV: 'UV',
    HOT_STAMPING: 'Hot Stamping',
    ESCOLHAS: 'Escolhas',
    ACABAMENTO: 'Acabamento',
};

const STATUS_LABELS: Record<string, string> = {
    APPROVED: 'Aprovado',
    RESTRICTED: 'Aprovado c/ restrição',
    REJECTED: 'Reprovado',
};

const STATUS_STYLE: Record<InspectionStatus, { bg: string; text: string; border: string; icon: string }> = {
    [InspectionStatus.APPROVED]: { bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', icon: 'check_circle' },
    [InspectionStatus.RESTRICTED]: { bg: 'bg-amber-50 dark:bg-amber-950/20', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', icon: 'warning' },
    [InspectionStatus.REJECTED]: { bg: 'bg-rose-50 dark:bg-rose-950/20', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', icon: 'cancel' },
};

const asNumber = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));

const parseObservations = (value: any) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const normalizeDefects = (raw: any): Array<{ name: string; count: number }> => {
    if (!raw) return [];

    if (Array.isArray(raw)) {
        return raw
            .map((item) => ({
                name: String(item?.name || item?.label || 'Outros').replace(/_/g, ' '),
                count: asNumber(item?.count ?? item?.value ?? item?.qty),
            }))
            .filter((item) => item.count > 0);
    }

    if (typeof raw === 'object') {
        const groups = ['critical', 'major', 'minor'];
        const hasGroups = groups.some((group) => raw[group] && typeof raw[group] === 'object');

        if (hasGroups) {
            return groups
                .flatMap((group) =>
                    Object.entries(raw[group] || {}).map(([name, count]) => ({
                        name: name.replace(/_/g, ' '),
                        count: asNumber(count),
                    }))
                )
                .filter((item) => item.count > 0);
        }

        return Object.entries(raw)
            .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count: asNumber(count) }))
            .filter((item) => item.count > 0);
    }

    return [];
};

const getArea = (record: any, obs: any): AreaKey => {
    if (
        record.process_type === ProcessType.ACABAMENTO ||
        obs.process_type === ProcessType.ACABAMENTO ||
        obs.process_area === 'produto_acabado' ||
        obs.is_spreadsheet_analysis === true ||
        obs.is_finishing_laudo === true
    ) {
        return 'final';
    }
    return 'initial';
};

const getObservationText = (obs: any, original?: string) => {
    if (!original) return '';
    if (!original.trim().startsWith('{')) return original;
    return obs.escolha?.observacoes || obs.observacoes || obs.restriction_reason || '';
};

const normalizeInspection = (record: any): TraceInspection => {
    const obs = parseObservations(record.observations);
    const defects = normalizeDefects(obs.defects);
    const total = asNumber(obs.totalDefects) || defects.reduce((sum, defect) => sum + defect.count, 0);
    const processType = record.process_type || obs.process_type || ProcessType.OFFSET;

    return {
        id: record.id,
        op: record.op,
        laudoNumero: String(obs.laudo_numero || ''),
        status: record.status,
        processType,
        area: getArea(record, obs),
        createdAt: record.created_at || record.timestamp,
        samples: asNumber(record.samples_count),
        rework: asNumber(record.rework_count),
        totalDefects: total,
        defects,
        machineName: record.machines?.name || 'N/A',
        operatorName: record.operators?.name || 'N/A',
        analystName: record.analysts?.name || 'N/A',
        observationsText: getObservationText(obs, record.observations),
    };
};

const fpy = (items: TraceInspection[]) => {
    if (!items.length) return 0;
    const approved = items.filter((item) => item.status === InspectionStatus.APPROVED).length;
    return Math.round((approved / items.length) * 100);
};

const sum = (items: TraceInspection[], key: 'samples' | 'rework' | 'totalDefects') =>
    items.reduce((total, item) => total + item[key], 0);

export default function OPTraceView() {
    const [orders, setOrders] = useState<TraceOrder[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<TraceOrder | null>(null);
    const [inspections, setInspections] = useState<TraceInspection[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [loadingInsp, setLoadingInsp] = useState(false);
    const [search, setSearch] = useState('');
    const { showToast } = useToast();

    const fetchOrders = useCallback(async () => {
        setLoadingOrders(true);
        const [ordersRes, inspectionsRes] = await Promise.all([
            supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false }),
            supabase
                .from('inspections')
                .select('op, order_id, created_at, observations')
                .order('created_at', { ascending: false })
                .limit(2000)
        ]);

        if (ordersRes.error || inspectionsRes.error) {
            showToast('Erro ao carregar OPs', 'error');
        } else {
            const byOp = new Map<string, TraceOrder>();
            (ordersRes.data || []).forEach((order: Order) => {
                byOp.set(String(order.op || '').toUpperCase(), { ...order, laudos: [] });
            });

            (inspectionsRes.data || []).forEach((inspection: any) => {
                const op = String(inspection.op || '').trim().toUpperCase();
                if (!op) return;

                const obs = parseObservations(inspection.observations);
                const laudo = String(obs.laudo_numero || '').trim();
                const existing = byOp.get(op);

                if (existing) {
                    if (laudo && !existing.laudos?.includes(laudo)) {
                        existing.laudos = [...(existing.laudos || []), laudo];
                    }
                    return;
                }

                byOp.set(op, {
                    id: `inspection:${op}`,
                    op,
                    cliente: '',
                    produto: '',
                    descricao: '',
                    qtd_total: 0,
                    status: 'em_producao',
                    created_at: inspection.created_at,
                    updated_at: inspection.created_at,
                    synthetic: true,
                    laudos: laudo ? [laudo] : []
                });
            });

            setOrders(Array.from(byOp.values()));
        }
        setLoadingOrders(false);
    }, [showToast]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const selectOrder = useCallback(async (order: TraceOrder) => {
        setSelectedOrder(order);
        setLoadingInsp(true);

        const query = supabase
            .from('inspections')
            .select('*, machines(name), operators(name), analysts(name, tipo)')
            .order('created_at', { ascending: true });

        const { data, error } = order.synthetic
            ? await query.eq('op', order.op)
            : await query.or(`order_id.eq.${order.id},op.eq.${order.op}`);

        if (error) {
            showToast('Erro ao carregar inspeções da OP', 'error');
            setInspections([]);
        } else {
            setInspections((data || []).map(normalizeInspection));
        }
        setLoadingInsp(false);
    }, [showToast]);

    const filteredOrders = useMemo(() => {
        const value = search.trim().toLowerCase();
        return orders.filter((order) => {
            if (!value) return true;
            return (
                String(order.op || '').toLowerCase().includes(value) ||
                String(order.cliente || '').toLowerCase().includes(value) ||
                String(order.produto || '').toLowerCase().includes(value) ||
                (order.laudos || []).some((laudo) => laudo.toLowerCase().includes(value))
            );
        });
    }, [orders, search]);

    const grouped = useMemo(() => ({
        initial: inspections.filter((item) => item.area === 'initial'),
        final: inspections.filter((item) => item.area === 'final'),
    }), [inspections]);

    const defectPareto = useMemo(() => {
        const map = new Map<string, number>();
        inspections.forEach((inspection) => {
            inspection.defects.forEach((defect) => {
                map.set(defect.name, (map.get(defect.name) || 0) + defect.count);
            });
        });

        return Array.from(map.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    }, [inspections]);

    const totals = {
        fpy: fpy(inspections),
        defects: sum(inspections, 'totalDefects'),
        samples: sum(inspections, 'samples'),
        rework: sum(inspections, 'rework'),
    };

    return (
        <div className="mx-auto max-w-7xl animate-fade-in space-y-4 p-4 pb-20 md:p-6">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Rastreabilidade por ordem de produção
                </p>
                <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Rastreio por OP</h1>
                <p className="mt-1 text-xs font-medium text-slate-500">
                    Consulte tudo que foi registrado na OP, separado entre Processo Inicial e Produto Acabado.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-3 lg:col-span-1">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-slate-400">search</span>
                        <input
                            type="text"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar OP, cliente, produto ou laudo..."
                            className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900"
                        />
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        {loadingOrders ? (
                            <div className="p-8 text-center">
                                <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                            </div>
                        ) : filteredOrders.length === 0 ? (
                            <div className="p-8 text-center text-xs text-slate-400">Nenhuma OP encontrada</div>
                        ) : filteredOrders.map((order) => (
                            <button
                                key={order.id}
                                onClick={() => selectOrder(order)}
                                className={`w-full border-b border-l-4 border-slate-100 p-4 text-left transition hover:bg-primary/5 dark:border-slate-800 ${selectedOrder?.id === order.id ? 'border-l-primary bg-primary/10' : 'border-l-transparent'}`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-black uppercase text-slate-800 dark:text-white">{order.op}</p>
                                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${order.status === 'em_producao' ? 'bg-blue-100 text-blue-600' : order.status === 'concluido' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                        {order.status === 'em_producao' ? 'Produção' : order.status === 'concluido' ? 'Concluído' : 'Suspenso'}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-4 lg:col-span-2">
                    {!selectedOrder ? (
                        <EmptyState title="Selecione uma OP à esquerda" subtitle="O histórico completo de qualidade aparecerá aqui." icon="route" />
                    ) : loadingInsp ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rastreabilidade da OP</p>
                                        <h2 className="text-2xl font-black uppercase text-slate-900 dark:text-white">{selectedOrder.op}</h2>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        <Kpi label="FPY" value={`${totals.fpy}%`} tone={totals.fpy >= 80 ? 'emerald' : totals.fpy >= 60 ? 'amber' : 'rose'} />
                                        <Kpi label="Registros" value={formatNumber(inspections.length)} />
                                        <Kpi label="Desvios" value={formatNumber(totals.defects)} tone="rose" />
                                        <Kpi label="Qtd OP" value={formatNumber(selectedOrder.qtd_total || 0)} />
                                    </div>
                                </div>
                            </div>

                            {inspections.length === 0 ? (
                                <EmptyState title="Nenhum registro para esta OP" subtitle="Quando a inspeção ou a análise de amostragem for salva, aparecerá aqui." icon="assignment" />
                            ) : (
                                <>
                                    <ProcessSection title="Processo Inicial" icon="print" inspections={grouped.initial} />
                                    <ProcessSection title="Produto Acabado" icon="inventory_2" inspections={grouped.final} />

                                    {defectPareto.length > 0 && (
                                        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                            <h3 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                <span className="material-symbols-outlined text-primary">bar_chart</span>
                                                Principais desvios desta OP
                                            </h3>
                                            <div className="space-y-3">
                                                {defectPareto.map((defect, index) => {
                                                    const pct = totals.defects > 0 ? Math.round((defect.count / totals.defects) * 100) : 0;
                                                    return (
                                                        <div key={defect.name}>
                                                            <div className="mb-1 flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                                <span>{index + 1}. {defect.name}</span>
                                                                <span className="text-rose-500">{defect.count} ({pct}%)</span>
                                                            </div>
                                                            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                                <div className="h-full rounded-full bg-rose-400" style={{ width: `${pct}%` }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Kpi({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
    const color = {
        slate: 'text-slate-900 dark:text-white',
        emerald: 'text-emerald-500',
        amber: 'text-amber-500',
        rose: 'text-rose-500',
    }[tone];

    return (
        <div className="min-w-[88px] rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-950">
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        </div>
    );
}

function ProcessSection({ title, icon, inspections }: { title: string; icon: string; inspections: TraceInspection[] }) {
    if (inspections.length === 0) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3 text-slate-400">
                    <span className="material-symbols-outlined">{icon}</span>
                    <p className="text-xs font-black uppercase tracking-widest">{title}: sem registros</p>
                </div>
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <span className="material-symbols-outlined text-[20px]">{icon}</span>
                    </div>
                    <div>
                        <p className="text-sm font-black uppercase text-slate-800 dark:text-white">{title}</p>
                        <p className="text-[10px] font-medium text-slate-400">{inspections.length} registro{inspections.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <Kpi label="FPY" value={`${fpy(inspections)}%`} tone={fpy(inspections) >= 80 ? 'emerald' : fpy(inspections) >= 60 ? 'amber' : 'rose'} />
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {inspections.map((inspection) => {
                    const style = STATUS_STYLE[inspection.status] || STATUS_STYLE[InspectionStatus.RESTRICTED];
                    return (
                        <div key={inspection.id} className={`border-l-4 p-4 ${style.bg} ${style.border.replace('border-', 'border-l-')}`}>
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                <div className="flex gap-3">
                                    <span className={`material-symbols-outlined text-2xl ${style.text}`}>{style.icon}</span>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${style.bg} ${style.text} ${style.border}`}>
                                                {STATUS_LABELS[inspection.status] || inspection.status}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-500">
                                                {PROCESS_LABELS[inspection.processType] || inspection.processType}
                                            </span>
                                            {inspection.laudoNumero && (
                                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                                                    Laudo {inspection.laudoNumero}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-[10px] font-medium text-slate-400">
                                            {new Date(inspection.createdAt).toLocaleString('pt-BR')} · {formatNumber(inspection.samples)} amostras · {formatNumber(inspection.rework)} revisão
                                        </p>
                                        <p className="mt-1 text-[10px] font-bold text-slate-500">
                                            Máquina: {inspection.machineName} · Operador: {inspection.operatorName} · Analista: {inspection.analystName}
                                        </p>
                                        {inspection.observationsText && (
                                            <p className="mt-2 text-[11px] italic text-slate-500">"{inspection.observationsText}"</p>
                                        )}
                                    </div>
                                </div>

                                <div className="sm:text-right">
                                    <p className="text-lg font-black text-rose-500">{formatNumber(inspection.totalDefects)}</p>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">desvios</p>
                                </div>
                            </div>

                            {inspection.defects.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1 pl-0 sm:pl-9">
                                    {inspection.defects.map((defect) => (
                                        <span key={`${inspection.id}-${defect.name}`} className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-600 dark:bg-rose-950/30">
                                            {defect.name}: {defect.count}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EmptyState({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-16 text-center text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="material-symbols-outlined mb-3 block text-6xl opacity-20">{icon}</span>
            <p className="text-sm font-black uppercase tracking-widest">{title}</p>
            <p className="mt-1 text-xs font-medium opacity-70">{subtitle}</p>
        </div>
    );
}
