
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { Machine, Operator, Analyst, DefectType } from '../types';
import { useToast } from '../contexts/ToastContext';

type Tab = 'machines' | 'operators' | 'analysts' | 'defects';

export default function AdminView() {
    const [activeTab, setActiveTab] = useState<Tab>('machines');

    const tabs = [
        { id: 'machines', label: 'Máquinas', icon: 'settings' },
        { id: 'operators', label: 'Operadores', icon: 'groups' },
        { id: 'analysts', label: 'Analistas', icon: 'shield_person' },
        { id: 'defects', label: 'Defeitos', icon: 'error' },
    ];

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-4 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Painel de Controle</h1>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                        Gestão centralizada • Kingraf
                    </p>
                </div>

                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as Tab)}
                            className={`flex items-center gap-2 px-4 h-9 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            <span className="material-symbols-outlined text-base">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-4">
                {activeTab === 'machines' && <MachinesManager />}
                {activeTab === 'operators' && <OperatorsManager />}
                {activeTab === 'analysts' && <AnalystsManager />}
                {activeTab === 'defects' && <DefectTypesManager />}
            </div>
        </div>
    );
}

// Reusable Table Component for Managers
function ManagerTable({
    loading,
    items,
    columns,
    onEdit,
    onToggleActive,
    onDelete,
    emptyMessage
}: {
    loading: boolean;
    items: any[];
    columns: { key: string; label: string; render?: (item: any) => React.ReactNode; className?: string }[];
    onEdit: (item: any) => void;
    onToggleActive: (id: string, current: boolean) => void;
    onDelete: (id: string) => void;
    emptyMessage: string;
}) {
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                        {columns.map(col => (
                            <th key={col.key} className={`px-6 py-4 ${col.className || ''}`}>{col.label}</th>
                        ))}
                        <th className="px-6 py-4 text-right w-32">Configuração</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loading ? (
                        <tr>
                            <td colSpan={columns.length + 1} className="px-6 py-12 text-center">
                                <div className="flex flex-col items-center gap-3">
                                    <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Sincronizando...</p>
                                </div>
                            </td>
                        </tr>
                    ) : items.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length + 1} className="px-6 py-12 text-center text-slate-400 italic text-xs">
                                {emptyMessage}
                            </td>
                        </tr>
                    ) : items.map(item => (
                        <tr key={item.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all border-l-4 border-l-transparent hover:border-l-primary">
                            {columns.map(col => (
                                <td key={col.key} className="px-6 py-3">
                                    {col.render ? col.render(item) : (
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                            {item[col.key] || '-'}
                                        </span>
                                    )}
                                </td>
                            ))}
                            <td className="px-6 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => onEdit(item)}
                                        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                        title="Editar"
                                    >
                                        <span className="material-symbols-outlined text-lg">edit</span>
                                    </button>
                                    <button
                                        onClick={() => onToggleActive(item.id, item.active)}
                                        className={`p-2 rounded-xl transition-all ${item.active ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                                        title={item.active ? 'Desativar' : 'Ativar'}
                                    >
                                        <span className="material-symbols-outlined text-xl">{item.active ? 'block' : 'check_circle'}</span>
                                    </button>
                                    <button
                                        onClick={() => onDelete(item.id)}
                                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                        title="Excluir"
                                    >
                                        <span className="material-symbols-outlined text-xl">delete</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// -----------------------------------------------------------------------------
// MACHINES
// -----------------------------------------------------------------------------

function MachinesManager() {
    const [machines, setMachines] = useState<Machine[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editing, setEditing] = useState<Partial<Machine> | null>(null);
    const { showToast } = useToast();

    const fetchMachines = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('machines').select('*').order('name');
        if (error) showToast('Erro ao carregar máquinas', 'error');
        else setMachines(data || []);
        setLoading(false);
    }, [showToast]);

    useEffect(() => { fetchMachines(); }, [fetchMachines]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing?.name || !editing?.code) {
            showToast('Nome e Código são obrigatórios', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const payload: any = { ...editing };
            delete payload.created_at; // Safety: omit system fields

            if (editing.id) {
                const { id, ...updateData } = payload;
                const { error } = await supabase.from('machines').update(updateData).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('machines').insert([payload]);
                if (error) throw error;
            }

            showToast(`Máquina ${editing.id ? 'atualizada' : 'cadastrada'} com sucesso`, 'success');
            setEditing(null);
            fetchMachines();
        } catch (error: any) {
            showToast(`Erro ao salvar: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleActive = async (id: string, current: boolean) => {
        const { error } = await supabase.from('machines').update({ active: !current }).eq('id', id);
        if (error) showToast('Erro ao atualizar status', 'error');
        else fetchMachines();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Deseja realmente excluir esta máquina? Isso pode afetar registros históricos.')) return;
        const { error } = await supabase.from('machines').delete().eq('id', id);
        if (error) showToast('Erro ao excluir: Máquina pode estar vinculada a inspeções', 'error');
        else {
            showToast('Máquina excluída', 'info');
            fetchMachines();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">precision_manufacturing</span>
                    Gestão de Máquinas
                </h2>
                <button
                    onClick={() => setEditing({ name: '', code: '', active: true })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Nova Máquina
                </button>
            </div>

            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-in">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome do Equipamento</label>
                        <input
                            required
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:font-medium"
                            value={editing.name}
                            onChange={e => setEditing({ ...editing, name: e.target.value })}
                            placeholder="Ex: Heidelberg XL 106"
                            autoFocus
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Código Identificador</label>
                        <input
                            required
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:font-medium"
                            value={editing.code}
                            onChange={e => setEditing({ ...editing, code: e.target.value })}
                            placeholder="Ex: PR-01"
                        />
                    </div>
                    <div className="flex items-end gap-3">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex-1 h-14 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                        >
                            {isSaving ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : 'Confirmar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="px-6 h-14 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
                        >
                            Voltar
                        </button>
                    </div>
                </form>
            )}

            <ManagerTable
                loading={loading}
                items={machines}
                emptyMessage="Nenhuma máquina cadastrada no sistema."
                columns={[
                    {
                        key: 'name', label: 'Equipamento', render: m => (
                            <div className="flex flex-col">
                                <span className="text-sm font-black text-slate-800 dark:text-white uppercase">{m.name}</span>
                                <span className="text-[10px] text-primary font-black tracking-widest">KINGRAF INDÚSTRIA</span>
                            </div>
                        )
                    },
                    { key: 'code', label: 'TAG/ID' },
                    {
                        key: 'active', label: 'Situação', render: m => (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${m.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                                }`}>
                                {m.active ? 'Operacional' : 'Inativo'}
                            </span>
                        )
                    }
                ]}
                onEdit={setEditing}
                onToggleActive={toggleActive}
                onDelete={handleDelete}
            />
        </div>
    );
}

