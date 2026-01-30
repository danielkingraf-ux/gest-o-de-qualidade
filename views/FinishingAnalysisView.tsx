
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { InspectionStatus, ProcessType, Analyst } from '../types';

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
        <div className="p-4 md:p-6 space-y-4 max-w-full mx-auto w-full animate-fade-in pb-20">
            {/* Header Compact */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Análises de Produto Acabado</h1>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                        Qualidade • {months[selectedMonth]} / {selectedYear}
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
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-1">Ordem Proc. (OP)</label>
                            <input
                                value={formData.op}
                                onChange={e => setFormData(p => ({ ...p, op: e.target.value.toUpperCase() }))}
                                className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm focus:ring-2 focus:ring-violet-500/20 transition-all"
                                placeholder="00000"
                            />
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

            {/* Table View Compact */}
            <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-[10px] border-collapse min-w-[2000px]">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
                                <th className="p-4 font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 dark:border-slate-700 w-24">OP</th>
                                <th className="p-4 font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 dark:border-slate-700 w-32">Nº Laudo</th>
                                <th className="p-4 font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 dark:border-slate-700">Analista Resp.</th>
                                <th className="p-4 font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 dark:border-slate-700 text-center w-24">Qtd. Análi.</th>
                                <th className="p-4 font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 dark:border-slate-700 text-center w-24">Amostragem</th>
                                {DEFECT_COLUMNS.map(col => (
                                    <th key={col.key} className="p-4 font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 dark:border-slate-700 text-center min-w-[100px] leading-tight">{col.label}</th>
                                ))}
                                <th className="p-4 font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 text-center sticky right-0 bg-slate-100 dark:bg-slate-800 z-30 shadow-[-1px_0_0_rgba(0,0,0,0.1)] w-32 border-l border-slate-200 dark:border-slate-700">Parecer Final</th>
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
                                <tr key={record.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-all border-b border-slate-50 dark:border-slate-800/50">
                                    <td className="p-4 font-black text-slate-900 dark:text-white border-r border-slate-100/50 dark:border-slate-700/50">{record.op}</td>
                                    <td className="p-4 text-violet-600 font-black tracking-tighter border-r border-slate-100/50 dark:border-slate-700/50 bg-violet-50/20 dark:bg-violet-900/10 text-[11px]">{record.parsed_obs?.laudo_numero}</td>
                                    <td className="p-4 font-bold text-slate-600 dark:text-slate-400 border-r border-slate-100/50 dark:border-slate-700/50">{record.analysts?.name}</td>
                                    <td className="p-4 text-center font-black border-r border-slate-100/50 dark:border-slate-700/50">{record.parsed_obs?.num_analises}</td>
                                    <td className="p-4 text-center font-black border-r border-slate-100/50 dark:border-slate-700/50">{record.samples_count}</td>
                                    {DEFECT_COLUMNS.map(col => {
                                        const val = record.parsed_obs?.defects?.[col.key] || 0;
                                        return (
                                            <td key={col.key} className={`p-4 text-center border-r border-slate-100/50 dark:border-slate-700/50 transition-colors ${val > 0 ? 'bg-rose-50/50 dark:bg-rose-950/20 font-black text-rose-600' : 'text-slate-300'}`}>
                                                {val || '-'}
                                            </td>
                                        );
                                    })}
                                    <td className="p-3 sticky right-0 bg-white dark:bg-slate-950 z-30 shadow-[-4px_0_15px_-4px_rgba(0,0,0,0.1)] border-l border-slate-200 dark:border-slate-700">
                                        <div className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest uppercase text-center flex items-center justify-center gap-1.5 ${record.status === InspectionStatus.APPROVED ? 'bg-emerald-50 text-emerald-600' :
                                            record.status === InspectionStatus.RESTRICTED ? 'bg-amber-50 text-amber-600' :
                                                'bg-rose-50 text-rose-600'
                                            }`}>
                                            <span className={`size-1.5 rounded-full ${record.status === InspectionStatus.APPROVED ? 'bg-emerald-500' :
                                                record.status === InspectionStatus.RESTRICTED ? 'bg-amber-500' :
                                                    'bg-rose-500'
                                                }`}></span>
                                            {record.status === InspectionStatus.APPROVED ? 'APROVADO' :
                                                record.status === InspectionStatus.RESTRICTED ? 'RESTRITO' :
                                                    'REPROVADO'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* --- Sticky Footer --- */}
            <footer className="fixed bottom-0 left-0 md:left-64 right-0 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 z-40 px-8">
                <div className="flex items-center gap-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-200 dark:border-slate-800 pr-6 hidden lg:block">Parecer Final do Lote:</span>
                    <div className="flex items-center gap-2">
                        {[
                            { id: InspectionStatus.APPROVED, label: 'APROVADO', icon: 'check_circle', color: 'bg-emerald-500 shadow-emerald-500/20' },
                            { id: InspectionStatus.RESTRICTED, label: 'RESTRIÇÃO', icon: 'warning', color: 'bg-amber-500 shadow-amber-500/20' },
                            { id: InspectionStatus.REJECTED, label: 'REPROVADO', icon: 'cancel', color: 'bg-rose-500 shadow-rose-500/20' }
                        ].map(s => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, status: s.id as any }))}
                                className={`flex items-center gap-2 px-4 h-10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${formData.status === s.id
                                    ? `${s.color} text-white shadow-lg scale-[1.05]`
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-sm">{s.icon}</span>
                                <span>{s.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button
                        type="button"
                        onClick={() => setFormData({
                            op: '',
                            laudo_numero: '',
                            analyst_id: '',
                            num_analises: 1,
                            amostragem: 500,
                            defects: DEFECT_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {}),
                            status: InspectionStatus.APPROVED
                        })}
                        className="flex-1 md:flex-none h-10 px-6 rounded-xl border border-slate-200 dark:border-slate-800 font-bold text-[10px] tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-slate-500 uppercase"
                    >
                        LIMPAR
                    </button>
                    <button
                        type="button"
                        onClick={(e) => handleSave(e as any)}
                        disabled={isSaving}
                        className="flex-[2] md:flex-none h-10 px-8 rounded-xl bg-violet-600 text-white font-black text-[10px] tracking-widest hover:bg-violet-700 transition-all shadow-xl shadow-violet-500/20 flex items-center justify-center gap-2 disabled:opacity-50 uppercase"
                    >
                        {isSaving ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span> : <span className="material-symbols-outlined text-sm">add_task</span>}
                        SALVAR LAUDO
                    </button>
                </div>
            </footer>
        </div>
    );
}
