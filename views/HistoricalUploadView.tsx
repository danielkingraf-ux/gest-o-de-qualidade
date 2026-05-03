import React, { useEffect, useMemo, useState } from 'react';
import { odsService, OdsReport, OdsReportResponse } from '../services/odsService';
import { useToast } from '../contexts/ToastContext';

export default function HistoricalUploadView() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [report, setReport] = useState<(OdsReport & { receivedAt: string }) | null>(null);
    const [history, setHistory] = useState<(OdsReport & { receivedAt: string })[]>([]);
    const { showToast } = useToast();

    const STORAGE_KEY = 'odsReportHistory';
    const isSuccess = (value: OdsReportResponse | null): value is OdsReport => !!value && !('error' in value);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            const sanitized = parsed.filter((item) => item && item.summary && item.file && item.sheets);
            setHistory(sanitized);
        } catch {
            // Ignore storage parse errors
        }
    }, []);

    const persistHistory = (items: (OdsReport & { receivedAt: string })[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {
            // Ignore storage errors
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setIsProcessing(true);
        try {
            const data = await odsService.processHistoricalData(file);
            console.log('ODS response:', data);
            if (!isSuccess(data)) {
                showToast(data.error, 'error');
                setReport(null);
                return;
            }

            const stamped = { ...data, receivedAt: new Date().toISOString() };
            setReport(stamped);
            const nextHistory = [stamped, ...history].slice(0, 10);
            setHistory(nextHistory);
            persistHistory(nextHistory);
            showToast('Relatorio gerado com sucesso!', 'success');
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const reportData = report;
    const hasReport = !!reportData;
    const sheets = reportData?.sheets ?? [];
    const hasSheets = sheets.length > 0;

    const sheetSummaries = useMemo(() => {
        return sheets.map((s) => {
            const meanEntries = Object.entries(s.stats.numeric_means || {});
            const topMeans = meanEntries.slice(0, 5);
            return {
                name: s.sheet,
                rows: s.stats.rows,
                columns: s.stats.columns,
                numericCount: meanEntries.length,
                topMeans,
            };
        });
    }, [sheets]);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 p-8 rounded-[2rem] shadow-2xl shadow-indigo-500/20 text-white">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 size-64 bg-white/10 rounded-full blur-3xl" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined p-2 bg-white/20 rounded-xl backdrop-blur-md">analytics</span>
                            <h1 className="text-3xl font-black uppercase tracking-tight">Relatorio ODS</h1>
                        </div>
                        <p className="text-indigo-100 font-medium opacity-80">Upload de planilhas e estatisticas por aba.</p>
                    </div>
                    {reportData && (
                        <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center min-w-[160px]">
                            <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">Total de Abas</p>
                            <p className="text-4xl font-black">{reportData.summary.total_sheets}</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl h-fit">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">upload_file</span> Novo Upload
                        </h3>

                        <div className="space-y-4">
                            <label className="group relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all cursor-pointer bg-slate-50/50 dark:bg-slate-950/20 overflow-hidden">
                                <input type="file" accept=".ods" onChange={handleFileChange} className="hidden" />
                                <div className="flex flex-col items-center justify-center pt-2">
                                    <span className="material-symbols-outlined text-3xl text-slate-300 group-hover:text-indigo-500 group-hover:scale-110 transition-all mb-2">cloud_upload</span>
                                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 text-center px-4 truncate w-full">
                                        {file ? file.name : 'Arraste sua planilha (.ods)'}
                                    </p>
                                </div>
                            </label>

                            <button
                                onClick={handleUpload}
                                disabled={!file || isProcessing}
                                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                {isProcessing ? <span className="material-symbols-outlined animate-spin text-base">refresh</span> : 'Processar'}
                            </button>
                        </div>
                    </div>

                    {reportData && (
                        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Resumo</h3>
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="bg-white/70 dark:bg-slate-950/50 rounded-2xl p-4">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Abas</p>
                                    <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{reportData.summary.total_sheets}</p>
                                </div>
                                <div className="bg-white/70 dark:bg-slate-950/50 rounded-2xl p-4">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Linhas</p>
                                    <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{reportData.summary.total_rows}</p>
                                </div>
                                <div className="bg-white/70 dark:bg-slate-950/50 rounded-2xl p-4">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Colunas</p>
                                    <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{reportData.summary.total_columns}</p>
                                </div>
                            </div>
                            <div className="mt-4 text-xs text-slate-400">
                                Arquivo: <span className="font-bold text-slate-600 dark:text-slate-300">{reportData.file.name}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-2 space-y-6">
                    {hasReport ? (
                        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                                <span className="material-symbols-outlined text-base">table</span> Abas e Estatisticas
                            </h3>
                            {hasSheets ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {sheetSummaries.map((sheet) => (
                                        <div key={sheet.name} className="p-6 bg-white dark:bg-slate-950/40 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-sm font-black text-slate-700 dark:text-slate-200">{sheet.name}</p>
                                                <span className="text-[10px] uppercase tracking-widest text-slate-400">{sheet.rows}x{sheet.columns}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] text-slate-500">
                                                <span className="font-bold">Numericas:</span> {sheet.numericCount}
                                            </div>
                                            {sheet.topMeans.length > 0 ? (
                                                <div className="mt-3 space-y-1">
                                                    {sheet.topMeans.map(([key, value]) => (
                                                        <div key={key} className="flex justify-between text-[11px] text-slate-500">
                                                            <span className="truncate max-w-[160px]">{key}</span>
                                                            <span className="font-bold text-slate-700 dark:text-slate-300">{Number(value).toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="mt-3 text-[11px] text-slate-400">Sem medias numericas.</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">
                                    Nenhuma aba encontrada para exibir.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
                            <div className="bg-white/50 p-6 rounded-full mb-6">
                                <span className="material-symbols-outlined text-6xl opacity-30 text-indigo-500">monitoring</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300">Nenhum dado para exibir</h3>
                            <p className="text-xs font-medium opacity-60 max-w-xs text-center mt-2">
                                Faca o upload de uma planilha ODS para gerar o relatorio de estatisticas por aba.
                            </p>
                        </div>
                    )}

                    {history.length > 0 && (
                        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Registros Recentes</h3>
                                <button
                                    onClick={() => {
                                        setHistory([]);
                                        persistHistory([]);
                                    }}
                                    className="text-[10px] font-black uppercase tracking-widest text-slate-400"
                                >
                                    Limpar
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {history.map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setReport(item)}
                                        className="text-left p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 hover:border-indigo-200 transition-colors"
                                    >
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Relatorio</p>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{new Date(item.receivedAt).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Abas: {item.summary.total_sheets} â€¢ Linhas: {item.summary.total_rows}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
