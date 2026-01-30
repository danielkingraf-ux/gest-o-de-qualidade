
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { InspectionStatus, ProcessType, Analyst } from '../types';

const DEFECT_COLUMNS = [
    { key: 'manchas', label: 'Manchas' },
    { key: 'cor', label: 'Cor' },
    { key: 'rasgado', label: 'Rasgado' },
    { key: 'amassado', label: 'Amassado' },
    { key: 'rebarba', label: 'Rebarba' },
    { key: 'raspado', label: 'Raspado' },
    { key: 'corte', label: 'Corte' },
    { key: 'decalque', label: 'Decalque' },
    { key: 'impressao_desc', label: 'Impressão Desc.' },
    { key: 'sujo', label: 'Sujo' },
    { key: 'atrito', label: 'Atrito' },
    { key: 'pinta', label: 'Pinta' },
    { key: 'quebra_tinta', label: 'Quebra Tinta' },
    { key: 'vinco', label: 'Vinco' },
    { key: 'risco', label: 'Risco' },
    { key: 'falha_plastificacao', label: 'Falha Na Plastificação' },
    { key: 'relevo_desc', label: 'Relevo Desc.' },
    { key: 'hs_desc_falha', label: 'HS Desc./Falha' },
    { key: 'verniz', label: 'Verniz' },
    { key: 'codagem', label: 'Codagem (Aceito Torto, Que Suba)' },
    { key: 'destacadeira', label: 'Destacadeira' },
    { key: 'gramatura', label: 'Gramatura' },
    { key: 'fundo_amassado_aberto', label: 'Fundo Amassado/Aberto' },
    { key: 'buraco_cartao', label: 'Buraco no Cartão' },
    { key: 'texto_fechado', label: 'Texto Fechado' },
    { key: 'outros', label: 'Outros' }
];

