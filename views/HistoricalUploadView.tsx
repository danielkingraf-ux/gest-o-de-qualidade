
import React, { useState } from 'react';
import { n8nService, n8nReportResponse } from '../services/n8nService';
import { useToast } from '../contexts/ToastContext';

export default function HistoricalUploadView() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [report, setReport] = useState<n8nReportResponse | null>(null);
    const { showToast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setIsProcessing(true);
        try {
            const data = await n8nService.processHistoricalData(file);
            setReport(data);
            showToast('Arquivo processado com sucesso!', 'success');
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 p-8 rounded-[2rem] shadow-2xl shadow-indigo-500/20 text-white">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 size-64 bg-white/10 rounded-full blur-3xl" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined p-2 bg-white/20 rounded-xl backdrop-blur-md">history</span>
                            <h1 className="text-3xl font-black uppercase tracking-tight">Importação Histórica</h1>
                        </div>
                        <p className="text-indigo-100 font-medium opacity-80">Processe planilhas ODS antigas via n8n e gere insights consolidados.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Upload Card */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">upload_file</span> Selecionar Dados
                        </h3>

                        <div className="space-y-4">
                            <label className="group relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all cursor-pointer bg-slate-50/50 dark:bg-slate-950/20 overflow-hidden">
                                <input type="file" accept=".ods" onChange={handleFileChange} className="hidden" />
                                <div className="flex flex-col items-center justify-center pb-6 pt-5">
                                    <span className="material-symbols-outlined text-4xl text-slate-300 group-hover:text-indigo-500 group-hover:scale-110 transition-all mb-3">cloud_upload</span>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                        {file ? file.name : "Clique ou arraste o ODS"}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter">Planilhas antigas (.ods)</p>
                                </div>
                            </label>

                            <button
                                onClick={handleUpload}
                                disabled={!file || isProcessing}
                                className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                            >
                                {isProcessing ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin">refresh</span>
                                        Processando...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">analytics</span>
                                        Gerar Relatório
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Results Card */}
                <div className="lg:col-span-2">
                    {report ? (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-emerald-500 p-6 rounded-[2rem] text-white shadow-lg shadow-emerald-500/20">
                                    <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Total Processado</p>
                                    <p className="text-4xl font-black">{report.totalProcessed}</p>
                                    <p className="text-xs font-medium opacity-80 mt-1">Registros importados com sucesso</p>
                                </div>
                                <div className="bg-amber-500 p-6 rounded-[2rem] text-white shadow-lg shadow-amber-500/20">
                                    <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Data do Relatório</p>
                                    <p className="text-2xl font-black">{new Date(report.timestamp).toLocaleDateString()}</p>
                                    <p className="text-xs font-medium opacity-80 mt-1">Sincronizado via n8n</p>
                                </div>
                            </div>

                            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">person</span> Performance por Operador
                                </h3>
                                <div className="space-y-4">
                                    {report.operators.map((op, idx) => (
                                        <div key={idx} className="flex flex-col gap-2 p-4 bg-slate-50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-slate-800">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-black text-slate-700 dark:text-slate-200">{op.name}</span>
                                                <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black">
                                                    {op.totalIssues} Problemas
                                                </span>
                                            </div>
                                            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-indigo-500 rounded-full"
                                                    style={{ width: `${Math.min(100, (op.totalIssues / report.totalProcessed) * 500)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
                            <span className="material-symbols-outlined text-6xl mb-4 opacity-20">bar_chart</span>
                            <p className="text-sm font-bold opacity-60">Aguardando upload para exibir métricas...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
