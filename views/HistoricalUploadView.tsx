import React, { useState } from 'react';
import { n8nService, n8nReportResponse } from '../services/n8nService';
import { useToast } from '../contexts/ToastContext';


import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function HistoricalUploadView() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [report, setReport] = useState<n8nReportResponse | null>(null);
    const { showToast } = useToast();

    const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981'];

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
            showToast('Relatório gerado com sucesso!', 'success');
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
                            <h1 className="text-3xl font-black uppercase tracking-tight">Dashboard Histórico</h1>
                        </div>
                        <p className="text-indigo-100 font-medium opacity-80">Análise avançada de qualidade e eficiência por operador.</p>
                    </div>
                    {report && (
                        <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-center min-w-[140px]">
                            <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">Eficiência Geral</p>
                            <p className="text-4xl font-black">{Math.round(report.overallEfficiency)}%</p>
                        </div>
                    )}
                </div>
            </div>

            {/* New Stats Cards (placeholder for now, as per instruction) */}
            {/* The instruction implies a new grid for stats cards, but doesn't provide content. */}
            {/* Keeping the original structure for now and inserting the warning. */}
            {report && report.operators.length === 0 && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-500 mb-6">
                    <h3 className="font-bold flex items-center gap-2">
                        ⚠️ Atenção: Nenhum dado de produção identificado
                    </h3>
                    <p className="mt-2 text-sm opacity-90">
                        O arquivo foi lido, mas não conseguimos identificar os Operadores ou Defeitos.
                        <br />
                        Verifique se sua planilha tem as colunas exatas:
                        <span className="font-mono bg-black/20 px-1 rounded mx-1">Operador</span>,
                        <span className="font-mono bg-black/20 px-1 rounded mx-1">Máquina</span>,
                        <span className="font-mono bg-black/20 px-1 rounded mx-1">Data</span>
                        e colunas contendo <span className="font-mono bg-black/20 px-1 rounded mx-1">Defeito</span>.
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
                                {isProcessing ? <span className="material-symbols-outlined animate-spin text-base">refresh</span> : "Processar Análise"}
                            </button>
                        </div>
                    </div>

                    {report && (
                        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Top Defeitos</h3>
                            <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={report.defectDistribution}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {report.defectDistribution.map((entry, index) => (
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
                                {report.defectDistribution.map((entry, index) => (
                                    <div key={index} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                                        <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{entry.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Dashboard Area */}
                <div className="lg:col-span-2 space-y-6">
                    {report ? (
                        <>
                            {/* Timeline Chart */}
                            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white dark:border-slate-800 shadow-xl">
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">show_chart</span> Evolução Temporal
                                </h3>
                                <div className="h-[250px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={report.timelineData}>
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
                            </div>

                            {/* Operators Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {report.operators.map((op, idx) => (
                                    <div key={idx} className="p-6 bg-white dark:bg-slate-950/40 rounded-[2rem] border border-slate-100 dark:border-slate-800 hover:border-indigo-200 transition-colors group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-sm font-black text-slate-700 dark:text-slate-200">{op.name}</p>
                                                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Produção</p>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className={`text-lg font-black ${op.efficiency > 80 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    {Math.round(op.efficiency)}%
                                                </span>
                                                <span className="text-[9px] text-slate-400 font-bold">Eficiência</span>
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
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
                            <div className="bg-white/50 p-6 rounded-full mb-6">
                                <span className="material-symbols-outlined text-6xl opacity-30 text-indigo-500">monitoring</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300">Nenhum dado para exibir</h3>
                            <p className="text-xs font-medium opacity-60 max-w-xs text-center mt-2">
                                Faça o upload de uma planilha ODS para gerar o dashboard de qualidade, ver tendências e métricas de eficiência.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
