
import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { LayoutDashboard, TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export default function DashboardView() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any[]>([]);
    const [defectsData, setDefectsData] = useState<any[]>([]);
    const [operators, setOperators] = useState<any[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch inspections with related data
            const { data: inspections, error: inspError } = await supabase
                .from('inspections')
                .select(`
          *,
          machines(name),
          inspection_defects(count, defect_types(name))
        `)
                .order('created_at', { ascending: true });

            if (inspError) throw inspError;
            setData(inspections || []);

            // Fetch Operators for naming
            const { data: opsData } = await supabase.from('operators').select('id, name');
            setOperators(opsData || []);

            // Pre-process defects for Pareto
            const defectMap: Record<string, number> = {};
            inspections?.forEach(insp => {
                insp.inspection_defects?.forEach((d: any) => {
                    const typeName = d.defect_types?.name || 'Outros';
                    defectMap[typeName] = (defectMap[typeName] || 0) + (d.count || 0);
                });
            });

            const processedDefects = Object.entries(defectMap)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            setDefectsData(processedDefects);
        } catch (error: any) {
            showToast('Erro ao carregar dados do dashboard', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Compute Stats
    const stats = useMemo(() => {
        const total = data.length;
        const approved = data.filter(i => i.status === 'APPROVED').length;
        const rejected = data.filter(i => i.status === 'REJECTED').length;
        const restricted = data.filter(i => i.status === 'RESTRICTED').length;

        const totalDefects = data.reduce((acc, curr) => {
            const defectsCount = curr.inspection_defects?.reduce((a: number, b: any) => a + (b.count || 0), 0) || 0;
            return acc + defectsCount;
        }, 0);

        const approvalRate = total > 0 ? (approved / total) * 100 : 0;

        return { total, approved, rejected, restricted, totalDefects, approvalRate };
    }, [data]);

    // Data Processing for New Charts
    const { machineData, operatorData, statusChartData } = useMemo(() => {
        // 1. Defects by Machine
        const machMap: Record<string, number> = {};
        // 2. Defects by Operator
        const opMap: Record<string, number> = {};

        data.forEach(insp => {
            const defCount = insp.inspection_defects?.reduce((a: number, b: any) => a + (b.count || 0), 0) || 0;

            // Machine
            const machName = insp.machines?.name || 'N/A';
            if (defCount > 0) {
                machMap[machName] = (machMap[machName] || 0) + defCount;
            }

            // Operator (Resolve IDs from JSON or legacy field)
            let opIds: string[] = [];
            try {
                const obs = insp.observations ? JSON.parse(insp.observations) : {};
                if (obs.all_operator_ids && Array.isArray(obs.all_operator_ids)) {
                    opIds = obs.all_operator_ids;
                } else if (insp.operator_id) {
                    opIds = [insp.operator_id];
                }
            } catch (e) {
                if (insp.operator_id) opIds = [insp.operator_id];
            }

            // Attribute defects to ALL operators involved in that inspection
            if (defCount > 0) {
                opIds.forEach(id => {
                    const opName = operators.find(o => o.id === id)?.name || 'Desconhecido';
                    opMap[opName] = (opMap[opName] || 0) + defCount;
                });
            }
        });

        const machineData = Object.entries(machMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10

        const operatorData = Object.entries(opMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10

        // 3. Status Distribution
        const statusChartData = [
            { name: 'Aprovado', value: stats.approved, color: '#10b981' }, // emerald-500
            { name: 'Reprovado', value: stats.rejected, color: '#f43f5e' }, // rose-500
            { name: 'Revisão', value: stats.restricted, color: '#f59e0b' }, // amber-500
        ].filter(d => d.value > 0);

        return { machineData, operatorData, statusChartData };
    }, [data, operators, stats]);

    // Daily Evolution Data
    const evolutionData = useMemo(() => {
        const dailyMap: Record<string, any> = {};
        data.forEach(insp => {
            const date = new Date(insp.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            if (!dailyMap[date]) {
                dailyMap[date] = { date, aprovadas: 0, rejeitadas: 0, total: 0 };
            }
            dailyMap[date].total += 1;
            if (insp.status === 'APPROVED') dailyMap[date].aprovadas += 1;
            if (insp.status === 'REJECTED') dailyMap[date].rejeitadas += 1;
        });
        return Object.values(dailyMap).sort((a: any, b: any) => { // Ensure chronological order
            const [dA, mA] = a.date.split('/');
            const [dB, mB] = b.date.split('/');
            return new Date(2025, mA - 1, dA).getTime() - new Date(2025, mB - 1, dB).getTime();
        }).slice(-14); // Last 14 days
    }, [data]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto w-full animate-fade-in pb-20">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                        <LayoutDashboard className="text-primary size-8" />
                        Dashboard Intelligence
                    </h1>
                    <p className="text-slate-500 font-medium text-sm">Análise em tempo real dos indicadores de qualidade.</p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-all text-xs font-black uppercase tracking-widest text-slate-600"
                >
                    <Clock className="size-4" /> Atualizar Dados
                </button>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Inspeções" value={stats.total} icon={<TrendingUp />} color="bg-blue-500" />
                <StatCard title="Taxa Aprovação" value={`${stats.approvalRate.toFixed(1)}%`} icon={<CheckCircle />} color="bg-emerald-500" />
                <StatCard title="Total Defeitos" value={stats.totalDefects} icon={<AlertTriangle />} color="bg-rose-500" />
                <StatCard title="Análise Pendente" value={stats.restricted} icon={<Clock />} color="bg-amber-500" />
            </div>

            {/* Row 1: Defects by Type (Pareto) & Status Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Pareto Chart (2/3 width) */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm h-[400px] flex flex-col">
                    <div className="mb-6">
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Pareto de Defeitos</h3>
                        <p className="text-xs text-slate-400 font-medium">Top causas de não conformidade</p>
                    </div>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={defectsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} interval={0} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '1rem' }}
                                />
                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Pie Chart (1/3 width) */}
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm h-[400px] flex flex-col">
                    <div className="mb-6">
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Status Geral</h3>
                        <p className="text-xs text-slate-400 font-medium">Distribuição de aprovação</p>
                    </div>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusChartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '1rem' }} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Row 2: Defects by Machine & Defects by Operator */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Defects by Machine */}
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm h-[400px] flex flex-col">
                    <div className="mb-6">
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Defeitos por Máquina</h3>
                        <p className="text-xs text-slate-400 font-medium">Máquinas com maior índice de falhas</p>
                    </div>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={machineData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '1rem' }}
                                />
                                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Defects by Operator */}
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm h-[400px] flex flex-col">
                    <div className="mb-6">
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Defeitos por Operador</h3>
                        <p className="text-xs text-slate-400 font-medium">Operadores com maior índice de apontamentos</p>
                    </div>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={operatorData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '1rem' }}
                                />
                                <Bar dataKey="count" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Row 3: Temporal Evolution */}
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm h-[400px] flex flex-col">
                <div className="mb-6">
                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Evolução de Produção</h3>
                    <p className="text-xs text-slate-400 font-medium">Histórico de qualidade (14 dias)</p>
                </div>
                <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={evolutionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorRejected" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '1rem' }}
                            />
                            <Area type="monotone" dataKey="aprovadas" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorApproved)" />
                            <Area type="monotone" dataKey="rejeitadas" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorRejected)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, color }: any) {
    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-5 group hover:border-primary/50 transition-all">
            <div className={`size-14 ${color} text-white rounded-2xl flex items-center justify-center shadow-lg shadow-${color.split('-')[1]}-500/20 group-hover:scale-110 transition-transform`}>
                {React.cloneElement(icon, { size: 28 })}
            </div>
            <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">{title}</p>
                <p className="text-2xl font-black text-slate-800 dark:text-white">{value}</p>
            </div>
        </div>
    );
}
