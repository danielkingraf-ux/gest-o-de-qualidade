import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { Order, OrderStatus } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';

const STATUS_MAP: Record<OrderStatus, { label: string; color: string; icon: string }> = {
    em_producao: { label: 'Em Produção', color: 'bg-blue-50 text-blue-600 border border-blue-100', icon: 'manufacturing' },
    concluido:   { label: 'Concluído',   color: 'bg-emerald-50 text-emerald-600 border border-emerald-100', icon: 'check_circle' },
    suspenso:    { label: 'Suspenso',    color: 'bg-amber-50 text-amber-600 border border-amber-100', icon: 'pause_circle' },
};

const EMPTY_ORDER: Partial<Order> = {
    op: '',
    cliente: '',
    produto: '',
    descricao: '',
    qtd_total: 0,
    status: 'em_producao',
};

export default function OrdersView() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Partial<Order> | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
    const { showToast } = useToast();
    const { isSupervisor } = useUser();

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) showToast('Erro ao carregar ordens', 'error');
        else setOrders(data || []);
        setLoading(false);
    }, [showToast]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing?.op || !editing?.cliente || !editing?.produto) {
            showToast('OP, Cliente e Produto são obrigatórios', 'warning');
            return;
        }
        setIsSaving(true);
        try {
            const payload: any = { ...editing };
            delete payload.created_at;
            delete payload.updated_at;

            if (editing.id) {
                const { id, ...updateData } = payload;
                const { error } = await supabase.from('orders').update(updateData).eq('id', id);
                if (error) throw error;
                showToast('Ordem atualizada com sucesso', 'success');
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                const { error } = await supabase.from('orders').insert([{ ...payload, created_by_user_id: user?.id }]);
                if (error) throw error;
                showToast('Ordem criada com sucesso', 'success');
            }
            setEditing(null);
            fetchOrders();
        } catch (err: any) {
            showToast(`Erro: ${err.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir esta ordem de produção?')) return;
        const { error } = await supabase.from('orders').delete().eq('id', id);
        if (error) showToast('Erro ao excluir (OP pode estar vinculada a inspeções)', 'error');
        else { showToast('Ordem excluída', 'info'); fetchOrders(); }
    };

    const filtered = orders.filter(o => {
        const matchSearch = !search ||
            o.op.toLowerCase().includes(search.toLowerCase()) ||
            o.cliente.toLowerCase().includes(search.toLowerCase()) ||
            o.produto.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'all' || o.status === statusFilter;
        return matchSearch && matchStatus;
    });

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 animate-fade-in pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                        Planejamento • Kingraf
                    </p>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Ordens de Produção</h1>
                    <p className="text-xs text-slate-500 font-medium">Gerencie e acompanhe todas as OPs em andamento.</p>
                </div>
                <button
                    onClick={() => setEditing({ ...EMPTY_ORDER })}
                    className="bg-primary text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 self-start"
                >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Nova Ordem
                </button>
            </div>

            {/* Form */}
            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 space-y-6 animate-slide-in">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">edit_document</span>
                        {editing.id ? 'Editar Ordem' : 'Nova Ordem de Produção'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Número da OP *</label>
                            <input
                                required
                                className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                value={editing.op ?? ''}
                                onChange={e => setEditing({ ...editing, op: e.target.value })}
                                placeholder="Ex: OP-2024-001"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Cliente *</label>
                            <input
                                required
                                className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                value={editing.cliente ?? ''}
                                onChange={e => setEditing({ ...editing, cliente: e.target.value })}
                                placeholder="Ex: Empresa ABC"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Produto *</label>
                            <input
                                required
                                className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                value={editing.produto ?? ''}
                                onChange={e => setEditing({ ...editing, produto: e.target.value })}
                                placeholder="Ex: Caixa Produto X"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Qtd. Total (unid.)</label>
                            <input
                                type="number"
                                min={0}
                                className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                value={editing.qtd_total ?? 0}
                                onChange={e => setEditing({ ...editing, qtd_total: Number(e.target.value) })}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Status</label>
                            <select
                                className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                value={editing.status ?? 'em_producao'}
                                onChange={e => setEditing({ ...editing, status: e.target.value as OrderStatus })}
                            >
                                <option value="em_producao">Em Produção</option>
                                <option value="concluido">Concluído</option>
                                <option value="suspenso">Suspenso</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrição (opcional)</label>
                            <input
                                className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
                                value={editing.descricao ?? ''}
                                onChange={e => setEditing({ ...editing, descricao: e.target.value })}
                                placeholder="Ex: 4 cores frente e verso"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <button type="button" onClick={() => setEditing(null)}
                            className="px-8 h-12 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
                            Cancelar
                        </button>
                        <button type="submit" disabled={isSaving}
                            className="px-10 h-12 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                            {isSaving ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">save</span>}
                            {editing.id ? 'Atualizar' : 'Criar Ordem'}
                        </button>
                    </div>
                </form>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por OP, cliente ou produto..."
                        className="w-full h-12 pl-12 pr-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <div className="flex gap-2">
                    {(['all', 'em_producao', 'concluido', 'suspenso'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-4 h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'}`}
                        >
                            {s === 'all' ? 'Todas' : STATUS_MAP[s].label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
                {(['em_producao', 'concluido', 'suspenso'] as OrderStatus[]).map(s => {
                    const count = orders.filter(o => o.status === s).length;
                    const st = STATUS_MAP[s];
                    return (
                        <div key={s} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 shadow-sm">
                            <span className={`material-symbols-outlined text-2xl ${s === 'em_producao' ? 'text-blue-500' : s === 'concluido' ? 'text-emerald-500' : 'text-amber-500'}`}>{st.icon}</span>
                            <div>
                                <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">{count}</p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{st.label}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <tr>
                            <th className="px-6 py-4">Ordem de Produção</th>
                            <th className="px-6 py-4">Cliente / Produto</th>
                            <th className="px-6 py-4">Quantidade</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Criado em</th>
                            <th className="px-6 py-4 text-right w-32">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-16 text-center">
                                <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                            </td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                                <span className="material-symbols-outlined text-5xl opacity-20 block mb-2">inventory_2</span>
                                <p className="text-xs font-black uppercase tracking-widest">Nenhuma ordem encontrada</p>
                            </td></tr>
                        ) : filtered.map(o => {
                            const st = STATUS_MAP[o.status];
                            return (
                                <tr key={o.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all border-l-4 border-l-transparent hover:border-l-primary">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                                <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">{o.op}</p>
                                                {o.descricao && <p className="text-[10px] text-slate-400 font-medium">{o.descricao}</p>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{o.cliente}</p>
                                        <p className="text-[10px] text-slate-400 font-medium">{o.produto}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                                            {o.qtd_total.toLocaleString('pt-BR')}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium ml-1">un.</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${st.color}`}>
                                            {st.label}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-medium text-slate-500">
                                            {new Date(o.created_at).toLocaleDateString('pt-BR')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setEditing(o)}
                                                className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                title="Editar"
                                            >
                                                <span className="material-symbols-outlined text-lg">edit</span>
                                            </button>
                                            {isSupervisor && (
                                                <button
                                                    onClick={() => handleDelete(o.id)}
                                                    className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                                    title="Excluir"
                                                >
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
