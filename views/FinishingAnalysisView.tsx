
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { ProcessType, Analyst, InspectionStatus, Order, Machine, Operator } from '../types';
import { useUser } from '../contexts/UserContext';

const DEFECT_COLUMNS = [
    { key: 'manchas', label: 'Manchas', icon: 'texture' },
    { key: 'cor', label: 'Cor', icon: 'palette' },
    { key: 'rasgado', label: 'Rasgado', icon: 'block' },
    { key: 'amassado', label: 'Amassado', icon: 'unfold_less' },
    { key: 'rebarba', label: 'Rebarba', icon: 'straighten' },
    { key: 'raspado', label: 'Raspado', icon: 'gesture' },
    { key: 'corte', label: 'Corte', icon: 'content_cut' },
    { key: 'decalque', label: 'Decalque', icon: 'layers' },
    { key: 'impressao_desc', label: 'Impressão Desc.', icon: 'print_disabled' },
    { key: 'sujo', label: 'Sujo', icon: 'cleaning_services' },
    { key: 'atrito', label: 'Atrito', icon: 'scuba_diving' },
    { key: 'pinta', label: 'Pinta', icon: 'blur_on' },
    { key: 'quebra_tinta', icon: 'format_paint', label: 'Quebra Tinta' },
    { key: 'vinco', label: 'Vinco', icon: 'unfold_more' },
    { key: 'risco', label: 'Risco', icon: 'edit_off' },
    { key: 'falha_plastificacao', label: 'Falha Plast.', icon: 'layers_clear' },
    { key: 'relevo_desc', label: 'Relevo Desc.', icon: 'vitals' },
    { key: 'hs_desc_falha', label: 'HS Desc.', icon: 'stars' },
    { key: 'verniz', label: 'Verniz', icon: 'brush' },
    { key: 'codagem', label: 'Codagem', icon: 'qr_code_2' },
    { key: 'destacadeira', label: 'Destacadeira', icon: 'grid_on' },
    { key: 'gramatura', label: 'Gramatura', icon: 'monitor_weight' },
    { key: 'fundo_amassado_aberto', label: 'Fundo Amass.', icon: 'inventory_2' },
    { key: 'buraco_cartao', label: 'Buraco Cartão', icon: 'adjust' },
    { key: 'texto_fechado', label: 'Texto Fechado', icon: 'format_color_text' },
    { key: 'outros', label: 'Outros', icon: 'more_horiz' }
];

type OrderOption = Order & { fromInitialInspection?: boolean };