// -----------------------------------------------------------------------------
// OPERATORS
// -----------------------------------------------------------------------------

function OperatorsManager() {
    const [operators, setOperators] = useState<Operator[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editing, setEditing] = useState<Partial<Operator> | null>(null);
    const { showToast } = useToast();

    const fetchOperators = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('operators').select('*').order('name');
        if (error) showToast('Erro ao carregar operadores', 'error');
        else setOperators(data || []);
        setLoading(false);
    }, [showToast]);

    useEffect(() => { fetchOperators(); }, [fetchOperators]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing?.name) return;

        setIsSaving(true);
        try {
            const payload: any = { ...editing };
            delete payload.created_at;

            if (editing.id) {
                const { id, ...updateData } = payload;
                const { error } = await supabase.from('operators').update(updateData).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('operators').insert([payload]);
                if (error) throw error;
            }

            showToast('Operador salvo', 'success');
            setEditing(null);
            fetchOperators();
        } catch (error: any) {
            showToast(`Erro: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleActive = async (id: string, current: boolean) => {
        const { error } = await supabase.from('operators').update({ active: !current }).eq('id', id);
        if (error) showToast('Erro', 'error');
        else fetchOperators();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir este operador?')) return;
        const { error } = await supabase.from('operators').delete().eq('id', id);
        if (error) showToast('Erro ao excluir (operador vinculado)', 'error');
        else fetchOperators();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">groups</span>
                    Frente de Trabalho
                </h2>
                <button
                    onClick={() => setEditing({ name: '', code: '', active: true })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Novo Operador
                </button>
            </div>

            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-in">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nome Completo</label>
                        <input
                            required
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={editing.name}
                            onChange={e => setEditing({ ...editing, name: e.target.value })}
                            placeholder="Ex: João da Silva"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">RE / Matrícula</label>
                        <input
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={editing.code}
                            onChange={e => setEditing({ ...editing, code: e.target.value })}
                            placeholder="Ex: 50123"
                        />
                    </div>
                    <div className="flex items-end gap-3">
                        <button type="submit" disabled={isSaving} className="flex-1 h-14 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600">{isSaving ? '...' : 'Salvar'}</button>
                        <button type="button" onClick={() => setEditing(null)} className="px-6 h-14 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500">Voltar</button>
                    </div>
                </form>
            )}

            <ManagerTable
                loading={loading}
                items={operators}
                emptyMessage="Nenhum operador registrado."
                columns={[
                    {
                        key: 'name', label: 'Colaborador', render: o => (
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[20px]">person</span>
                                </div>
                                <span className="text-sm font-black text-slate-700 dark:text-white uppercase">{o.name}</span>
                            </div>
                        )
                    },
                    { key: 'code', label: 'RE / Registro' },
                    {
                        key: 'active', label: 'Status', render: o => (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${o.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                                }`}>
                                {o.active ? 'Ativo' : 'Offline'}
                            </span>
                        )
                    }
                ]}
                onEdit={setEditing}
                onToggleActive={toggleActive}
                onDelete={handleDelete}
            />
        </div>
    );
}

