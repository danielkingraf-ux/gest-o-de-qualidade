
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { Machine, Operator, Analyst, DefectType, UserProfile, UserRole, ProductionArea } from '../types';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import { AQL_OPTIONS, INSPECTION_LEVELS } from '../utils/nbr5426';
import { ROLE_OPTIONS, getRoleLabel, normalizeRole } from '../utils/permissions';

type Tab = 'machines' | 'operators' | 'analysts' | 'defects' | 'users' | 'nqa';

const AREA_OPTIONS: Array<{ value: ProductionArea; label: string }> = [
    { value: 'producao_inicial', label: 'Produção inicial' },
    { value: 'produto_acabado', label: 'Produto acabado' },
    { value: 'ambos', label: 'Ambos' },
];

const AREA_BADGES: Record<ProductionArea, { label: string; className: string }> = {
    producao_inicial: { label: 'Produção inicial', className: 'bg-blue-50 text-blue-600 border border-blue-100' },
    produto_acabado: { label: 'Produto acabado', className: 'bg-violet-50 text-violet-600 border border-violet-100' },
    ambos: { label: 'Ambos', className: 'bg-amber-50 text-amber-600 border border-amber-100' },
};

function AreaBadge({ area }: { area?: ProductionArea }) {
    const badge = AREA_BADGES[area ?? 'producao_inicial'] ?? AREA_BADGES.producao_inicial;
    return <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${badge.className}`}>{badge.label}</span>;
}

export default function AdminView() {
    const [activeTab, setActiveTab] = useState<Tab>('machines');

    const tabs = [
        { id: 'machines', label: 'Máquinas', icon: 'settings' },
        { id: 'operators', label: 'Operadores', icon: 'groups' },
        { id: 'analysts', label: 'Analistas', icon: 'shield_person' },
        { id: 'defects', label: 'Defeitos', icon: 'error' },
        { id: 'users', label: 'Usuários', icon: 'manage_accounts' },
        { id: 'nqa', label: 'NQA', icon: 'fact_check' },
    ];

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                        Painel de Controle • Kingraf
                    </p>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none tracking-tighter">Administração</h1>
                    <p className="text-xs text-slate-500 font-medium">Gestão centralizada de ativos e equipes.</p>
                </div>

                <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800/50">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as Tab)}
                            className={`flex items-center gap-2 px-5 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.05]'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-2">
                {activeTab === 'machines' && <MachinesManager />}
                {activeTab === 'operators' && <OperatorsManager />}
                {activeTab === 'analysts' && <AnalystsManager />}
                {activeTab === 'defects' && <DefectTypesManager />}
                {activeTab === 'users' && <UsersManager />}
                {activeTab === 'nqa' && <NqaProfilesManager />}
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
                                        aria-label="Editar"
                                        data-tooltip="Editar"
                                    >
                                        <span className="material-symbols-outlined text-lg">edit</span>
                                    </button>
                                    <button
                                        onClick={() => onToggleActive(item.id, item.active)}
                                        className={`p-2 rounded-xl transition-all ${item.active ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                                        aria-label={item.active ? 'Desativar' : 'Ativar'}
                                        data-tooltip={item.active ? 'Desativar' : 'Ativar'}
                                    >
                                        <span className="material-symbols-outlined text-xl">{item.active ? 'block' : 'check_circle'}</span>
                                    </button>
                                    <button
                                        onClick={() => onDelete(item.id)}
                                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                        aria-label="Excluir"
                                        data-tooltip="Excluir"
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
                    onClick={() => setEditing({ name: '', code: '', area: 'producao_inicial', active: true })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Nova Máquina
                </button>
            </div>

            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-6 animate-slide-in">
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
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Área de uso</label>
                        <select
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            value={editing.area ?? 'producao_inicial'}
                            onChange={e => setEditing({ ...editing, area: e.target.value as ProductionArea })}
                        >
                            {AREA_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
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
                    { key: 'area', label: 'Área', render: m => <AreaBadge area={m.area} /> },
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
                    onClick={() => setEditing({ name: '', code: '', area: 'producao_inicial', active: true })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Novo Operador
                </button>
            </div>

            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-6 animate-slide-in">
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
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Área de atuação</label>
                        <select
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={editing.area ?? 'producao_inicial'}
                            onChange={e => setEditing({ ...editing, area: e.target.value as ProductionArea })}
                        >
                            {AREA_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
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
                    { key: 'area', label: 'Área', render: o => <AreaBadge area={o.area} /> },
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
            console.error('[AnalystsManager] erro ao salvar:', error);
            showToast(`Erro ao salvar: ${error?.message ?? 'Erro desconhecido'}`, 'error');
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
                    onClick={() => setEditing({ name: '', email: '', tipo: 'impressao', active: true })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Novo Analista
                </button>
            </div>

            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-in">
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
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Área de Atuação</label>
                        <select
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={editing.tipo ?? 'impressao'}
                            onChange={e => setEditing({ ...editing, tipo: e.target.value as any })}
                        >
                            <option value="impressao">Impressão</option>
                            <option value="acabamento">Acabamento</option>
                            <option value="ambos">Ambos</option>
                        </select>
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
                        key: 'tipo', label: 'Área', render: a => {
                            const map: Record<string, { label: string; color: string }> = {
                                impressao: { label: 'Impressão', color: 'bg-blue-50 text-blue-600 border border-blue-100' },
                                acabamento: { label: 'Acabamento', color: 'bg-purple-50 text-purple-600 border border-purple-100' },
                                ambos: { label: 'Ambos', color: 'bg-amber-50 text-amber-600 border border-amber-100' },
                            };
                            const t = map[a.tipo] ?? map['impressao'];
                            return <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${t.color}`}>{t.label}</span>;
                        }
                    },
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

