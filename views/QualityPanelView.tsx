/**
 * QualityPanelView — Painel de Qualidade para Supervisão
 * Refugo · Escolha · Por Operador · Por Máquina · Ranking de Defeitos · Pareto · Turno
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
    Bar, ComposedChart, CartesianGrid, Line, ResponsiveContainer,
    Tooltip, XAxis, YAxis, Cell,
} from 'recharts';
import { supabase } from '../services/supabase';

// ─── Tipos internos ───────────────────────────────────────────────────────────
type Period = 'week' | 'month' | 'quarter' | 'all';

interface NormalizedRecord {
    id: string;
    op: string;
    date: Date;
    area: 'inicial' | 'acabado';
    status: string;
    machineName: string;
    machineId: string;
    operatorIds: string[];
    defects: Record<string, number>;   // key → count
    qtyProduzida: number;
    qtyEscolha: number;
    qtyRefugo: number;
}

const asN = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const parseObs = (v: any): any => {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return {}; }
};

function normalize(raw: any[]): NormalizedRecord[] {
    return raw.map(r => {
        const obs = parseObs(r.observations);
        const isAcabado = obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis;
        const prod = obs.producao || {};

        // Defeitos: processo inicial usa obs.defeitos.por_unidade, acabado usa obs.defects
        const defMap: Record<string, number> = {};
        if (isAcabado && obs.defects && typeof obs.defects === 'object') {
            Object.entries(obs.defects).forEach(([k, v]) => { const n = asN(v); if (n > 0) defMap[k] = n; });
        } else if (obs.defeitos?.por_unidade) {
            Object.entries(obs.defeitos.por_unidade).forEach(([k, v]: [string, any]) => {
                const n = asN(typeof v === 'object' ? v?.count : v);
                if (n > 0) defMap[k.replace(/_/g, ' ')] = n;
            });
            // UV e HS
            if (obs.verniz_uv?.aplicavel && obs.verniz_uv?.defeitos)
                Object.entries(obs.verniz_uv.defeitos).forEach(([k, v]: [string, any]) => { const n = asN(v?.count ?? v); if (n > 0) defMap[`UV: ${k}`] = n; });
            if (obs.hot_stamping?.aplicavel && obs.hot_stamping?.defeitos)
                Object.entries(obs.hot_stamping.defeitos).forEach(([k, v]: [string, any]) => { const n = asN(v?.count ?? v); if (n > 0) defMap[`HS: ${k}`] = n; });
        }

        // Quantidades
        let qtyProduzida = 0, qtyEscolha = 0, qtyRefugo = 0;
        if (isAcabado) {
            qtyProduzida = asN(prod.qty_produzida);
            qtyEscolha   = asN(prod.qty_escolha);
            qtyRefugo    = asN(prod.qty_refugo);
        } else {
            const saldo = obs.saldo_unidades || {};
            qtyProduzida = asN(saldo.rodadas);
            qtyEscolha   = asN(saldo.em_escolha);
            qtyRefugo    = asN(saldo.reprovadas);
        }

        const operatorIds: string[] = Array.isArray(obs.all_operator_ids) && obs.all_operator_ids.length > 0
            ? obs.all_operator_ids.filter(Boolean)
            : r.operator_id ? [r.operator_id] : [];

        return {
            id: r.id,
            op: String(r.op || '—'),
            date: new Date(r.created_at),
            area: isAcabado ? 'acabado' as const : 'inicial' as const,
            status: String(r.status || ''),
            machineName: r.machines?.name || '—',
            machineId: String(r.machine_id || ''),
            operatorIds,
            defects: defMap,
            qtyProduzida,
            qtyEscolha,
            qtyRefugo,
        };
    }).filter(r => !isNaN(r.date.getTime()));
}

const fmt = new Intl.NumberFormat('pt-BR');
const fmtPct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—';

function getPeriodStart(p: Period): Date | null {
    if (p === 'all') return null;
    const d = new Date();
    if (p === 'week')    d.setDate(d.getDate() - 7);
    if (p === 'month')   d.setMonth(d.getMonth() - 1);
    if (p === 'quarter') d.setMonth(d.getMonth() - 3);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function QualityPanelView() {
    const [loading, setLoading]       = useState(true);
    const [records, setRecords]       = useState<NormalizedRecord[]>([]);
    const [opNames, setOpNames]       = useState<Record<string, string>>({});
    const [period, setPeriod]         = useState<Period>('month');
    const [areaTab, setAreaTab]       = useState<'all' | 'inicial' | 'acabado'>('all');
    const [qualityTarget, setQualityTarget] = useState<number>(() => {
        const saved = localStorage.getItem('kg_quality_target');
        return saved ? Number(saved) : 95;
    });
    const [showTargetConfig, setShowTargetConfig] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const [insRes, opRes] = await Promise.all([
                supabase.from('inspections')
                    .select('id, op, created_at, status, machine_id, operator_id, observations, machines(name)')
                    .order('created_at', { ascending: false })
                    .limit(1000),
                supabase.from('operators').select('id, name'),
            ]);
            const names: Record<string, string> = {};
            (opRes.data || []).forEach((o: any) => { names[o.id] = o.name; });
            setOpNames(names);
            setRecords(normalize(insRes.data || []));
            setLoading(false);
        })();
    }, []);

    const filtered = useMemo(() => {
        const start = getPeriodStart(period);
        return records.filter(r => {
            if (start && r.date < start) return false;
            if (areaTab !== 'all' && r.area !== areaTab) return false;
            return true;
        });
    }, [records, period, areaTab]);

    // ── Totais ──────────────────────────────────────────────────────────────
    const totals = useMemo(() => {
        let registros = 0, produzida = 0, escolha = 0, refugo = 0;
        const opsSet = new Set<string>();
        filtered.forEach(r => {
            registros++;
            opsSet.add(r.op);
            produzida += r.qtyProduzida;
            escolha   += r.qtyEscolha;
            refugo    += r.qtyRefugo;
        });
        return { laudos: opsSet.size, registros, produzida, escolha, refugo };
    }, [filtered]);

    // ── Taxa de aprovação vs meta ───────────────────────────────────────────
    const taxaAprovacao = useMemo(() => {
        if (filtered.length === 0) return 0;
        const aprovados = filtered.filter(r => r.status === 'APPROVED').length;
        return (aprovados / filtered.length) * 100;
    }, [filtered]);

    // ── Ranking de defeitos ─────────────────────────────────────────────────
    const defectRanking = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach(r => {
            (Object.entries(r.defects) as [string, number][])
                .forEach(([k, v]) => map.set(k, (map.get(k) || 0) + v));
        });
        return Array.from(map.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 12);
    }, [filtered]);

    const maxDefect = defectRanking[0]?.count || 1;

    // ── Pareto (top 10 defeitos + % acumulada) ──────────────────────────────
    const paretoData = useMemo(() => {
        const top = defectRanking.slice(0, 10);
        const total = top.reduce((s, d) => s + d.count, 0) || 1;
        let acc = 0;
        return top.map(d => {
            acc += d.count;
            return { name: d.name.replace(/_/g, ' '), count: d.count, pct: Math.round((acc / total) * 100) };
        });
    }, [defectRanking]);

    // ── Por turno (manhã 06–14 / tarde 14–22 / noite 22–06) ────────────────
    const byTurno = useMemo(() => {
        const turns = { 'Manhã (6–14h)': { laudos: 0, produzida: 0, escolha: 0, refugo: 0 }, 'Tarde (14–22h)': { laudos: 0, produzida: 0, escolha: 0, refugo: 0 }, 'Noite (22–6h)': { laudos: 0, produzida: 0, escolha: 0, refugo: 0 } } as Record<string, { laudos: number; produzida: number; escolha: number; refugo: number }>;
        filtered.forEach(r => {
            const h = r.date.getHours();
            const key = h >= 6 && h < 14 ? 'Manhã (6–14h)' : h >= 14 && h < 22 ? 'Tarde (14–22h)' : 'Noite (22–6h)';
            turns[key].laudos++;
            turns[key].produzida += r.qtyProduzida;
            turns[key].escolha   += r.qtyEscolha;
            turns[key].refugo    += r.qtyRefugo;
        });
        return Object.entries(turns).map(([turno, v]) => ({ turno, ...v }));
    }, [filtered]);

    // ── Por operador ────────────────────────────────────────────────────────
    const byOperator = useMemo(() => {
        const map = new Map<string, { laudos: number; refugo: number; escolha: number; topDefect: string }>();
        filtered.forEach(r => {
            const ids = r.operatorIds.length > 0 ? r.operatorIds : ['_sem'];
            ids.forEach(id => {
                const cur = map.get(id) || { laudos: 0, refugo: 0, escolha: 0, topDefect: '' };
                cur.laudos++;
                cur.refugo  += r.qtyRefugo;
                cur.escolha += r.qtyEscolha;
                // top defect
                const top = (Object.entries(r.defects) as [string, number][])
                    .sort((a, b) => b[1] - a[1])[0];
                if (top) cur.topDefect = top[0];
                map.set(id, cur);
            });
        });
        return Array.from(map.entries())
            .map(([id, v]) => ({ id, name: id === '_sem' ? 'Sem operador' : (opNames[id] || 'Desconhecido'), ...v }))
            .sort((a, b) => b.refugo - a.refugo || b.escolha - a.escolha)
            .slice(0, 15);
    }, [filtered, opNames]);

    // ── Por máquina ─────────────────────────────────────────────────────────
    const byMachine = useMemo(() => {
        const map = new Map<string, { name: string; laudos: number; refugo: number; escolha: number; topDefect: string }>();
        filtered.forEach(r => {
            const key = r.machineId || '_sem';
            const cur = map.get(key) || { name: r.machineName, laudos: 0, refugo: 0, escolha: 0, topDefect: '' };
            cur.laudos++;
            cur.refugo  += r.qtyRefugo;
            cur.escolha += r.qtyEscolha;
            const top = (Object.entries(r.defects) as [string, number][])
                .sort((a, b) => b[1] - a[1])[0];
            if (top) cur.topDefect = top[0];
            map.set(key, cur);
        });
        return Array.from(map.values())
            .sort((a, b) => b.refugo - a.refugo || b.escolha - a.escolha)
            .slice(0, 10);
    }, [filtered]);

    // ── Exportação CSV ──────────────────────────────────────────────────────
    const exportCSV = () => {
        const header = ['OP','Data','Área','Máquina','Operadores','Qtd.Produzida','Em Escolha','Refugo','% Refugo','Status','Total Defeitos'];
        const rows = filtered.map(r => [
            r.op,
            r.date.toLocaleDateString('pt-BR'),
            r.area === 'inicial' ? 'Processo Inicial' : 'Produto Acabado',
            r.machineName,
            r.operatorIds.map(id => opNames[id] || id).join(' / '),
            r.qtyProduzida,
            r.qtyEscolha,
            r.qtyRefugo,
            r.qtyProduzida > 0 ? ((r.qtyRefugo / r.qtyProduzida) * 100).toFixed(2) + '%' : '0%',
            r.status,
            Object.values(r.defects).reduce<number>((s, v) => s + Number(v), 0),
        ]);
        const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `qualidade_${period}_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <span className="material-symbols-outlined animate-spin text-3xl text-slate-400">progress_activity</span>
        </div>
    );

    const PERIOD_OPTS: Array<{ v: Period; l: string }> = [
        { v: 'week', l: '7 dias' }, { v: 'month', l: '30 dias' },
        { v: 'quarter', l: '90 dias' }, { v: 'all', l: 'Tudo' },
    ];

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5 pb-10 animate-fade-in">

            {/* Header */}
            <header className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-500">query_stats</span>
                            Painel de Qualidade
                        </h1>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                            Refugo · Escolha · Pareto · Turno · Por Operador · Por Máquina
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {/* Período */}
                        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-9">
                            {PERIOD_OPTS.map(o => (
                                <button key={o.v} type="button" onClick={() => setPeriod(o.v)}
                                    className={`px-4 text-[10px] font-black uppercase tracking-widest transition-colors ${period === o.v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                    {o.l}
                                </button>
                            ))}
                        </div>
                        {/* Área */}
                        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-9">
                            {([['all', 'Todos'], ['inicial', 'Processo Inicial'], ['acabado', 'Produto Acabado']] as const).map(([v, l]) => (
                                <button key={v} type="button" onClick={() => setAreaTab(v)}
                                    className={`px-4 text-[10px] font-black uppercase tracking-widest transition-colors ${areaTab === v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                    {l}
                                </button>
                            ))}
                        </div>
                        {/* Exportar CSV */}
                        <button type="button" onClick={exportCSV}
                            className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors">
                            <span className="material-symbols-outlined text-sm">download</span>CSV
                        </button>
                        {/* Meta */}
                        <button type="button" onClick={() => setShowTargetConfig(v => !v)}
                            className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors">
                            <span className="material-symbols-outlined text-sm">target</span>Meta {qualityTarget}%
                        </button>
                    </div>
                </div>
                {/* Configurador de meta */}
                {showTargetConfig && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Meta de aprovação</span>
                        <input type="range" min={50} max={100} step={1} value={qualityTarget}
                            onChange={e => { const v = Number(e.target.value); setQualityTarget(v); localStorage.setItem('kg_quality_target', String(v)); }}
                            className="flex-1 accent-indigo-600" />
                        <span className="text-sm font-black text-indigo-600 w-12 text-right">{qualityTarget}%</span>
                    </div>
                )}
            </header>

            {/* Cards de totais */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {/* Laudos */}
                <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-4 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                        OPs no período
                    </p>
                    <p className="text-3xl font-black text-indigo-700 dark:text-indigo-300">{fmt.format(totals.laudos)}</p>
                    <p className="text-[9px] text-indigo-400 font-bold">{totals.registros} registros</p>
                </div>
                {/* Total produzido */}
                <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">inventory_2</span>
                        Total Produzido
                    </p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{fmt.format(totals.produzida)}</p>
                </div>
                {/* Em escolha */}
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">rule</span>
                        Em Escolha
                    </p>
                    <p className="text-3xl font-black text-amber-700 dark:text-amber-300">{fmt.format(totals.escolha)}</p>
                    <p className="text-[10px] font-bold text-amber-500">{fmtPct(totals.escolha, totals.produzida)} do total</p>
                </div>
                {/* Refugo */}
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">delete_sweep</span>
                        Refugo
                    </p>
                    <p className="text-3xl font-black text-rose-700 dark:text-rose-300">{fmt.format(totals.refugo)}</p>
                    <p className="text-[10px] font-bold text-rose-500">{fmtPct(totals.refugo, totals.produzida)} do total</p>
                </div>
                {/* Taxa aprovação vs meta */}
                {(() => {
                    const ok = taxaAprovacao >= qualityTarget;
                    return (
                        <div className={`rounded-2xl p-4 space-y-2 border ${ok ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900' : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'}`}>
                            <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${ok ? 'text-emerald-600' : 'text-rose-500'}`}>
                                <span className="material-symbols-outlined text-sm">target</span>
                                Aprov. vs Meta
                            </p>
                            <p className={`text-3xl font-black ${ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{taxaAprovacao.toFixed(1)}%</p>
                            <div className="h-1.5 rounded-full bg-white/60 dark:bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(taxaAprovacao, 100)}%` }} />
                            </div>
                            <p className={`text-[10px] font-bold ${ok ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {ok ? '✓ Acima' : '✗ Abaixo'} da meta de {qualityTarget}%
                            </p>
                        </div>
                    );
                })()}
            </div>

            {/* Defeitos + Operadores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Pareto de defeitos */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-rose-500">emergency_home</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Pareto de Defeitos</h2>
                        <span className="ml-auto text-[9px] font-bold text-slate-400">Top 10 · % acumulada</span>
                    </div>
                    {paretoData.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">Nenhum defeito registrado no período</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <ComposedChart data={paretoData} margin={{ top: 4, right: 24, left: 0, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                                <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} angle={-35} textAnchor="end" interval={0} />
                                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9, fill: '#6366f1' }} />
                                <Tooltip formatter={(value: any, name: string) => name === 'pct' ? `${value}%` : value} labelStyle={{ fontSize: 11, fontWeight: 700 }} />
                                <Bar yAxisId="left" dataKey="count" name="Ocorrências" radius={[4,4,0,0]}>
                                    {paretoData.map((_, i) => (
                                        <Cell key={i} fill={i === 0 ? '#f43f5e' : i === 1 ? '#f59e0b' : i === 2 ? '#fb923c' : '#94a3b8'} />
                                    ))}
                                </Bar>
                                <Line yAxisId="right" type="monotone" dataKey="pct" name="% Acum." stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Por operador */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-500">badge</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Por Operador</h2>
                    </div>
                    {byOperator.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">Sem dados de operadores</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[400px] text-left">
                                <thead>
                                    <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                        <th className="pb-2">Operador</th>
                                        <th className="pb-2 text-center">Registros</th>
                                        <th className="pb-2 text-right text-amber-500">Escolha</th>
                                        <th className="pb-2 text-right text-rose-500">Refugo</th>
                                        <th className="pb-2 text-right">Top Problema</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byOperator.map(op => (
                                        <tr key={op.id} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                                            <td className="py-2 pr-3 text-sm font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{op.name}</td>
                                            <td className="py-2 text-center text-xs font-bold text-slate-400">{op.laudos}</td>
                                            <td className="py-2 text-right text-sm font-black text-amber-600">{fmt.format(op.escolha)}</td>
                                            <td className="py-2 text-right text-sm font-black text-rose-600">{fmt.format(op.refugo)}</td>
                                            <td className="py-2 text-right text-[10px] font-bold text-slate-400 capitalize truncate max-w-[100px]">{op.topDefect ? op.topDefect.replace(/_/g, ' ') : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Comparativo por turno */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-violet-500">schedule</span>
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Comparativo por Turno</h2>
                    <span className="ml-auto text-[9px] font-bold text-slate-400">Manhã · Tarde · Noite</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {byTurno.map(t => {
                        const pctRefugo = t.produzida > 0 ? ((t.refugo / t.produzida) * 100) : 0;
                        const pctEscolha = t.produzida > 0 ? ((t.escolha / t.produzida) * 100) : 0;
                        return (
                            <div key={t.turno} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">{t.turno}</p>
                                    <span className="text-[9px] font-bold text-slate-400">{t.laudos} reg.</span>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span className="text-slate-500">Produzido</span>
                                        <span className="text-slate-700 dark:text-slate-200 font-black">{fmt.format(t.produzida)}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span className="text-amber-500">Escolha</span>
                                        <span className="text-amber-700 font-black">{fmt.format(t.escolha)} <span className="text-amber-400 font-bold">({pctEscolha.toFixed(1)}%)</span></span>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span className="text-rose-500">Refugo</span>
                                        <span className="text-rose-700 font-black">{fmt.format(t.refugo)} <span className="text-rose-400 font-bold">({pctRefugo.toFixed(1)}%)</span></span>
                                    </div>
                                </div>
                                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.min(pctRefugo * 5, 100)}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Por máquina */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-500">precision_manufacturing</span>
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Por Máquina</h2>
                </div>
                {byMachine.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Sem dados de máquinas</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px] text-left">
                            <thead>
                                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                    <th className="pb-2">Máquina</th>
                                    <th className="pb-2 text-center">Registros</th>
                                    <th className="pb-2 text-right text-amber-500">Total Escolha</th>
                                    <th className="pb-2 text-right text-rose-500">Total Refugo</th>
                                    <th className="pb-2 text-right text-rose-400">% Refugo</th>
                                    <th className="pb-2 text-right">Top Problema</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byMachine.map(m => {
                                    const totalM = filtered.filter(r => r.machineId === byMachine.find(x => x.name === m.name)?.name || r.machineName === m.name)
                                        .reduce((s, r) => s + r.qtyProduzida, 0);
                                    return (
                                        <tr key={m.name} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                                            <td className="py-2.5 pr-3">
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{m.name}</span>
                                            </td>
                                            <td className="py-2.5 text-center text-xs font-bold text-slate-400">{m.laudos}</td>
                                            <td className="py-2.5 text-right text-sm font-black text-amber-600">{fmt.format(m.escolha)}</td>
                                            <td className="py-2.5 text-right text-sm font-black text-rose-600">{fmt.format(m.refugo)}</td>
                                            <td className="py-2.5 text-right">
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.refugo > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                                    {fmtPct(m.refugo, filtered.filter(r => r.machineName === m.name).reduce((s, r) => s + r.qtyProduzida, 0))}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-right text-[10px] font-bold text-slate-400 capitalize">{m.topDefect ? m.topDefect.replace(/_/g, ' ') : '—'}</td>
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