// -----------------------------------------------------------------------------
// ANALYSTS
// -----------------------------------------------------------------------------

function AnalystsManager() {
    const [analysts, setAnalysts] = useState<Analyst[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editing, setEditing] = useState<Partial<Analyst> | null>(null);
    const { showToast } = useToast();

    const fetchAnalysts = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('analysts').select('*').order('name');
        if (error) showToast('Erro', 'error');
        else setAnalysts(data || []);
        setLoading(false);
    }, [showToast]);

    useEffect(() => { fetchAnalysts(); }, [fetchAnalysts]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing?.name) return;

        setIsSaving(true);
        try {
            const payload: any = { ...editing };
            delete payload.created_at;

            if (editing.id) {
                const { id, ...updateData } = payload;
                const { error } = await supabase.from('analysts').update(updateData).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('analysts').insert([payload]);
                if (error) throw error;
            }

            showToast('Analista salvo', 'success');
            setEditing(null);
            fetchAnalysts();
        } catch (error: any) {
            showToast('Erro ao salvar', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleActive = async (id: string, current: boolean) => {
        await supabase.from('analysts').update({ active: !current }).eq('id', id);
        fetchAnalysts();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir este analista?')) return;
        await supabase.from('analysts').delete().eq('id', id);
        fetchAnalysts();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">shield_person</span>
                    Equipe de Qualidade
                </h2>
                <button
                    onClick={() => setEditing({ name: '', email: '', active: true })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Novo Analista
                </button>
            </div>

            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-in">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nome do Analista</label>
                        <input
                            required
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={editing.name}
                            onChange={e => setEditing({ ...editing, name: e.target.value })}
                            placeholder="Ex: Beatriz Costa"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail Corporativo</label>
                        <input
                            type="email"
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={editing.email}
                            onChange={e => setEditing({ ...editing, email: e.target.value })}
                            placeholder="Ex: beatriz@kingraf.com"
                        />
                    </div>
                    <div className="flex items-end gap-3">
                        <button type="submit" disabled={isSaving} className="flex-1 h-14 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest">{isSaving ? '...' : 'Salvar'}</button>
                        <button type="button" onClick={() => setEditing(null)} className="px-6 h-14 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500">Voltar</button>
                    </div>
                </form>
            )}

            <ManagerTable
                loading={loading}
                items={analysts}
                emptyMessage="Nenhum analista registrado."
                columns={[
                    {
                        key: 'name', label: 'Especialista', render: a => (
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[20px]">verified</span>
                                </div>
                                <span className="text-sm font-black text-slate-700 dark:text-white uppercase">{a.name}</span>
                            </div>
                        )
                    },
                    { key: 'email', label: 'Contato' },
                    {
                        key: 'active', label: 'Status', render: a => (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${a.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                                }`}>
                                {a.active ? 'Ativo' : 'Inativo'}
                            </span>
                        )
                    }
                ]}
                onEdit={setEditing}
                onToggleActive={toggleActive}
                onDelete={handleDelete}
            />
        </div>
    );
}

// -----------------------------------------------------------------------------
// DEFECTS
// -----------------------------------------------------------------------------

function DefectTypesManager() {
    const [defects, setDefects] = useState<DefectType[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editing, setEditing] = useState<Partial<DefectType> | null>(null);
    const { showToast } = useToast();

    const fetchDefects = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('defect_types').select('*').order('name');
        if (error) showToast('Erro', 'error');
        else setDefects(data || []);
        setLoading(false);
    }, [showToast]);

    useEffect(() => { fetchDefects(); }, [fetchDefects]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing?.name) return;

        setIsSaving(true);
        try {
            const payload: any = { ...editing };
            delete payload.created_at;

            if (editing.id) {
                const { id, ...updateData } = payload;
                const { error } = await supabase.from('defect_types').update(updateData).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('defect_types').insert([payload]);
                if (error) throw error;
            }

            showToast('Defeito atualizado', 'success');
            setEditing(null);
            fetchDefects();
        } catch (error: any) {
            showToast('Erro ao salvar', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleActive = async (id: string, current: boolean) => {
        await supabase.from('defect_types').update({ active: !current }).eq('id', id);
        fetchDefects();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir este tipo de defeito?')) return;
        await supabase.from('defect_types').delete().eq('id', id);
        fetchDefects();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">analytics</span>
                    Matriz de Defeitos
                </h2>
                <button
                    onClick={() => setEditing({ name: '', icon: 'error', active: true })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Novo Defeito
                </button>
            </div>

            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-in">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Classificação do Defeito</label>
                        <input
                            required
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={editing.name}
                            onChange={e => setEditing({ ...editing, name: e.target.value })}
                            placeholder="Ex: Falha de Registro"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ícone (Material Symbols)</label>
                        <div className="relative">
                            <input
                                className="h-14 pl-14 pr-5 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                                value={editing.icon}
                                onChange={e => setEditing({ ...editing, icon: e.target.value })}
                                placeholder="Ex: palette"
                            />
                            <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-primary">{editing.icon || 'error'}</span>
                        </div>
                    </div>
                    <div className="flex items-end gap-3">
                        <button type="submit" disabled={isSaving} className="flex-1 h-14 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600">{isSaving ? '...' : 'Salvar'}</button>
                        <button type="button" onClick={() => setEditing(null)} className="px-6 h-14 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500">Voltar</button>
                    </div>
                </form>
            )}

            <ManagerTable
                loading={loading}
                items={defects}
                emptyMessage="Nenhuma categoria de defeito cadastrada."
                columns={[
                    {
                        key: 'name', label: 'Categoria', render: d => (
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-2xl bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center text-rose-500 shadow-sm border border-rose-100">
                                    <span className="material-symbols-outlined text-[20px]">{d.icon || 'error'}</span>
                                </div>
                                <span className="text-sm font-black text-slate-700 dark:text-white uppercase">{d.name}</span>
                            </div>
                        )
                    },
                    {
                        key: 'icon', label: 'Slug / Ícone', render: d => (
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{d.icon}</span>
                        )
                    },
                    {
                        key: 'active', label: 'Status', render: d => (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${d.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                                }`}>
                                {d.active ? 'Habilitado' : 'Suspenso'}
                            </span>
                        )
                    }
                ]}
                onEdit={setEditing}
                onToggleActive={toggleActive}
                onDelete={handleDelete}
            />
        </div>
    );
}
