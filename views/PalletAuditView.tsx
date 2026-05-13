/**
 * PalletAuditView — Auditoria de Pallet via QR Code
 * Aberto por supervisor ao escanear o QR gerado após inspeção.
 * Acessível via /#/pallet/:id  (requer login)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../services/supabase';

interface PalletInspection {
    id: string;
    op: string;
    pallet_number: number;
    analyst_name: string | null;
    machine_name: string | null;
    units_per_box: number;
    boxes_per_pallet: number;
    total_boxes_sublote: number;
    boxes_to_inspect: number;
    boxes_list: number[];
    sample_size: number;
    nqa_profile_name: string | null;
    aql_critical: string;
    aql_major: string;
    aql_minor: string;
    inspection_level: string;
    defects_critical: number;
    defects_major: number;
    defects_minor: number;
    defects_detail: Record<string, number>;
    result: 'APPROVED' | 'REJECTED' | 'RESTRICTED';
    observations: string | null;
    completed_at: string;
}

const DEFECT_LABELS: Record<string, string> = {
    manchas: 'Manchas', cor: 'Cor', rasgado: 'Rasgado', amassado: 'Amassado',
    rebarba: 'Rebarba', raspado: 'Raspado', corte: 'Corte', decalque: 'Decalque',
    impressao_desc: 'Impressão Desc.', sujo: 'Sujo', atrito: 'Atrito', pinta: 'Pinta',
    quebra_tinta: 'Quebra Tinta', vinco: 'Vinco', risco: 'Risco',
    falha_plastificacao: 'Falha Plast.', relevo_desc: 'Relevo Desc.',
    hs_desc_falha: 'HS Desc.', verniz: 'Verniz', codagem: 'Codagem',
    destacadeira: 'Destacadeira', gramatura: 'Gramatura',
    fundo_amassado_aberto: 'Fundo Amass.', buraco_cartao: 'Buraco Cartão',
    texto_fechado: 'Texto Fechado', outros: 'Outros',
};

export default function PalletAuditView() {
    const { id } = useParams<{ id: string }>();
    const [pallet, setPallet] = useState<PalletInspection | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const palletUrl = `${window.location.origin}${window.location.pathname}#/pallet/${id}`;

    useEffect(() => {
        if (!id) { setNotFound(true); setLoading(false); return; }
        const load = async () => {
            const { data, error } = await supabase
                .from('pallet_inspections')
                .select('*')
                .eq('id', id)
                .single();
            if (error || !data) { setNotFound(true); }
            else { setPallet(data as PalletInspection); }
            setLoading(false);
        };
        load();
    }, [id]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-4xl text-slate-400">progress_activity</span>
            </div>
        );
    }

    if (notFound || !pallet) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
                <span className="material-symbols-outlined text-6xl text-slate-300">search_off</span>
                <h2 className="text-xl font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">Pallet não encontrado</h2>
                <p className="text-sm text-slate-400">O registro deste pallet não existe ou foi removido.</p>
                <Link to="/finishing-analysis" className="mt-2 px-6 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all">
                    Voltar
                </Link>
            </div>
        );
    }

    const resultMeta = {
        APPROVED: { label: 'APROVADO', color: 'emerald', icon: 'verified', bg: 'bg-emerald-500' },
        REJECTED: { label: 'REPROVADO', color: 'rose', icon: 'cancel', bg: 'bg-rose-500' },
        RESTRICTED: { label: 'RESTRIÇÃO', color: 'amber', icon: 'warning', bg: 'bg-amber-500' },
    }[pallet.result];

    const fmt = new Intl.NumberFormat('pt-BR');
    const nonZeroDefects = Object.entries(pallet.defects_detail || {})
        .filter(([, v]) => Number(v) > 0);
    const totalDefects = nonZeroDefects.reduce<number>((s, [, v]) => s + Number(v), 0);

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5 animate-fade-in" ref={printRef}>

            {/* Barra de ação (não aparece na impressão) */}
            <div className="flex items-center justify-between gap-3 print:hidden">
                <Link
                    to="/finishing-analysis"
                    className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                >
                    <span className="material-symbols-outlined text-base">arrow_back</span>
                    Produto Acabado
                </Link>
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 h-9 px-5 rounded-xl bg-slate-800 dark:bg-slate-700 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 transition-all"
                >
                    <span className="material-symbols-outlined text-sm">print</span>
                    Imprimir
                </button>
            </div>

            {/* Card principal — resultado */}
            <div className={`rounded-3xl border-2 p-6 md:p-8 space-y-6 ${
                pallet.result === 'APPROVED' ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800' :
                pallet.result === 'REJECTED' ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800' :
                'border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800'
            }`}>

                {/* Cabeçalho */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">PALLET INSPECIONADO</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                            OP {pallet.op}
                        </h1>
                        <p className="text-lg font-black text-slate-600 dark:text-slate-400">
                            Pallet #{pallet.pallet_number}
                        </p>
                        <p className="text-xs text-slate-400 font-medium">
                            {new Date(pallet.completed_at).toLocaleString('pt-BR', {
                                day: '2-digit', month: 'long', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </p>
                    </div>

                    {/* QR Code */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                        <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <QRCodeSVG
                                value={palletUrl}
                                size={100}
                                bgColor="#ffffff"
                                fgColor="#0f172a"
                                level="M"
                            />
                        </div>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">
                            Audit QR
                        </p>
                    </div>
                </div>

                {/* Resultado principal */}
                <div className={`flex items-center gap-4 p-5 rounded-2xl ${
                    pallet.result === 'APPROVED' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                    pallet.result === 'REJECTED' ? 'bg-rose-100 dark:bg-rose-900/30' :
                    'bg-amber-100 dark:bg-amber-900/30'
                }`}>
                    <span className={`material-symbols-outlined text-5xl text-${resultMeta.color}-500`}>
                        {resultMeta.icon}
                    </span>
                    <div>
                        <p className={`text-2xl font-black uppercase tracking-widest text-${resultMeta.color}-800 dark:text-${resultMeta.color}-300`}>
                            LOTE {resultMeta.label}
                        </p>
                        <p className="text-sm font-bold text-slate-500 mt-0.5">
                            Crítico: {pallet.defects_critical} &nbsp;|&nbsp;
                            Maior: {pallet.defects_major} &nbsp;|&nbsp;
                            Menor: {pallet.defects_minor}
                        </p>
                    </div>
                </div>
            </div>

            {/* Informações da inspeção */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Analista', value: pallet.analyst_name || '—', icon: 'person' },
                    { label: 'Máquina', value: pallet.machine_name || '—', icon: 'precision_manufacturing' },
                    { label: 'Perfil NQA', value: pallet.nqa_profile_name || 'Personalizado', icon: 'fact_check' },
                    { label: 'Nível', value: `Nível ${pallet.inspection_level}`, icon: 'analytics' },
                ].map(item => (
                    <div key={item.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">{item.icon}</span>
                            {item.label}
                        </p>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-200 truncate">{item.value}</p>
                    </div>
                ))}
            </div>

            {/* Amostragem */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-indigo-500">rule</span>
                    Plano de Amostragem — Sub-lote 50.000 un.
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Un. por caixa', value: fmt.format(pallet.units_per_box) },
                        { label: 'Cx. no sub-lote', value: fmt.format(pallet.total_boxes_sublote) },
                        { label: 'Cx. inspecionadas', value: fmt.format(pallet.boxes_to_inspect) },
                        { label: 'Amostra NBR', value: `${fmt.format(pallet.sample_size)} un.` },
                    ].map(item => (
                        <div key={item.label} className="bg-indigo-50 dark:bg-indigo-950/20 rounded-xl p-3 border border-indigo-100 dark:border-indigo-900">
                            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400">{item.label}</p>
                            <p className="text-lg font-black text-indigo-800 dark:text-indigo-200">{item.value}</p>
                        </div>
                    ))}
                </div>

                {/* Destaque: unidades por caixa inspecionadas */}
                {pallet.boxes_to_inspect > 0 && (
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                        <span className="material-symbols-outlined text-3xl text-amber-500 shrink-0">search</span>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Unidades inspecionadas por caixa</p>
                            <p className="text-2xl font-black text-amber-800 dark:text-amber-200">
                                {Math.ceil(pallet.sample_size / pallet.boxes_to_inspect)}
                                <span className="text-sm font-bold text-amber-600 ml-1">unid./caixa</span>
                            </p>
                            <p className="text-[10px] text-amber-600 font-bold">
                                {fmt.format(pallet.sample_size)} amostras ÷ {pallet.boxes_to_inspect} caixas
                            </p>
                        </div>
                    </div>
                )}

                {/* AQL */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'AQL Crítico', value: pallet.aql_critical, color: 'rose' },
                        { label: 'AQL Maior', value: pallet.aql_major, color: 'amber' },
                        { label: 'AQL Menor', value: pallet.aql_minor, color: 'slate' },
                    ].map(item => (
                        <div key={item.label} className={`rounded-xl p-3 bg-${item.color}-50 dark:bg-${item.color}-950/20 border border-${item.color}-100 dark:border-${item.color}-900 text-center`}>
                            <p className={`text-[9px] font-black uppercase tracking-widest text-${item.color}-500`}>{item.label}</p>
                            <p className={`text-xl font-black text-${item.color}-700 dark:text-${item.color}-300`}>{item.value}</p>
                        </div>
                    ))}
                </div>

                {/* Caixas inspecionadas */}
                {pallet.boxes_list && pallet.boxes_list.length > 0 && (
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                            Caixas abertas na inspeção
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {pallet.boxes_list.map(n => (
                                <span key={n} className="px-2.5 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-lg">
                                    Cx {n}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Defeitos encontrados */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base text-rose-500">emergency_home</span>
                        Não Conformidades Encontradas
                    </h3>
                    {totalDefects > 0 && (
                        <span className="px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest">
                            {fmt.format(totalDefects)} defeitos
                        </span>
                    )}
                </div>

                {nonZeroDefects.length === 0 ? (
                    <p className="text-sm text-slate-400 font-bold text-center py-4 italic">
                        Nenhum defeito registrado nesta inspeção.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {nonZeroDefects.map(([key, count]) => (
                            <div key={key} className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {DEFECT_LABELS[key] ?? key}
                                </span>
                                <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                                    {count}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Contagem NQA */}
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {[
                        { label: 'Críticos', value: pallet.defects_critical, color: 'rose' },
                        { label: 'Maiores', value: pallet.defects_major, color: 'amber' },
                        { label: 'Menores', value: pallet.defects_minor, color: 'slate' },
                    ].map(item => (
                        <div key={item.label} className={`text-center p-3 rounded-xl ${item.value > 0 ? `bg-${item.color}-50 dark:bg-${item.color}-950/20 border border-${item.color}-100 dark:border-${item.color}-900` : 'bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700'}`}>
                            <p className={`text-[9px] font-black uppercase tracking-widest ${item.value > 0 ? `text-${item.color}-500` : 'text-slate-400'}`}>{item.label}</p>
                            <p className={`text-2xl font-black ${item.value > 0 ? `text-${item.color}-700 dark:text-${item.color}-300` : 'text-slate-400'}`}>{item.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Observações */}
            {pallet.observations && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-base text-slate-400">notes</span>
                        Observações do Analista
                    </h3>
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                        {pallet.observations}
                    </p>
                </div>
            )}

            {/* Rodapé de auditoria */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium py-2 print:block">
                <span>ID: <code className="font-mono text-slate-500">{pallet.id}</code></span>
                <span className="print:hidden">Registro imutável · Kingraf Sistema de Qualidade</span>
            </div>
        </div>
    );
}