// -----------------------------------------------------------------------------
// USERS (perfis de acesso ao sistema)
// -----------------------------------------------------------------------------

function UsersManager() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Partial<UserProfile> & { email?: string; password?: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { showToast } = useToast();
    const { refreshProfile } = useUser();
    const roleMeta: Record<string, { avatarClass: string; badgeClass: string }> = {
        administrador: {
            avatarClass: 'bg-amber-500',
            badgeClass: 'bg-amber-50 text-amber-600 border border-amber-100',
        },
        direcao: {
            avatarClass: 'bg-indigo-500',
            badgeClass: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
        },
        supervisao: {
            avatarClass: 'bg-emerald-500',
            badgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
        },
        analista_qualidade: {
            avatarClass: 'bg-primary',
            badgeClass: 'bg-blue-50 text-blue-600 border border-blue-100',
        },
        revisao_escolha: {
            avatarClass: 'bg-violet-500',
            badgeClass: 'bg-violet-50 text-violet-600 border border-violet-100',
        },
        expedicao: {
            avatarClass: 'bg-cyan-500',
            badgeClass: 'bg-cyan-50 text-cyan-600 border border-cyan-100',
        },
        consulta_auditoria: {
            avatarClass: 'bg-slate-500',
            badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
        },
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .order('name');
        if (error) showToast('Erro ao carregar usuários', 'error');
        else setUsers(data || []);
        setLoading(false);
    }, [showToast]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing?.name || !editing?.role) return;
        setIsSaving(true);
        try {
            if (editing.id) {
                const { error } = await supabase
                    .from('user_profiles')
                    .update({
                        name: editing.name,
                        role: editing.role,
                        active: editing.active,
                        can_approve_critical_actions: editing.can_approve_critical_actions === true,
                    })
                    .eq('id', editing.id);
                if (error) throw error;
                showToast('Usuário atualizado', 'success');
            } else {
                if (!editing.email) {
                    showToast('Email é obrigatório', 'warning');
                    setIsSaving(false);
                    return;
                }
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(
                    'https://juatgymcjvnofllfennk.supabase.co/functions/v1/create-user',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session?.access_token}`,
                        },
                        body: JSON.stringify({
                            email: editing.email,
                            name: editing.name,
                            role: editing.role,
                            password: editing.password,
                            can_approve_critical_actions: editing.can_approve_critical_actions === true,
                        }),
                    }
                );
                const result = await res.json();
                if (!res.ok) {
                    throw new Error(result.error || 'Erro ao criar usuário');
                }
                showToast('Usuário criado. Email de confirmação enviado.', 'success');
            }
            setEditing(null);
            fetchUsers();
            refreshProfile();
        } catch (err: any) {
            showToast(`Erro: ${err.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleActive = async (id: string, current: boolean) => {
        const { error } = await supabase
            .from('user_profiles')
            .update({ active: !current })
            .eq('id', id);
        if (error) showToast('Erro ao atualizar', 'error');
        else fetchUsers();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">manage_accounts</span>
                    Controle de Acesso
                </h2>
                <button
                    onClick={() => setEditing({ name: '', email: '', role: 'analista_qualidade' as UserRole, active: true, can_approve_critical_actions: false })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Novo Usuário
                </button>
            </div>

            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-6 animate-slide-in">
                    {!editing.id && (
                        <>
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
                                <input
                                    required
                                    type="email"
                                    className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                                    value={editing.email ?? ''}
                                    onChange={e => setEditing({ ...editing, email: e.target.value })}
                                    placeholder="Ex: joao@kingraf.com.br"
                                    autoFocus
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Senha Inicial</label>
                                <input
                                    required
                                    type="text"
                                    className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                                    value={editing.password ?? ''}
                                    onChange={e => setEditing({ ...editing, password: e.target.value })}
                                    placeholder="Ex: Kingraf@2026"
                                />
                            </div>
                        </>
                    )}
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nome de Exibição</label>
                        <input
                            required
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={editing.name ?? ''}
                            onChange={e => setEditing({ ...editing, name: e.target.value })}
                            placeholder="Ex: Maria Souza"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nível de Acesso</label>
                        <select
                            className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none"
                            value={normalizeRole(editing.role)}
                            onChange={e => {
                                const nextRole = e.target.value as UserRole;
                                setEditing({
                                    ...editing,
                                    role: nextRole,
                                    can_approve_critical_actions: normalizeRole(nextRole) === 'supervisao'
                                        ? editing.can_approve_critical_actions === true
                                        : false,
                                });
                            }}
                        >
                            {ROLE_OPTIONS.map(role => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={editing.can_approve_critical_actions === true}
                            onChange={e => setEditing({ ...editing, can_approve_critical_actions: e.target.checked })}
                            disabled={normalizeRole(editing.role) !== 'supervisao'}
                        />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Pode aprovar decisões críticas
                        </span>
                    </label>
                    <div className="flex items-end gap-3">
                        <button type="submit" disabled={isSaving}
                            className="flex-1 h-14 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600">
                            {isSaving ? '...' : 'Confirmar'}
                        </button>
                        <button type="button" onClick={() => setEditing(null)}
                            className="px-6 h-14 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500">
                            Voltar
                        </button>
                    </div>
                </form>
            )}

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <tr>
                            <th className="px-6 py-4">Usuário</th>
                            <th className="px-6 py-4">Nível</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right w-32">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr><td colSpan={4} className="px-6 py-12 text-center">
                                <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                            </td></tr>
                        ) : users.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-xs italic">
                                Nenhum usuário cadastrado. Usuários aparecem aqui após o primeiro login.
                            </td></tr>
                        ) : users.map(u => {
                            const normalized = normalizeRole(u.role);
                            const meta = roleMeta[normalized] ?? roleMeta.consulta_auditoria;
                            return (
                            <tr key={u.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`size-10 rounded-full flex items-center justify-center text-white text-sm font-black ${meta.avatarClass}`}>
                                            {u.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-sm font-black text-slate-700 dark:text-white uppercase">{u.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <div className="flex flex-wrap gap-2">
                                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${meta.badgeClass}`}>
                                            {getRoleLabel(u.role)}
                                        </span>
                                        {u.can_approve_critical_actions && (
                                            <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">
                                                Aprovador crítico
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${u.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'}`}>
                                        {u.active ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setEditing({ ...u, role: normalizeRole(u.role) as UserRole })} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all" aria-label="Editar nível" data-tooltip="Editar nível">
                                            <span className="material-symbols-outlined text-lg">edit</span>
                                        </button>
                                        <button onClick={() => toggleActive(u.id, u.active)}
                                            className={`p-2 rounded-xl transition-all ${u.active ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                                            aria-label={u.active ? 'Desativar acesso' : 'Ativar acesso'}
                                            data-tooltip={u.active ? 'Desativar acesso' : 'Ativar acesso'}>
                                            <span className="material-symbols-outlined text-xl">{u.active ? 'block' : 'check_circle'}</span>
                                        </button>
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

// -----------------------------------------------------------------------------
// NQA PROFILES (Perfis de amostragem NBR 5426)
// -----------------------------------------------------------------------------

type NqaProfile = {
    id: string;
    name: string;
    description: string;
    aql_critical: string;
    aql_major: string;
    aql_minor: string;
    inspection_level: string;
    active: boolean;
    created_at?: string;
    updated_at?: string;
};

const EMPTY_NQA: Partial<NqaProfile> = {
    name: '',
    description: '',
    aql_critical: '0.065',
    aql_major: '1.0',
    aql_minor: '4.0',
    inspection_level: 'II',
    active: true,
};

function NqaProfilesManager() {
    const [profiles, setProfiles] = useState<NqaProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editing, setEditing] = useState<Partial<NqaProfile> | null>(null);
    const { showToast } = useToast();

    const fetchProfiles = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('nqa_profiles')
            .select('*')
            .order('name');
        if (error) showToast('Erro ao carregar perfis NQA', 'error');
        else setProfiles(data || []);
        setLoading(false);
    }, [showToast]);

    useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing?.name) {
            showToast('Nome do perfil é obrigatório', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const payload: any = { ...editing };
            delete payload.created_at;
            delete payload.updated_at;

            if (editing.id) {
                const { id, ...updateData } = payload;
                const { error } = await supabase.from('nqa_profiles').update(updateData).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('nqa_profiles').insert([payload]);
                if (error) throw error;
            }

            showToast(`Perfil NQA ${editing.id ? 'atualizado' : 'cadastrado'} com sucesso`, 'success');
            setEditing(null);
            fetchProfiles();
        } catch (error: any) {
            showToast(`Erro ao salvar: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleActive = async (id: string, current: boolean) => {
        const { error } = await supabase.from('nqa_profiles').update({ active: !current }).eq('id', id);
        if (error) showToast('Erro ao atualizar status', 'error');
        else fetchProfiles();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Excluir este perfil NQA? Laudos já registrados com este perfil não serão afetados.')) return;
        const { error } = await supabase.from('nqa_profiles').delete().eq('id', id);
        if (error) showToast('Erro ao excluir perfil', 'error');
        else {
            showToast('Perfil excluído', 'info');
            fetchProfiles();
        }
    };

    const aqlBadgeColor = (val: string) => {
        const n = parseFloat(val);
        if (n <= 0.10) return 'bg-rose-50 text-rose-600 border border-rose-100';
        if (n <= 1.0) return 'bg-amber-50 text-amber-600 border border-amber-100';
        return 'bg-blue-50 text-blue-600 border border-blue-100';
    };

    return (
        <div className="space-y-6">
            {/* Cabeçalho + botão novo */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">fact_check</span>
                        Perfis de Amostragem NQA
                    </h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5 ml-8">NBR 5426 / ISO 2859-1 — Inspeção Normal, Plano Simples</p>
                </div>
                <button
                    onClick={() => setEditing({ ...EMPTY_NQA })}
                    className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                    <span className="material-symbols-outlined text-sm">add</span> Novo Perfil
                </button>
            </div>

            {/* Formulário de edição/criação */}
            {editing && (
                <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 space-y-6 animate-slide-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome do Perfil *</label>
                            <input
                                required
                                className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                value={editing.name ?? ''}
                                onChange={e => setEditing({ ...editing, name: e.target.value })}
                                placeholder="Ex: Padrão Geral, Farmacêutico..."
                                autoFocus
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrição</label>
                            <input
                                className="h-14 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                value={editing.description ?? ''}
                                onChange={e => setEditing({ ...editing, description: e.target.value })}
                                placeholder="Ex: Alta exigência para embalagens farmacêuticas"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                <span className="inline-block size-2 rounded-full bg-rose-500 mr-1.5 align-middle"></span>
                                AQL Crítico
                            </label>
                            <select
                                className="h-14 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                value={editing.aql_critical ?? '0.065'}
                                onChange={e => setEditing({ ...editing, aql_critical: e.target.value })}
                            >
                                {AQL_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                <span className="inline-block size-2 rounded-full bg-amber-500 mr-1.5 align-middle"></span>
                                AQL Maior
                            </label>
                            <select
                                className="h-14 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                value={editing.aql_major ?? '1.0'}
                                onChange={e => setEditing({ ...editing, aql_major: e.target.value })}
                            >
                                {AQL_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                <span className="inline-block size-2 rounded-full bg-blue-500 mr-1.5 align-middle"></span>
                                AQL Menor
                            </label>
                            <select
                                className="h-14 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                value={editing.aql_minor ?? '4.0'}
                                onChange={e => setEditing({ ...editing, aql_minor: e.target.value })}
                            >
                                {AQL_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nível de Inspeção</label>
                            <select
                                className="h-14 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                value={editing.inspection_level ?? 'II'}
                                onChange={e => setEditing({ ...editing, inspection_level: e.target.value })}
                            >
                                {INSPECTION_LEVELS.map(l => <option key={l} value={l}>Nível {l}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Aviso sobre hierarquia de AQL */}
                    {editing.aql_critical && editing.aql_major && editing.aql_minor &&
                        parseFloat(editing.aql_critical) >= parseFloat(editing.aql_major) && (
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-amber-700 text-xs font-bold">
                                <span className="material-symbols-outlined text-base">warning</span>
                                AQL Crítico deve ser menor que AQL Maior. Verifique os valores.
                            </div>
                        )
                    }

                    <div className="flex gap-3 justify-end">
                        <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="px-8 h-12 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-10 h-12 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                        >
                            {isSaving
                                ? <><span className="material-symbols-outlined animate-spin text-base">progress_activity</span> Salvando...</>
                                : <><span className="material-symbols-outlined text-base">check</span> {editing.id ? 'Atualizar' : 'Cadastrar'}</>
                            }
                        </button>
                    </div>
                </form>
            )}

            {/* Tabela de perfis */}
            <ManagerTable
                loading={loading}
                items={profiles}
                emptyMessage="Nenhum perfil NQA cadastrado. Clique em 'Novo Perfil' para começar."
                columns={[
                    {
                        key: 'name', label: 'Perfil', render: (p: NqaProfile) => (
                            <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-black text-slate-800 dark:text-white uppercase">{p.name}</span>
                                {p.description && <span className="text-[10px] text-slate-400 font-medium">{p.description}</span>}
                            </div>
                        )
                    },
                    {
                        key: 'aql_critical', label: 'AQL Crítico', render: (p: NqaProfile) => (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${aqlBadgeColor(p.aql_critical)}`}>
                                {p.aql_critical}
                            </span>
                        )
                    },
                    {
                        key: 'aql_major', label: 'AQL Maior', render: (p: NqaProfile) => (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${aqlBadgeColor(p.aql_major)}`}>
                                {p.aql_major}
                            </span>
                        )
                    },
                    {
                        key: 'aql_minor', label: 'AQL Menor', render: (p: NqaProfile) => (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${aqlBadgeColor(p.aql_minor)}`}>
                                {p.aql_minor}
                            </span>
                        )
                    },
                    {
                        key: 'inspection_level', label: 'Nível', render: (p: NqaProfile) => (
                            <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200">
                                Nível {p.inspection_level}
                            </span>
                        )
                    },
                    {
                        key: 'active', label: 'Status', render: (p: NqaProfile) => (
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${p.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'}`}>
                                {p.active ? 'Ativo' : 'Inativo'}
                            </span>
                        )
                    },
                ]}
                onEdit={setEditing}
                onToggleActive={toggleActive}
                onDelete={handleDelete}
            />

            {/* Legenda de AQL */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Referência de AQL — NBR 5426</p>
                <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500">
                    <span><span className="font-black text-rose-600">Crítico</span> — Defeitos que inviabilizam o uso do produto (ex: impressão invertida, falha de corte)</span>
                    <span><span className="font-black text-amber-600">Maior</span> — Defeitos que comprometem função ou aparência relevante</span>
                    <span><span className="font-black text-blue-600">Menor</span> — Defeitos cosméticos que não afetam a função</span>
                </div>
            </div>
        </div>
    );
}
