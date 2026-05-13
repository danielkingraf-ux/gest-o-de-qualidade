/**
 * PalletListView — Lista de inspeções de pallets
 * Acesso via /pallets — analistas e supervisores
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';

interface PalletSummary {
    id: string;
    op: string;
    pallet_number: number;
    analyst_name: string | null;
    machine_name: string | null;
    result: 'APPROVED' | 'REJECTED' | 'RESTRICTED';
    defects_critical: number;
    defects_major: number;
    defects_minor: number;
    nqa_profile_name: string | null;
    completed_at: string;
}

const RESULT_META = {
    APPROVED: { label: 'Aprovado', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    REJECTED: { label: 'Reprovado', dot: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
    RESTRICTED: { label: 'Restrição', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
} as const;

export default function PalletListView() {
    const [pallets, setPallets] = useState<PalletSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [opFilter, setOpFilter] = useState('');
    const [resultFilter, setResultFilter] = useState<string>('');

    useEffect(() => {
        const load = async () => {
            const { data } = await supabase
                .from('pallet_inspections')
                .select('id, op, pallet_number, analyst_name, machine_name, result, defects_critical, defects_major, defects_minor, nqa_profile_name, completed_at')
                .order('completed_at', { ascending: false })
                .limit(200);
            setPallets((data ?? []) as PalletSummary[]);
            setLoading(false);
        };
        load();

        // Realtime: atualiza quando novo pallet for registrado
        const sub = supabase
            .channel('pallet_list')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pallet_inspections' }, load)
            .subscribe();
        return () => { sub.unsubscribe(); };
    }, []);

    const filtered = pallets.filter(p => {
        const matchOp = !opFilter || p.op.toUpperCase().includes(opFilter.toUpperCase());
        const matchResult = !resultFilter || p.result === resultFilter;
        return matchOp && matchResult;
    });

    const counts = {
        total: pallets.length,
        approved: pallets.filter(p => p.result === 'APPROVED').length,
        rejected: pallets.filter(p => p.result === 'REJECTED').length,
        restricted: pallets.filter(p => p.result === 'RESTRICTED').length,
    };

    return (
        <div className="p-4 md:p-6 space-y-5 max-w-full animate-fade-in">
            {/* Header */}
            <header className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-500">stacks</span>
                    Inspeções de Pallets
                </h1>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                    Sub-lote 50.000 un. · NBR 5426 · Produto Acabado
                </p>
            </header>

            {/* Cards de resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total Registrados', value: counts.total, color: 'indigo', icon: 'stacks' },
                    { label: 'Aprovados', value: counts.approved, color: 'emerald', icon: 'verified' },
                    { label: 'Com Restrição', value: counts.restricted, color: 'amber', icon: 'warning' },
                    { label: 'Reprovados', value: counts.rejected, color: 'rose', icon: 'cancel' },
                ].map(item => (
                    <div key={item.label} className={`bg-${item.color}-50 dark:bg-${item.color}-950/20 border border-${item.color}-100 dark:border-${item.color}-900 rounded-2xl p-4 space-y-1`}>
                        <p className={`text-[9px] font-black uppercase tracking-widest text-${item.color}-500 flex items-center gap-1`}>
                            <span className="material-symbols-outlined text-sm">{item.icon}</span>
                            {item.label}
                        </p>
                        <p className={`text-3xl font-black text-${item.color}-700 dark:text-${item.color}-300`}>{item.value}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
                <input
                    value={opFilter}
                    onChange={e => setOpFilter(e.target.value)}
                    placeholder="Filtrar por OP..."
                    className="h-9 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm focus:ring-2 focus:ring-indigo-500/20 flex-1 max-w-xs"
                />
                <select
                    value={resultFilter}
                    onChange={e => setResultFilter(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm"
                >
                    <option value="">Todos os resultados</option>
                    <option value="APPROVED">Aprovados</option>
                    <option value="RESTRICTED">Com Restrição</option>
                    <option value="REJECTED">Reprovados</option>
                </select>
            </div>

            {/* Tabela */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <span className="material-symbols-outlined animate-spin text-3xl text-slate-400">progress_activity</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                        <span className="material-symbols-outlined text-5xl text-slate-300">inventory_2</span>
                        <p className="text-sm font-bold text-slate-400">Nenhum pallet encontrado</p>
                        <p className="text-xs text-slate-300">Os pallets aparecem aqui após a conclusão da inspeção em <strong>Produto Acabado</strong></p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    <th className="px-5 py-3">OP / Pallet</th>
                                    <th className="px-5 py-3">Resultado</th>
                                    <th className="px-5 py-3">Defeitos NQA</th>
                                    <th className="px-5 py-3">Analista</th>
                                    <th className="px-5 py-3">Perfil</th>
                                    <th className="px-5 py-3">Data</th>
                                    <th className="px-5 py-3 text-right">Auditoria</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const m = RESULT_META[p.result] ?? RESULT_META.APPROVED;
                                    return (
                                        <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-5 py-3">
                                                <p className="font-black text-sm text-slate-800 dark:text-slate-200">{p.op}</p>
                                                <p className="text-[10px] font-bold text-slate-400">Pallet #{p.pallet_number}</p>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${m.badge}`}>
                                                    <span className={`size-1.5 rounded-full ${m.dot}`} />
                                                    {m.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex gap-2 text-[10px] font-black">
                                                    <span className="text-rose-600">{p.defects_critical}c</span>
                                                    <span className="text-amber-600">{p.defects_major}M</span>
                                                    <span className="text-slate-500">{p.defects_minor}m</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                                                {p.analyst_name ?? '—'}
                                            </td>
                                            <td className="px-5 py-3 text-xs font-medium text-slate-500">
                                                {p.nqa_profile_name ?? 'Personalizado'}
                                            </td>
                                            <td className="px-5 py-3 text-xs font-medium text-slate-500">
                                                {new Date(p.completed_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <Link
                                                    to={`/pallet/${p.id}`}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-sm">qr_code_2</span>
                                                    Ver QR
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

