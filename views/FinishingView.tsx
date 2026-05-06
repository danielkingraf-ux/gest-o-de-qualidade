
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { InspectionStatus, ProcessType, Machine, Operator, Analyst } from '../types';
import { useToast } from '../contexts/ToastContext';

// --- Sub-componentes ---

const DefectCounter: React.FC<{
    name: string;
    icon: string;
    count: number;
    onUpdate: (delta: number) => void;
    onSet: (val: number) => void;
    severity: 'critical' | 'major' | 'minor';
}> = ({ name, icon, count, onUpdate, onSet, severity }) => {
    const colors = {
        critical: 'text-rose-600 bg-rose-50 border-rose-100',
        major: 'text-amber-600 bg-amber-50 border-amber-100',
        minor: 'text-blue-600 bg-blue-50 border-blue-100'
    };

    return (
        <div className="flex items-center justify-between p-2 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all bg-white dark:bg-slate-900/50 group">
            <div className="flex items-center gap-2 overflow-hidden">
                <span className={`material-symbols-outlined text-base ${colors[severity]} p-1.5 rounded-lg`}>{icon}</span>
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
                    onChange={(e) => onSet(parseInt(e.target.value) || 0)}
                    className="w-10 h-6 text-center font-black text-[11px] bg-slate-50 dark:bg-slate-800 rounded border-none outline-none focus:ring-1 focus:ring-violet-500/30"
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
};

// --- Componente Principal ---

export default function FinishingView() {
    const { showToast } = useToast();
    const rowIdRef = useRef(0);
    const nextRowId = useCallback(() => `row-${rowIdRef.current++}`, []);

    type SelectRow = { rowId: string; value: string };

    const [machines, setMachines] = useState<Machine[]>([]);
    const [operators, setOperators] = useState<Operator[]>([]);
    const [analysts, setAnalysts] = useState<Analyst[]>([]);

    const [header, setHeader] = useState({
        op: '',
        machine_id: '',
        reportNumber: '',
        cliente: '',
        codigo_produto: '',
        descricao_material: '',
        desenho_tecnico: '',
        versao: '',
        num_facas: '',
        cartao: '',
        qtd_total: 0,
        qtd_analisada: 0,
    });

    const [selectedOperatorRows, setSelectedOperatorRows] = useState<SelectRow[]>(() => [{ rowId: nextRowId(), value: '' }]);
    const [selectedAnalystRows, setSelectedAnalystRows] = useState<SelectRow[]>(() => [{ rowId: nextRowId(), value: '' }]);

    const [tests, setTests] = useState({
        espessura: { a1: '', a2: '', avg: '', limit: '' },
        gramatura: { a1: '', a2: '', avg: '', limit: '' },
        comprimento: { a1: '', a2: '', avg: '', limit: '' },
        largura: { a1: '', a2: '', avg: '', limit: '' },
        altura: { a1: '', a2: '', avg: '', limit: '' },
    });

    const [defects, setDefects] = useState({
        critical: { colagem_incorreta: 0, pingo_cola: 0, rasgado_furo: 0, falta_faca: 0 },
        major: { registro: 0, vinco: 0, hot_stamping: 0, cor: 0, montagem: 0, verniz: 0 },
        minor: { manchas: 0, decalque: 0, pintas: 0, relevo: 0, hot_stamping: 0, sujeira: 0, sombra: 0 },
        observations: '',
        status: InspectionStatus.APPROVED,
        metrics: { samples: 5, rejected: 0 }
    });

    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [mRes, oRes, aRes] = await Promise.all([
                    supabase.from('machines').select('*').eq('active', true).in('area', ['produto_acabado', 'ambos']).order('name'),
                    supabase.from('operators').select('*').eq('active', true).in('area', ['produto_acabado', 'ambos']).order('name'),
                    supabase.from('analysts').select('*').eq('active', true).order('name')
                ]);
                if (mRes.data) setMachines(mRes.data);
                if (oRes.data) setOperators(oRes.data);
                if (aRes.data) setAnalysts(aRes.data);
            } catch (err) {
                console.error('Erro ao carregar dados:', err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    const resetAll = useCallback(() => {
        setHeader({
            op: '', machine_id: '', reportNumber: '', cliente: '', codigo_produto: '',
            descricao_material: '', desenho_tecnico: '', versao: '', num_facas: '', cartao: '', qtd_total: 0, qtd_analisada: 0
        });
        setTests({
            espessura: { a1: '', a2: '', avg: '', limit: '' },
            gramatura: { a1: '', a2: '', avg: '', limit: '' },
            comprimento: { a1: '', a2: '', avg: '', limit: '' },
            largura: { a1: '', a2: '', avg: '', limit: '' },
            altura: { a1: '', a2: '', avg: '', limit: '' },
        });
        setDefects({
            critical: { colagem_incorreta: 0, pingo_cola: 0, rasgado_furo: 0, falta_faca: 0 },
            major: { registro: 0, vinco: 0, hot_stamping: 0, cor: 0, montagem: 0, verniz: 0 },
            minor: { manchas: 0, decalque: 0, pintas: 0, relevo: 0, hot_stamping: 0, sujeira: 0, sombra: 0 },
            observations: '', status: InspectionStatus.APPROVED, metrics: { samples: 5, rejected: 0 }
        });
    }, []);

    const handleSave = useCallback(async (andNew: boolean) => {
        if (!header.op || !header.machine_id || !header.reportNumber) {
            showToast('OP, Máquina e Número do Laudo são obrigatórios', 'warning');
            return;
        }

        const validOperatorIds = selectedOperatorRows.map(r => r.value).filter(id => id.trim() !== '');
        const validAnalystIds = selectedAnalystRows.map(r => r.value).filter(id => id.trim() !== '');

        if (validOperatorIds.length === 0 || validAnalystIds.length === 0) {
            showToast('Selecione pelo menos um Operador e um Analista', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const dataToSave = {
                op: header.op,
                machine_id: header.machine_id,
                operator_id: validOperatorIds[0],
                analyst_id: validAnalystIds[0],
                status: defects.status,
                samples_count: defects.metrics.samples,
                rework_count: defects.metrics.rejected,
                process_type: ProcessType.ACABAMENTO,
                created_at: new Date().toISOString(),
                observations: JSON.stringify({
                    header, tests, defects, all_operator_ids: validOperatorIds,
                    all_analyst_ids: validAnalystIds, is_finishing_laudo: true,
                    laudo_numero: header.reportNumber, desenho_tecnico: header.desenho_tecnico
                })
            };

            const { error } = await supabase.from('inspections').insert([dataToSave]);
            if (error) throw error;

            showToast('Laudo salvo com sucesso!', 'success');
            if (andNew) resetAll();
        } catch (err: any) {
            showToast(`Erro ao salvar: ${err.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    }, [header, tests, defects, selectedOperatorRows, selectedAnalystRows, resetAll, showToast]);

    const updateHeader = (field: string, value: any) => setHeader(prev => ({ ...prev, [field]: value }));

    if (isLoading) return <div className="p-8 text-center animate-pulse text-slate-500">Inicializando...</div>;

    return (
        <div className="p-4 md:p-6 max-w-full mx-auto space-y-4 pb-32 md:pb-36">

            {/* Header Compact */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-950 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Laudo Técnico de Acabamento</h1>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                        Gestão de Qualidade • Kingraf
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Documento</p>
                        <p className="text-xs font-black text-violet-600">FORM 098 REV.00</p>
                    </div>
                </div>
            </div>

            {/* Inputs Grid Compact */}
            <section className="bg-white dark:bg-slate-950 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Lote / Laudo Nº</label>
                        <input value={header.reportNumber} onChange={e => updateHeader('reportNumber', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-violet-600 text-sm" placeholder="Ex: 2024-001" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Ordem de Produção (OP)</label>
                        <input value={header.op} onChange={e => updateHeader('op', e.target.value.toUpperCase())} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" placeholder="OP" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Cliente</label>
                        <input value={header.cliente} onChange={e => updateHeader('cliente', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" placeholder="Cliente" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Equipamento</label>
                        <select value={header.machine_id} onChange={e => updateHeader('machine_id', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm">
                            <option value="">Selecionar...</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Código Produto</label>
                        <input value={header.codigo_produto} onChange={e => updateHeader('codigo_produto', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" />
                    </div>
                    <div className="lg:col-span-2 space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Descrição Material</label>
                        <input value={header.descricao_material} onChange={e => updateHeader('descricao_material', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Desenho Técnico</label>
                        <input value={header.desenho_tecnico} onChange={e => updateHeader('desenho_tecnico', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold italic text-violet-600 text-sm" />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Versão / Facas</label>
                        <div className="grid grid-cols-2 gap-2">
                            <input value={header.versao} onChange={e => updateHeader('versao', e.target.value)} className="w-full h-9 px-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm text-center" placeholder="V" />
                            <input value={header.num_facas} onChange={e => updateHeader('num_facas', e.target.value)} className="w-full h-9 px-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm text-center" placeholder="F" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Tipo Cartão</label>
                        <input value={header.cartao} onChange={e => updateHeader('cartao', e.target.value)} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" />
                    </div>
                    <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Qtd Total</label>
                            <input type="number" value={header.qtd_total || ''} onChange={e => updateHeader('qtd_total', parseInt(e.target.value) || 0)} className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-sm" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-violet-500 ml-1">Qtd Analisada</label>
                            <input type="number" value={header.qtd_analisada || ''} onChange={e => updateHeader('qtd_analisada', parseInt(e.target.value) || 0)} className="w-full h-9 px-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 outline-none font-black text-sm text-center text-violet-600" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Middle Section: Tests and Defects */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Technical Tests Compact */}
                <section className="bg-white dark:bg-slate-950 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">square_foot</span> Testes Dimensionais e Físicos
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50">
                                    <th className="p-2.5 text-[9px] font-black uppercase text-slate-400">Parâmetro</th>
                                    <th className="p-2.5 text-[9px] font-black uppercase text-slate-400 text-center">A1</th>
                                    <th className="p-2.5 text-[9px] font-black uppercase text-slate-400 text-center">A2</th>
                                    <th className="p-2.5 text-[9px] font-black uppercase text-violet-500 text-center">Média</th>
                                    <th className="p-2.5 text-[9px] font-black uppercase text-slate-400 text-center">Espec.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {[
                                    { key: 'espessura', label: 'Espessura', unit: 'mm' },
                                    { key: 'gramatura', label: 'Gramatura', unit: 'g/m²' },
                                    { key: 'comprimento', label: 'Comprimento', unit: 'mm' },
                                    { key: 'largura', label: 'Largura', unit: 'mm' },
                                    { key: 'altura', label: 'Altura', unit: 'mm' },
                                ].map(test => {
                                    const tData = (tests as any)[test.key];
                                    const updateTest = (field: string, val: string) => {
                                        setTests(prev => {
                                            const next = { ...prev[test.key as keyof typeof tests], [field]: val };
                                            if (field === 'a1' || field === 'a2') {
                                                const v1 = parseFloat(next.a1);
                                                const v2 = parseFloat(next.a2);
                                                if (isNaN(v1) && isNaN(v2)) next.avg = '';
                                                else if (isNaN(v1)) next.avg = v2.toString();
                                                else if (isNaN(v2)) next.avg = v1.toString();
                                                else next.avg = ((v1 + v2) / 2).toFixed(3).replace(/\.?0+$/, '');
                                            }
                                            return { ...prev, [test.key]: next };
                                        });
                                    };
                                    return (
                                        <tr key={test.key} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-bold text-slate-700">{test.label}</span>
                                                    <span className="text-[8px] font-black text-slate-400 uppercase">{test.unit}</span>
                                                </div>
                                            </td>
                                            <td className="p-1 text-center"><input value={tData.a1} onChange={e => updateTest('a1', e.target.value)} className="w-full h-8 text-center text-xs font-bold bg-slate-50 dark:bg-slate-900 border-none rounded focus:ring-1 focus:ring-violet-500/20" /></td>
                                            <td className="p-1 text-center"><input value={tData.a2} onChange={e => updateTest('a2', e.target.value)} className="w-full h-8 text-center text-xs font-bold bg-slate-50 dark:bg-slate-900 border-none rounded focus:ring-1 focus:ring-violet-500/20" /></td>
                                            <td className="p-1 text-center bg-violet-50/30 font-black text-xs text-violet-600">{tData.avg || '-'}</td>
                                            <td className="p-1 text-center"><input value={tData.limit} onChange={e => updateTest('limit', e.target.value)} className="w-full h-8 text-center text-xs font-medium bg-white dark:bg-slate-900 border border-slate-100 rounded" /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Defects Classification Compact */}
                <section className="bg-white dark:bg-slate-950 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">inventory_2</span> Classificação de Não Conformidades
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto pr-1">
                        <div className="space-y-2">
                            <span className="text-[9px] font-black text-rose-500 flex items-center gap-1 uppercase tracking-tighter">● Críticos</span>
                            {[
                                { key: 'colagem_incorreta', label: 'Colagem Incorreta', icon: 'link' },
                                { key: 'pingo_cola', label: 'Pingo de Cola', icon: 'opacity' },
                                { key: 'rasgado_furo', label: 'Rasgado / Furo', icon: 'block' },
                                { key: 'falta_faca', label: 'Falta de Faca', icon: 'content_cut' }
                            ].map(d => (
                                <DefectCounter
                                    key={d.key} severity="critical" {...d}
                                    count={(defects.critical as any)[d.key]}
                                    onUpdate={delta => setDefects(p => ({ ...p, critical: { ...p.critical, [d.key]: Math.max(0, (p.critical as any)[d.key] + delta) } }))}
                                    onSet={val => setDefects(p => ({ ...p, critical: { ...p.critical, [d.key]: val } }))}
                                />
                            ))}
                        </div>
                        <div className="space-y-2">
                            <span className="text-[9px] font-black text-amber-500 flex items-center gap-1 uppercase tracking-tighter">● Maiores</span>
                            <div className="grid grid-cols-1 gap-1.5">
                                {[
                                    { key: 'registro', label: 'Registro/Cor', icon: 'target' },
                                    { key: 'vinco', label: 'Falha Vinco', icon: 'unfold_less' },
                                    { key: 'hot_stamping', label: 'Hot Stamp (M)', icon: 'stars' },
                                    { key: 'verniz', label: 'Falha Verniz', icon: 'brush' }
                                ].map(d => (
                                    <DefectCounter
                                        key={d.key} severity="major" {...d}
                                        count={(defects.major as any)[d.key]}
                                        onUpdate={delta => setDefects(p => ({ ...p, major: { ...p.major, [d.key]: Math.max(0, (p.major as any)[d.key] + delta) } }))}
                                        onSet={val => setDefects(p => ({ ...p, major: { ...p.major, [d.key]: val } }))}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="sm:col-span-2 space-y-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                            <span className="text-[9px] font-black text-blue-500 flex items-center gap-1 uppercase tracking-tighter">● Menores / Estéticos</span>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { key: 'manchas', label: 'Manchas', icon: 'texture' },
                                    { key: 'decalque', label: 'Decalque', icon: 'layers' },
                                    { key: 'pintas', label: 'Pintas', icon: 'grain' },
                                    { key: 'sujeira', label: 'Sujeira', icon: 'cleaning_services' }
                                ].map(d => (
                                    <DefectCounter
                                        key={d.key} severity="minor" {...d}
                                        count={(defects.minor as any)[d.key]}
                                        onUpdate={delta => setDefects(p => ({ ...p, minor: { ...p.minor, [d.key]: Math.max(0, (p.minor as any)[d.key] + delta) } }))}
                                        onSet={val => setDefects(p => ({ ...p, minor: { ...p.minor, [d.key]: val } }))}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            {/* Bottom Footer Section */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white dark:bg-slate-950 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm mb-12">
                <div className="lg:col-span-2 space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Notas Gerais do Analista</label>
                    <textarea
                        value={defects.observations}
                        onChange={e => setDefects(p => ({ ...p, observations: e.target.value }))}
                        className="w-full h-28 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none text-xs font-medium focus:ring-2 focus:ring-violet-500/10"
                        placeholder="Insira notas técnicas ou observações do lote..."
                    />
                </div>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-violet-500 ml-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">person_check</span> Analisado por:
                        </label>
                        {selectedAnalystRows.map(row => (
                            <select key={row.rowId} value={row.value} onChange={e => setSelectedAnalystRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, value: e.target.value } : r))} className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-xs">
                                <option value="">Selecionar Analista...</option>
                                {analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        ))}
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">manage_accounts</span> Responsável Máquina:
                        </label>
                        {selectedOperatorRows.map(row => (
                            <select key={row.rowId} value={row.value} onChange={e => setSelectedOperatorRows(prev => prev.map(r => r.rowId === row.rowId ? { ...r, value: e.target.value } : r))} className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 outline-none font-bold text-xs">
                                <option value="">Selecionar Operador...</option>
                                {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        ))}
                    </div>
                </div>
            </section>

            {/* Barra de Ações */}
            <div className="fixed bottom-0 left-[var(--sidebar-width)] right-0 p-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end items-center z-50 gap-3">
                <button onClick={resetAll} className="h-10 px-6 rounded-xl border border-slate-200 dark:border-slate-800 font-bold text-[10px] text-slate-500 hover:bg-slate-50 transition-all uppercase tracking-tighter">Limpar</button>
                <button
                    onClick={() => handleSave(false)}
                    disabled={isSaving}
                    className="h-10 px-8 rounded-xl bg-violet-600 text-white font-black text-[10px] hover:bg-violet-700 transition-all shadow-xl shadow-violet-500/20 flex items-center gap-2 disabled:opacity-50 uppercase tracking-tighter"
                >
                    {isSaving ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span> : <span className="material-symbols-outlined text-sm">save_as</span>}
                    Salvar Laudo
                </button>
            </div>
        </div>
    );
}