export default function FinishingAnalysisView() {
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [analysts, setAnalysts] = useState<Analyst[]>([]);
    const [records, setRecords] = useState<any[]>([]);

    // Filters
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Form state
    const [formData, setFormData] = useState({
        op: '',
        laudo_numero: '',
        analyst_id: '',
        num_analises: 1,
        amostragem: 500,
        defects: DEFECT_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {}),
        status: InspectionStatus.APPROVED
    });

    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [aRes, rRes] = await Promise.all([
                supabase.from('analysts').select('*').eq('active', true).order('name'),
                supabase.from('inspections')
                    .select('*, analysts(name)')
                    .eq('process_type', ProcessType.ACABAMENTO)
                    .filter('observations', 'cs', '"is_spreadsheet_analysis":true')
                    .order('created_at', { ascending: false })
            ]);

            if (aRes.data) setAnalysts(aRes.data);

            if (rRes.data) {
                // Client-side filtering for month/year of created_at
                const filtered = rRes.data.filter(r => {
                    const date = new Date(r.created_at);
                    return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
                });
                setRecords(filtered.map(r => ({
                    ...r,
                    parsed_obs: JSON.parse(r.observations)
                })));
            }
        } catch (err) {
            console.error('Erro ao buscar dados:', err);
            showToast('Erro ao carregar dados', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [selectedMonth, selectedYear, showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.op || !formData.laudo_numero || !formData.analyst_id) {
            showToast('OP, Nº do Laudo e Analista são obrigatórios', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const dataToSave = {
                op: formData.op,
                analyst_id: formData.analyst_id,
                status: formData.status,
                samples_count: formData.amostragem,
                process_type: ProcessType.ACABAMENTO,
                created_at: new Date().toISOString(),
                observations: JSON.stringify({
                    is_spreadsheet_analysis: true,
                    laudo_numero: formData.laudo_numero,
                    num_analises: formData.num_analises,
                    defects: formData.defects,
                    month: months[selectedMonth],
                    year: selectedYear
                })
            };

            const { error } = await supabase.from('inspections').insert([dataToSave]);
            if (error) throw error;

            showToast('Análise salva com sucesso!', 'success');
            setFormData({
                op: '',
                laudo_numero: '',
                analyst_id: '',
                num_analises: 1,
                amostragem: 500,
                defects: DEFECT_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {}),
                status: InspectionStatus.APPROVED
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
        <div className="p-4 md:p-6 space-y-6">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">CEP - Análises Produto Acabado</h1>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                        <span className="size-2 rounded-full bg-violet-500 animate-pulse"></span>
                        {months[selectedMonth]} / {selectedYear}
                    </p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(parseInt(e.target.value))}
                        className="h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs outline-none"
                    >
                        {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(parseInt(e.target.value))}
                        className="h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs outline-none"
                    >
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </header>

            {/* Quick Add Form Section (Horizontal Scrollable for defects) */}
            <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <form onSubmit={handleSave} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">OP</label>
                            <input
                                value={formData.op}
                                onChange={e => setFormData(p => ({ ...p, op: e.target.value.toUpperCase() }))}
                                className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm"
                                placeholder="OP"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">Nº do Laudo</label>
                            <input
                                value={formData.laudo_numero}
                                onChange={e => setFormData(p => ({ ...p, laudo_numero: e.target.value }))}
                                className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm"
                                placeholder="00000/25"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">Analista</label>
                            <select
                                value={formData.analyst_id}
                                onChange={e => setFormData(p => ({ ...p, analyst_id: e.target.value }))}
                                className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm"
                            >
                                <option value="">Selecionar...</option>
                                {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">Nº Análises</label>
                            <input
                                type="number"
                                value={formData.num_analises}
                                onChange={e => setFormData(p => ({ ...p, num_analises: parseInt(e.target.value) || 0 }))}
                                className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">Amostragem</label>
                            <input
                                type="number"
                                value={formData.amostragem}
                                onChange={e => setFormData(p => ({ ...p, amostragem: parseInt(e.target.value) || 0 }))}
                                className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">Status</label>
                            <select
                                value={formData.status}
                                onChange={e => setFormData(p => ({ ...p, status: e.target.value as InspectionStatus }))}
                                className={`w-full h-9 px-3 rounded-lg border-none outline-none font-bold text-sm ${formData.status === InspectionStatus.APPROVED ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}
                            >
                                <option value={InspectionStatus.APPROVED}>APROVADO</option>
                                <option value={InspectionStatus.REJECTED}>REPROVADO</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 block">Marcações de Defeitos (Quantidade)</label>
                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                            <div className="flex gap-4 min-w-max">
                                {DEFECT_COLUMNS.map(col => (
                                    <div key={col.key} className="flex flex-col items-center gap-1 w-24">
                                        <span className="text-[8px] font-black uppercase text-slate-400 text-center h-8 flex items-center justify-center leading-tight">{col.label}</span>
                                        <input
                                            type="number"
                                            value={(formData.defects as any)[col.key]}
                                            onChange={e => updateDefect(col.key, parseInt(e.target.value) || 0)}
                                            className="w-16 h-8 text-center text-xs font-bold rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="h-10 px-8 rounded-xl bg-violet-600 text-white font-black text-xs hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2 disabled:opacity-50 uppercase"
                        >
                            {isSaving ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">add</span>}
                            Adicionar Análise
                        </button>
                    </div>
                </form>
            </section>

            {/* Table View */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
                                <th className="p-3 font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-700">OP</th>
                                <th className="p-3 font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-700">Laudo</th>
                                <th className="p-3 font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-700">Analista</th>
                                <th className="p-3 font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-700 whitespace-nowrap">Nº Análises</th>
                                <th className="p-3 font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-700">Amostragem</th>
                                {DEFECT_COLUMNS.map(col => (
                                    <th key={col.key} className="p-3 font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-700 text-center min-w-[80px]">{col.label}</th>
                                ))}
                                <th className="p-3 font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-700 text-center sticky right-0 bg-slate-50 dark:bg-slate-800">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={DEFECT_COLUMNS.length + 6} className="p-10 text-center text-slate-400 font-bold uppercase animate-pulse">Carregando dados...</td>
                                </tr>
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={DEFECT_COLUMNS.length + 6} className="p-10 text-center text-slate-400 font-bold uppercase">Nenhum registro para este mês.</td>
                                </tr>
                            ) : records.map(record => (
                                <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="p-3 font-bold text-slate-700 dark:text-slate-300">{record.op}</td>
                                    <td className="p-3 text-violet-600 font-black">{record.parsed_obs?.laudo_numero}</td>
                                    <td className="p-3 font-bold">{record.analysts?.name}</td>
                                    <td className="p-3 text-center">{record.parsed_obs?.num_analises}</td>
                                    <td className="p-3 text-center">{record.samples_count}</td>
                                    {DEFECT_COLUMNS.map(col => {
                                        const val = record.parsed_obs?.defects?.[col.key] || 0;
                                        return (
                                            <td key={col.key} className={`p-3 text-center font-medium ${val > 0 ? 'text-rose-500 font-black' : 'text-slate-300'}`}>
                                                {val}
                                            </td>
                                        );
                                    })}
                                    <td className="p-3 sticky right-0 bg-white dark:bg-slate-900 shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.1)]">
                                        <div className={`px-2 py-1 rounded text-[10px] font-black uppercase text-center ${record.status === InspectionStatus.APPROVED ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                            {record.status === InspectionStatus.APPROVED ? 'APROVADO' : 'REPROVADO'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