const DefectCounter: React.FC<{
    name: string;
    icon: string;
    count: number;
    onUpdate: (delta: number) => void;
    onSet: (val: number) => void;
}> = ({ name, icon, count, onUpdate, onSet }) => (
    <div className={`flex items-center justify-between p-2 rounded-xl border transition-all bg-white dark:bg-slate-900/50 group ${count > 0
        ? 'border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/20'
        : 'border-slate-100 dark:border-slate-800'
        }`}>
        <div className="flex items-center gap-2 overflow-hidden">
            <span className="material-symbols-outlined text-base text-primary p-1">{icon}</span>
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase truncate">{name}</span>
        </div>
        <div className="flex items-center gap-1">
            <button
                type="button"
                onClick={() => onUpdate(-1)}
                className="size-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"
            >
                <span className="material-symbols-outlined text-sm">remove</span>
            </button>
            <input
                type="number"
                value={count || ''}
                onChange={(e) => onSet(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-10 h-6 text-center font-black text-[11px] bg-slate-50 dark:bg-slate-800 rounded border-none outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="0"
            />
            <button
                type="button"
                onClick={() => onUpdate(1)}
                className="size-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 transition-colors"
            >
                <span className="material-symbols-outlined text-sm">add</span>
            </button>
        </div>
    </div>
);

export default function FinishingAnalysisView() {
    const { showToast } = useToast();
    const { profile } = useUser();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [operators, setOperators] = useState<Operator[]>([]);
    const [analysts, setAnalysts] = useState<Analyst[]>([]);
    const [orders, setOrders] = useState<OrderOption[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [orderFilter, setOrderFilter] = useState('');
    const [newOrder, setNewOrder] = useState({ op: '', cliente: '', produto: '', qtd_total: '' });
    const [selectedMachineId, setSelectedMachineId] = useState('');
    const [selectedOperatorId, setSelectedOperatorId] = useState('');

    // Filters
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Form state
    const [formData, setFormData] = useState({
        op: '',
        laudo_numero: '',
        analyst_id: '',
        status: InspectionStatus.APPROVED,
        observacoes: '',
        num_analises: 1,
        amostragem: 500,
        defects: DEFECT_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {})
    });

    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [mRes, oRes, aRes, ordRes, initialRes] = await Promise.all([
                supabase.from('machines').select('*').eq('active', true).in('area', ['produto_acabado', 'ambos']).order('name'),
                supabase.from('operators').select('*').eq('active', true).in('area', ['produto_acabado', 'ambos']).order('name'),
                supabase.from('analysts').select('*').eq('active', true).in('tipo', ['acabamento', 'ambos']).order('name'),
                supabase.from('orders').select('*').order('created_at', { ascending: false }),
                supabase.from('inspections').select('op, order_id, created_at, observations').order('created_at', { ascending: false }).limit(500)
            ]);

            if (mRes.data) {
                setMachines(mRes.data);
                if (!selectedMachineId && mRes.data.length > 0) setSelectedMachineId(mRes.data[0].id);
            }
            if (oRes.data) {
                setOperators(oRes.data);
                if (!selectedOperatorId && oRes.data.length > 0) setSelectedOperatorId(oRes.data[0].id);
            }
            if (aRes.data) setAnalysts(aRes.data);
            if (ordRes.data) {
                const merged = new Map<string, OrderOption>();
                ordRes.data.forEach((order: Order) => {
                    merged.set(order.op.toUpperCase(), { ...order });
                });

                (initialRes.data || []).forEach((inspection: any) => {
                    const op = String(inspection.op || '').trim().toUpperCase();
                    if (!op) return;

                    let processArea = '';
                    let processType = '';
                    try {
                        const observationData = JSON.parse(inspection.observations || '{}');
                        processArea = observationData?.process_area || '';
                        processType = observationData?.process_type || '';
                    } catch {
                        processArea = '';
                        processType = '';
                    }
                    const isInitialProcess = processArea === 'producao_inicial' || ['OFFSET', 'UV', 'HOT_STAMPING'].includes(processType);
                    if (!isInitialProcess) return;

                    const existing = merged.get(op);
                    if (existing) {
                        merged.set(op, { ...existing, fromInitialInspection: true });
                        return;
                    }

                    merged.set(op, {
                        id: `inspection:${op}`,
                        op,
                        cliente: '',
                        produto: '',
                        descricao: '',
                        qtd_total: 0,
                        status: 'em_producao',
                        created_at: inspection.created_at,
                        updated_at: inspection.created_at,
                        fromInitialInspection: true
                    });
                });

                setOrders(Array.from(merged.values()));
            }
        } catch (err) {
            console.error('Erro ao buscar dados:', err);
            showToast('Erro ao carregar dados', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [selectedMachineId, selectedOperatorId, showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredOrders = orders.filter(order => {
        const term = orderFilter.trim().toLowerCase();
        if (!term) return order.status === 'em_producao' || order.fromInitialInspection;
        return [order.op, order.cliente, order.produto]
            .some(value => String(value || '').toLowerCase().includes(term));
    });

    const updateNewOrder = (field: keyof typeof newOrder, value: string) => {
        setNewOrder(prev => ({ ...prev, [field]: field === 'op' ? value.toUpperCase() : value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const typedOp = newOrder.op.trim().toUpperCase();
        if ((!selectedOrderId && !typedOp) || !selectedMachineId || !selectedOperatorId || !formData.laudo_numero || !formData.analyst_id) {
            showToast('OP, Máquina, Operador, Nº do Laudo e Analista são obrigatórios', 'warning');
            return;
        }
        let selectedOrder = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase()) || null;
        let orderId = selectedOrder && !selectedOrder.fromInitialInspection ? selectedOrder.id : '';
        const selectedOp = selectedOrder?.op.trim().toUpperCase() || typedOp;

        setIsSaving(true);
        try {
            if (!orderId && selectedOp) {
                selectedOrder = orders.find(o => !o.fromInitialInspection && o.op.toUpperCase() === selectedOp) || null;

                if (!selectedOrder) {
                    const payload = {
                        op: selectedOp,
                        cliente: selectedOrder?.cliente || newOrder.cliente.trim(),
                        produto: selectedOrder?.produto || newOrder.produto.trim(),
                        qtd_total: Math.max(0, Number(newOrder.qtd_total) || 0),
                        status: 'em_producao',
                        created_by_user_id: profile?.user_id ?? null
                    };

                    const { data: created, error: createError } = await supabase
                        .from('orders')
                        .insert([payload])
                        .select()
                        .single();

                    if (createError) {
                        const { data: existing, error: findError } = await supabase
                            .from('orders')
                            .select('*')
                            .eq('op', selectedOp)
                            .single();

                        if (findError || !existing) throw createError;
                        selectedOrder = existing;
                    } else {
                        selectedOrder = created;
                    }
                }

                orderId = selectedOrder && !selectedOrder.fromInitialInspection ? selectedOrder.id : '';
            }

            if (!selectedOrder || !orderId) {
                showToast('Não foi possível identificar a OP', 'error');
                return;
            }

            const dataToSave = {
                op: selectedOrder.op,
                order_id: orderId,
                machine_id: selectedMachineId,
                operator_id: selectedOperatorId,
                analyst_id: formData.analyst_id,
                status: formData.status,
                samples_count: formData.amostragem,
                created_at: new Date().toISOString(),
                created_by_user_id: profile?.user_id ?? null,
                observations: JSON.stringify({
                    is_spreadsheet_analysis: true,
                    process_type: ProcessType.ACABAMENTO,
                    laudo_numero: formData.laudo_numero,
                    status: formData.status,
                    observacoes: formData.observacoes.trim(),
                    num_analises: formData.num_analises,
                    defects: formData.defects,
                    all_operator_ids: [selectedOperatorId],
                    all_analyst_ids: [formData.analyst_id],
                    process_area: 'produto_acabado',
                    month: months[selectedMonth],
                    year: selectedYear
                })
            };

            const { error } = await supabase.from('inspections').insert([dataToSave]);
            if (error) throw error;

            showToast('Análise salva com sucesso!', 'success');
            setSelectedOrderId('');
            setOrderFilter('');
            setNewOrder({ op: '', cliente: '', produto: '', qtd_total: '' });
            setSelectedMachineId(machines[0]?.id ?? '');
            setSelectedOperatorId(operators[0]?.id ?? '');
            setFormData({
                op: '',
                laudo_numero: '',
                analyst_id: '',
                status: InspectionStatus.APPROVED,
                observacoes: '',
                num_analises: 1,
                amostragem: 500,
                defects: DEFECT_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {})
            });
            fetchData();
        } catch (err: any) {
            showToast(`Erro ao salvar: ${err.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const updateDefect = (key: string, value: number) => {
        setFormData(prev => ({
            ...prev,
            defects: { ...prev.defects, [key]: value }
        }));
    };

    return (
        <div className="p-4 md:p-6 space-y-4 max-w-full mx-auto w-full animate-fade-in pb-32 md:pb-36">
            {/* Header Compact */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Processo de Produto Acabado</h1>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                        Análise de amostragem • {months[selectedMonth]} / {selectedYear}
                    </p>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(parseInt(e.target.value))}
                        className="h-9 px-3 rounded-lg bg-transparent border-none font-black text-[10px] uppercase outline-none cursor-pointer text-slate-600 dark:text-slate-300"
                    >
                        {months.map((m, i) => <option key={m} value={i} className="bg-white dark:bg-slate-900">{m}</option>)}
                    </select>
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(parseInt(e.target.value))}
                        className="h-9 px-3 rounded-lg bg-transparent border-none font-black text-[10px] uppercase outline-none cursor-pointer text-slate-600 dark:text-slate-300"
                    >
                        {[2024, 2025, 2026].map(y => <option key={y} value={y} className="bg-white dark:bg-slate-900">{y}</option>)}
                    </select>
                </div>
            </header>

            {/* Quick Add Form Section Compact */}
            <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <form onSubmit={handleSave} className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
                        <div className="space-y-1 lg:col-span-2">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Ordem Proc. (OP)</label>
                            <input
                                value={orderFilter}
                                onChange={e => setOrderFilter(e.target.value)}
                                className="mb-2 w-full h-9 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs focus:ring-2 focus:ring-violet-500/20 transition-all"
                                placeholder="Filtrar OP, cliente ou produto"
                            />
                            <select
                                value={selectedOrderId}
                                onChange={e => {
                                    setSelectedOrderId(e.target.value);
                                    if (e.target.value) setNewOrder({ op: '', cliente: '', produto: '', qtd_total: '' });
                                }}
                                className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm focus:ring-2 focus:ring-violet-500/20 transition-all"
                            >
                                <option value="">Selecionar OP...</option>
                                {filteredOrders.map(o => <option key={`${o.id}:${o.op}`} value={o.op}>{o.op} — {o.cliente || 'Processo inicial'} {o.status !== 'em_producao' ? `(${o.status})` : ''}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Cadastrar nova OP</label>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    value={newOrder.op}
                                    onChange={e => {
                                        setSelectedOrderId('');
                                        updateNewOrder('op', e.target.value);
                                    }}
                                    className="h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-black text-xs focus:ring-2 focus:ring-violet-500/20"
                                    placeholder="Nova OP"
                                />
                                <input
                                    value={newOrder.cliente}
                                    onChange={e => updateNewOrder('cliente', e.target.value)}
                                    className="h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs focus:ring-2 focus:ring-violet-500/20"
                                    placeholder="Cliente"
                                />
                                <input
                                    value={newOrder.produto}
                                    onChange={e => updateNewOrder('produto', e.target.value)}
                                    className="h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs focus:ring-2 focus:ring-violet-500/20"
                                    placeholder="Produto"
                                />
                                <input
                                    type="number"
                                    min={0}
                                    value={newOrder.qtd_total}
                                    onChange={e => updateNewOrder('qtd_total', e.target.value)}
                                    className="h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs focus:ring-2 focus:ring-violet-500/20"
                                    placeholder="Qtd. total"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Máquina</label>
                            <select
                                value={selectedMachineId}
                                onChange={e => setSelectedMachineId(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm focus:ring-2 focus:ring-violet-500/20 transition-all"
                            >
                                <option value="">Selecionar...</option>
                                {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Operador</label>
                            <select
                                value={selectedOperatorId}
                                onChange={e => setSelectedOperatorId(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm focus:ring-2 focus:ring-violet-500/20 transition-all"
                            >
                                <option value="">Selecionar...</option>
                                {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Nº do Laudo</label>
                            <input
                                value={formData.laudo_numero}
                                onChange={e => setFormData(p => ({ ...p, laudo_numero: e.target.value }))}
                                className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-black text-violet-600 text-sm focus:ring-2 focus:ring-violet-500/20 transition-all"
                                placeholder="00000/25"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Analista Resp.</label>
                            <select
                                value={formData.analyst_id}
                                onChange={e => setFormData(p => ({ ...p, analyst_id: e.target.value }))}
                                className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm focus:ring-2 focus:ring-violet-500/20 transition-all"
                            >
                                <option value="">Selecionar...</option>
                                {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Qtd. Análises</label>
                            <input
                                type="number"
                                value={formData.num_analises}
                                onChange={e => setFormData(p => ({ ...p, num_analises: parseInt(e.target.value) || 0 }))}
                                className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm text-center focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Amostragem</label>
                            <input
                                type="number"
                                value={formData.amostragem}
                                onChange={e => setFormData(p => ({ ...p, amostragem: parseInt(e.target.value) || 0 }))}
                                className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm text-center focus:ring-2 focus:ring-violet-500/20 transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Resultado</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    {
                                        id: InspectionStatus.APPROVED,
                                        label: 'Aprovado',
                                        icon: 'check_circle',
                                        className: formData.status === InspectionStatus.APPROVED
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10'
                                            : 'border-slate-200 text-slate-400 hover:text-emerald-600 dark:border-slate-700'
                                    },
                                    {
                                        id: InspectionStatus.REJECTED,
                                        label: 'Reprovado',
                                        icon: 'cancel',
                                        className: formData.status === InspectionStatus.REJECTED
                                            ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/10'
                                            : 'border-slate-200 text-slate-400 hover:text-rose-600 dark:border-slate-700'
                                    }
                                ].map(option => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, status: option.id }))}
                                        className={`h-11 rounded-xl border-2 px-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${option.className}`}
                                    >
                                        <span className="material-symbols-outlined text-base">{option.icon}</span>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Observação</label>
                            <textarea
                                value={formData.observacoes}
                                onChange={e => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                                className="w-full h-24 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
                                placeholder="Observações sobre o laudo, restrições ou motivo da reprovação..."
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                <span className="material-symbols-outlined text-base">emergency_home</span> Marcação de Não Conformidades
                            </h3>
                            <span className="text-[9px] font-black uppercase text-slate-300 tracking-widest">Amostragem: {formData.amostragem} unid.</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {DEFECT_COLUMNS.map(col => (
                                <DefectCounter
                                    key={col.key}
                                    name={col.label}
                                    icon={col.icon}
                                    count={(formData.defects as any)[col.key] || 0}
                                    onUpdate={(delta) => updateDefect(col.key, Math.max(0, ((formData.defects as any)[col.key] || 0) + delta))}
                                    onSet={(val) => updateDefect(col.key, val)}
                                />
                            ))}
                        </div>
                    </div>
                </form>
            </section>


            {/* --- Sticky Footer --- */}
<footer className="fixed bottom-0 left-[var(--sidebar-width)] right-0 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex justify-end items-center gap-3 z-40 px-8">
    <button
        type="button"
        onClick={() => setFormData({
            op: '',
            laudo_numero: '',
            analyst_id: '',
            status: InspectionStatus.APPROVED,
            observacoes: '',
            num_analises: 1,
            amostragem: 500,
            defects: DEFECT_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {})
        })}
        className="h-10 px-6 rounded-xl border border-slate-200 dark:border-slate-800 font-bold text-[10px] tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-slate-500 uppercase"
    >
        LIMPAR
    </button>
    <button
        type="button"
        onClick={(e) => handleSave(e as any)}
        disabled={isSaving}
        className="h-10 px-8 rounded-xl bg-violet-600 text-white font-black text-[10px] tracking-widest hover:bg-violet-700 transition-all shadow-xl shadow-violet-500/20 flex items-center justify-center gap-2 disabled:opacity-50 uppercase"
    >
        {isSaving ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span> : <span className="material-symbols-outlined text-sm">add_task</span>}
        SALVAR ANÁLISE
    </button>
</footer>
        </div>
    );
}


