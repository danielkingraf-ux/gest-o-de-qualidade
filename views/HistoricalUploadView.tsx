import React, { useEffect, useState } from 'react';
import { n8nService, n8nReportResponse, n8nReportSuccess } from '../services/n8nService';
import { useToast } from '../contexts/ToastContext';


import { PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function HistoricalUploadView() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [report, setReport] = useState<n8nReportResponse | null>(null);
    const [history, setHistory] = useState<n8nReportSuccess[]>([]);
    const { showToast } = useToast();

    const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981'];
    const isSuccess = (value: n8nReportResponse | null): value is n8nReportSuccess => !!value && !('error' in value);
    const reportData = isSuccess(report) ? report : null;
    const hasReport = !!reportData;
    const operatorsSafe = reportData?.operators ?? [];
    const defectsSafe = reportData?.defectDistribution ?? [];
    const timelineSafe = reportData?.timelineData ?? [];
    const hasOperators = operatorsSafe.length > 0;
    const hasDefects = defectsSafe.length > 0;
    const hasTimeline = timelineSafe.length > 0;
    const STORAGE_KEY = 'odsReportHistory';

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setHistory(parsed);
        } catch {
            // Ignore storage parse errors
        }
    }, []);

    const persistHistory = (items: n8nReportSuccess[]) => {
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
            const data = await n8nService.processHistoricalData(file);
            setReport(data);
            if ('error' in data) {
                showToast(data.error, 'error');
            } else {
                const nextHistory = [data, ...history].slice(0, 10);
                setHistory(nextHistory);
                persistHistory(nextHistory);
                showToast('Relatorio gerado com sucesso!', 'success');
            }
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
                            <span className="material-symbols-outlined p-2 bg-white/20 rounded-xl backdrop-blur-md">analytics</span>
                            <h1 className="text-3xl font-black uppercase tracking-tight">Dashboard Historico</h1>
                        </div>
                        <p className="text-indigo-100 font-medium opacity-80">Analise avancada de qualidade e eficiencia por operador.</p>
                    </div>
                    {reportData && (
                        <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center min-w-[140px]">
                            <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">Eficiencia Geral</p>
                            <p className="text-4xl font-black">{Math.round(reportData.overallEfficiency)}%</p>
                        </div>
                    )}
                </div>
            </div>

            {report && 'error' in report && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 mb-6">
                    <h3 className="font-bold flex items-center gap-2">
                        Erro ao processar o arquivo
                    </h3>
                    <p className="mt-2 text-sm opacity-90">{report.error}</p>
                </div>
            )}

            {report?.warnings && report.warnings.length > 0 && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-500 mb-6">
                    <h3 className="font-bold flex items-center gap-2">
                        Atencao: Dados incompletos
                    </h3>
                    <p className="mt-2 text-sm opacity-90">
                        {report.warnings.join(' ')}
                    </p>
                    <details className="mt-4 cursor-pointer">
                        <summary className="text-xs hover:underline">Ver dados brutos recebidos (Debug)</summary>
                        <pre className="mt-2 p-2 bg-black/40 rounded text-xs overflow-auto max-h-40">
                            {JSON.stringify(report, null, 2)}
                        </pre>
                    </details>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Upload Card */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl h-fit">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">upload_file</span> Novo Lote
                        </h3>

                        <div className="space-y-4">
                            <label className="group relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all cursor-pointer bg-slate-50/50 dark:bg-slate-950/20 overflow-hidden">
                                <input type="file" accept=".ods" onChange={handleFileChange} className="hidden" />
                                <div className="flex flex-col items-center justify-center pt-2">
                                    <span className="material-symbols-outlined text-3xl text-slate-300 group-hover:text-indigo-500 group-hover:scale-110 transition-all mb-2">cloud_upload</span>
                                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 text-center px-4 truncate w-full">
                                        {file ? file.name : "Arraste sua planilha (.ods)"}
                                    </p>
                                </div>
                            </label>

                            <button
                                onClick={handleUpload}
                                disabled={!file || isProcessing}
                                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                {isProcessing ? <span className="material-symbols-outlined animate-spin text-base">refresh</span> : "Processar Analise"}
                            </button>
                        </div>
                    </div>

                    {reportData && (
                        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Top Defeitos</h3>
                            {hasDefects ? (
                                <>
                                    <div className="h-[200px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={defectsSafe}
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {defectsSafe.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                    itemStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                                        {defectsSafe.map((entry, index) => (
                                            <div key={index} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                                                <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{entry.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="h-[200px] flex items-center justify-center text-xs text-slate-400">
                                    Nenhum defeito identificado para exibir.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Dashboard Area */}
                <div className="lg:col-span-2 space-y-6">
                    {reportData ? (
                        <>
                            {/* Timeline Chart */}
                            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">show_chart</span> Evolucao Temporal
                                </h3>
                                {hasTimeline ? (
                                    <div className="h-[250px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={timelineSafe}>
                                                <defs>
                                                    <linearGradient id="colorIssues" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                                                <Area type="monotone" dataKey="issues" stroke="#6366f1" fillOpacity={1} fill="url(#colorIssues)" strokeWidth={3} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div className="h-[250px] flex items-center justify-center text-xs text-slate-400">
                                        Sem dados de data para gerar a linha do tempo.
                                    </div>
                                )}
                            </div>

                            {/* Operators Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {hasOperators ? (
                                    operatorsSafe.map((op, idx) => (
                                        <div key={idx} className="p-6 bg-white dark:bg-slate-950/40 rounded-[2rem] border border-slate-100 dark:border-slate-800 hover:border-indigo-200 transition-colors group">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">{op.name}</p>
                                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Producao</p>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className={`text-lg font-black ${op.efficiency > 80 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                        {Math.round(op.efficiency)}%
                                                    </span>
                                                    <span className="text-[9px] text-slate-400 font-bold">Eficiencia</span>
                                                </div>
                                            </div>

                                            <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-1000 ${op.efficiency > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                    style={{ width: `${op.efficiency}%` }}
                                                />
                                            </div>
                                            <p className="text-right text-[10px] text-slate-400 font-medium">
                                                <span className="text-indigo-500 font-bold">{op.totalIssues}</span> defeitos registrados
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-full p-6 bg-white/60 dark:bg-slate-950/40 rounded-[2rem] border border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
                                        Nenhum operador identificado para exibir.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
                            <div className="bg-white/50 p-6 rounded-full mb-6">
                                <span className="material-symbols-outlined text-6xl opacity-30 text-indigo-500">monitoring</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300">Nenhum dado para exibir</h3>
                            <p className="text-xs font-medium opacity-60 max-w-xs text-center mt-2">
                                Faca o upload de uma planilha ODS para gerar o dashboard de qualidade, ver tendencias e metricas de eficiencia.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {reportData && (
                <div className="space-y-6">
                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Dados Extraidos (Validacao)</h3>
                            <button
                                onClick={() => setReport(reportData)}
                                className="text-[10px] font-black uppercase tracking-widest text-indigo-600"
                            >
                                Recarregar
                            </button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Operadores</p>
                                <div className="max-h-56 overflow-auto">
                                    <table className="w-full text-[11px]">
                                        <thead className="text-slate-400">
                                            <tr>
                                                <th className="text-left font-bold py-1">Nome</th>
                                                <th className="text-right font-bold py-1">Defeitos</th>
                                                <th className="text-right font-bold py-1">Ef.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {operatorsSafe.map((op, idx) => (
                                                <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                                                    <td className="py-1">{op.name}</td>
                                                    <td className="py-1 text-right">{op.totalIssues}</td>
                                                    <td className="py-1 text-right">{Math.round(op.efficiency)}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Defeitos</p>
                                <div className="max-h-56 overflow-auto">
                                    <table className="w-full text-[11px]">
                                        <thead className="text-slate-400">
                                            <tr>
                                                <th className="text-left font-bold py-1">Tipo</th>
                                                <th className="text-right font-bold py-1">Qtde</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {defectsSafe.map((d, idx) => (
                                                <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                                                    <td className="py-1">{d.name}</td>
                                                    <td className="py-1 text-right">{d.value}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Linha do Tempo</p>
                                <div className="max-h-56 overflow-auto">
                                    <table className="w-full text-[11px]">
                                        <thead className="text-slate-400">
                                            <tr>
                                                <th className="text-left font-bold py-1">Periodo</th>
                                                <th className="text-right font-bold py-1">Defeitos</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {timelineSafe.map((t, idx) => (
                                                <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                                                    <td className="py-1">{t.name}</td>
                                                    <td className="py-1 text-right">{t.issues}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <details className="mt-4">
                            <summary className="text-xs font-bold text-slate-400 cursor-pointer">Ver JSON completo</summary>
                            <pre className="mt-2 p-3 bg-black/40 rounded text-xs overflow-auto max-h-64">
                                {JSON.stringify(reportData, null, 2)}
                            </pre>
                        </details>
                    </div>

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
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{new Date(item.timestamp).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Processados: {item.totalProcessed} • Ef.: {Math.round(item.overallEfficiency)}%</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
