import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { InspectionRecord, Order, ProcessType, InspectionStatus } from '../types';
import { useToast } from '../contexts/ToastContext';

const PROCESS_LABELS: Record<string, string> = {
    OFFSET: 'Offset',
    UV: 'UV',
    HOT_STAMPING: 'Hot Stamping',
    ESCOLHAS: 'Escolhas',
    ACABAMENTO: 'Acabamento',
};

const PROCESS_ICONS: Record<string, string> = {
    OFFSET: 'print',
    UV: 'wb_sunny',
    HOT_STAMPING: 'bolt',
    ESCOLHAS: 'fact_check',
    ACABAMENTO: 'layers',
};

const STATUS_STYLE: Record<InspectionStatus, { bg: string; text: string; border: string; icon: string }> = {
    [InspectionStatus.APPROVED]:   { bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', icon: 'check_circle' },
    [InspectionStatus.RESTRICTED]: { bg: 'bg-amber-50 dark:bg-amber-950/20',    text: 'text-amber-700 dark:text-amber-300',    border: 'border-amber-200 dark:border-amber-800',   icon: 'warning' },
    [InspectionStatus.REJECTED]:   { bg: 'bg-rose-50 dark:bg-rose-950/20',      text: 'text-rose-700 dark:text-rose-300',      border: 'border-rose-200 dark:border-rose-800',     icon: 'cancel' },
};

function fpy(inspections: InspectionRecord[]): number {
    if (!inspections.length) return 0;
    const approved = inspections.filter(i => i.status === InspectionStatus.APPROVED).length;
    return Math.round((approved / inspections.length) * 100);
}

function totalDefects(inspections: InspectionRecord[]): number {
    return inspections.reduce((sum, i) => sum + (i.totalDefects || 0), 0);
}

export default function OPTraceView() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [inspections, setInspections] = useState<InspectionRecord[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [loadingInsp, setLoadingInsp] = useState(false);
    const [search, setSearch] = useState('');
    const { showToast } = useToast();

    const fetchOrders = useCallback(async () => {
        setLoadingOrders(true);
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) showToast('Erro ao carregar OPs', 'error');
        else setOrders(data || []);
        setLoadingOrders(false);
    }, [showToast]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const selectOrder = useCallback(async (order: Order) => {
        setSelectedOrder(order);
        setLoadingInsp(true);
        // Load by order_id OR by op text (backward compat)
        const { data, error } = await supabase
            .from('inspections')
            .select('*, machines(name), operators(name), analysts(name, tipo)')
            .or(`order_id.eq.${order.id},op.eq.${order.op}`)
            .order('timestamp', { ascending: true });
        if (error) showToast('Erro ao carregar inspeções', 'error');
        else setInspections(data || []);
        setLoadingInsp(false);
    }, [showToast]);

    const filteredOrders = orders.filter(o =>
        !search ||
        o.op.toLowerCase().includes(search.toLowerCase()) ||
        o.cliente.toLowerCase().includes(search.toLowerCase()) ||
        o.produto.toLowerCase().includes(search.toLowerCase())
    );

    // Group inspections by process type
    const grouped = Object.values(ProcessType).reduce((acc, pt) => {
        acc[pt] = inspections.filter(i => i.process_type === pt);
        return acc;
    }, {} as Record<ProcessType, InspectionRecord[]>);

    const fpyGeral = fpy(inspections);
    const defectsTotal = totalDefects(inspections);

    // Pareto: aggregate defects
    const defectMap: Record<string, { name: string; count: number }> = {};
    inspections.forEach(i => {
        (i.defects || []).forEach(d => {
            if (!defectMap[d.name]) defectMap[d.name] = { name: d.name, count: 0 };
            defectMap[d.name].count += d.count;
        });
    });
    const pareto = Object.values(defectMap).sort((a, b) => b.count - a.count).slice(0, 5);

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 animate-fade-in pb-20">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5 mb-1">
                    <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                    Rastreabilidade • Kingraf
                </p>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Rastreio por OP</h1>
                <p className="text-xs text-slate-500 font-medium mt-1">Visualize toda a jornada de qualidade de uma Ordem de Produção, do início ao fim.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* LEFT — OP list */}
                <div className="lg:col-span-1 space-y-3">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar OP, cliente, produto..."
                            className="w-full h-12 pl-12 pr-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm max-h-[70vh] overflow-y-auto">
                        {loadingOrders ? (
                            <div className="p-8 text-center">
                                <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                            </div>
                        ) : filteredOrders.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-xs">Nenhuma OP encontrada</div>
                        ) : filteredOrders.map(o => (
                            <button
                                key={o.id}
                                onClick={() => selectOrder(o)}
                                className={`w-full text-left p-4 border-b border-slate-100 dark:border-slate-800 transition-all hover:bg-primary/5 ${selectedOrder?.id === o.id ? 'bg-primary/10 border-l-4 border-l-primary' : 'border-l-4 border-l-transparent'}`}
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-black text-slate-800 dark:text-white uppercase">{o.op}</p>
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${o.status === 'em_producao' ? 'bg-blue-100 text-blue-600' : o.status === 'concluido' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                        {o.status === 'em_producao' ? 'Produção' : o.status === 'concluido' ? 'Concluído' : 'Suspenso'}
                                    </span>
                                </div>
                                <p className="text-[10px] text-slate-500 font-medium mt-0.5">{o.cliente}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{o.produto}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* RIGHT — timeline */}
                <div className="lg:col-span-2 space-y-4">
                    {!selectedOrder ? (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center text-slate-400 shadow-sm">
                            <span className="material-symbols-outlined text-6xl opacity-20 block mb-3">route</span>
                            <p className="text-sm font-black uppercase tracking-widest">Selecione uma OP à esquerda</p>
                            <p className="text-xs font-medium mt-1 opacity-60">para visualizar toda sua jornada de qualidade</p>
                        </div>
                    ) : loadingInsp ? (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-16 text-center shadow-sm">
                            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                        </div>
                    ) : (
                        <>
                            {/* OP summary card */}
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{selectedOrder.cliente}</p>
                                        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase">{selectedOrder.op}</h2>
                                        <p className="text-sm text-slate-500 font-medium">{selectedOrder.produto}</p>
                                    </div>
                                    <div className="flex gap-4 flex-wrap">
                                        <div className="text-center">
                                            <p className={`text-3xl font-black ${fpyGeral >= 80 ? 'text-emerald-500' : fpyGeral >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{fpyGeral}%</p>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">FPY Geral</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-3xl font-black text-slate-800 dark:text-white">{inspections.length}</p>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inspeções</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-3xl font-black text-rose-500">{defectsTotal}</p>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Defeitos</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-3xl font-black text-slate-800 dark:text-white">{selectedOrder.qtd_total.toLocaleString('pt-BR')}</p>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Unidades</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Timeline by process */}
                            {Object.values(ProcessType).map((pt) => {
                                const ptInsp = grouped[pt];
                                if (ptInsp.length === 0) return null;
                                const ptFpy = fpy(ptInsp);
                                return (
                                    <div key={pt} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
                                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                                    <span className="material-symbols-outlined text-[20px]">{PROCESS_ICONS[pt]}</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-800 dark:text-white uppercase">{PROCESS_LABELS[pt]}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">{ptInsp.length} inspeção{ptInsp.length !== 1 ? 'ões' : ''}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-xl font-black ${ptFpy >= 80 ? 'text-emerald-500' : ptFpy >= 60 ? 'text-amber-500' : 'text-rose-500'}`}>{ptFpy}%</p>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">FPY</p>
                                            </div>
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {ptInsp.map((insp) => {
                                                const st = STATUS_STYLE[insp.status];
                                                return (
                                                    <div key={insp.id} className={`p-4 ${st.bg} border-l-4 ${st.border.replace('border-', 'border-l-')}`}>
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`material-symbols-outlined text-2xl ${st.text}`}>{st.icon}</span>
                                                                <div>
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${st.bg} ${st.text} ${st.border}`}>
                                                                            {insp.status}
                                                                        </span>
                                                                        {(insp as any).analysts?.name && (
                                                                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                                                                <span className="material-symbols-outlined text-[12px]">person</span>
                                                                                {(insp as any).analysts.name}
                                                                            </span>
                                                                        )}
                                                                        {(insp as any).machines?.name && (
                                                                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                                                                <span className="material-symbols-outlined text-[12px]">precision_manufacturing</span>
                                                                                {(insp as any).machines.name}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                                        {new Date(insp.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                        {' · '}{insp.samples_count || 0} amostras
                                                                        {insp.totalDefects > 0 && <span className="text-rose-500 font-bold"> · {insp.totalDefects} defeito{insp.totalDefects !== 1 ? 's' : ''}</span>}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {/* Defects chips */}
                                                            {insp.defects?.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {insp.defects.map(d => (
                                                                        <span key={d.id} className="text-[9px] font-black uppercase tracking-widest bg-rose-100 dark:bg-rose-950/30 text-rose-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                            <span className="material-symbols-outlined text-[10px]">{d.icon || 'error'}</span>
                                                                            {d.name}: {d.count}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {insp.observations && (
                                                            <p className="text-[11px] text-slate-500 mt-2 pl-9 italic">"{insp.observations}"</p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Pareto */}
                            {pareto.length > 0 && (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">bar_chart</span>
                                        Top Defeitos desta OP
                                    </h3>
                                    <div className="space-y-3">
                                        {pareto.map((d, i) => {
                                            const pct = defectsTotal > 0 ? Math.round((d.count / defectsTotal) * 100) : 0;
                                            return (
                                                <div key={d.name}>
                                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                                                        <span>{i + 1}. {d.name}</span>
                                                        <span className="text-rose-500">{d.count} ({pct}%)</span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-rose-400 transition-all"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {inspections.length === 0 && (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-400 shadow-sm">
                                    <span className="material-symbols-outlined text-5xl opacity-20 block mb-2">assignment</span>
                                    <p className="text-xs font-black uppercase tracking-widest">Nenhuma inspeção registrada para esta OP</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
