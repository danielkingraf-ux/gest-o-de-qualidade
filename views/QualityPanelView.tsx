/**
 * QualityPanelView — Painel de Qualidade para Supervisão
 * Fontes: inspections (processo inicial + produto acabado) + acabamento_registros (corte e vinco)
 * Métricas: Refugo · Escolha · Por Operador · Por Máquina · Ranking de Defeitos
 */
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Period = 'week' | 'month' | 'quarter' | 'all';
type AreaKey = 'all' | 'inicial' | 'corte_vinco' | 'acabado';

interface NormalizedRecord {
    id: string;
    op: string;
    date: Date;
    area: 'inicial' | 'corte_vinco' | 'acabado';
    status: string;
    machineName: string;
    machineId: string;
    operatorIds: string[];
    defects: Record<string, number>;
    qtyProduzida: number;
    qtyEscolha: number;
    qtyRefugo: number;
    isColagem?: boolean;
}

const asN = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const parseObs = (v: any): any => {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return {}; }
};

// Defeitos das inspeções (processo inicial + produto acabado via pallet_inspections + colagem)
function normalizeInspections(
    raw: any[],
    palletDefectsByOp: Map<string, Record<string, number>>,
    machNames: Record<string, string>
): NormalizedRecord[] {
    const result: NormalizedRecord[] = [];

    for (const r of raw) {
        const obs = parseObs(r.observations);
        const isAcabado = obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis;
        const prod = obs.producao || {};
        const defMap: Record<string, number> = {};

        if (isAcabado) {
            const palletDefs = palletDefectsByOp.get(String(r.op || '').toUpperCase()) || {};
            Object.entries(palletDefs).forEach(([k, v]) => {
                const n = asN(v);
                if (n > 0) defMap[k.replace(/_/g, ' ')] = (defMap[k.replace(/_/g, ' ')] || 0) + n;
            });
        } else {
            if (obs.defeitos?.por_unidade) {
                Object.entries(obs.defeitos.por_unidade).forEach(([k, v]: [string, any]) => {
                    const n = asN(typeof v === 'object' ? v?.count : v);
                    if (n > 0) defMap[k.replace(/_/g, ' ')] = n;
                });
            }
            if (obs.verniz_uv?.aplicavel && obs.verniz_uv?.defeitos) {
                Object.entries(obs.verniz_uv.defeitos).forEach(([k, v]: [string, any]) => {
                    const n = asN(v?.count ?? v);
                    if (n > 0) defMap[`UV: ${k.replace(/_/g, ' ')}`] = n;
                });
            }
            if (obs.hot_stamping?.aplicavel && obs.hot_stamping?.defeitos) {
                Object.entries(obs.hot_stamping.defeitos).forEach(([k, v]: [string, any]) => {
                    const n = asN(v?.count ?? v);
                    if (n > 0) defMap[`HS: ${k.replace(/_/g, ' ')}`] = n;
                });
            }
            if (obs.defeitos?.por_folha?.cor) {
                const n = asN(obs.defeitos.por_folha.cor);
                if (n > 0) defMap['cor'] = (defMap['cor'] || 0) + n;
            }
        }

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

        const date = new Date(r.created_at);
        if (isNaN(date.getTime())) continue;

        result.push({
            id: r.id,
            op: String(r.op || '—'),
            date,
            area: isAcabado ? 'acabado' as const : 'inicial' as const,
            status: String(r.status || ''),
            machineName: r.machines?.name || '—',
            machineId: String(r.machine_id || ''),
            operatorIds,
            defects: defMap,
            qtyProduzida,
            qtyEscolha,
            qtyRefugo,
        });

        // Registro virtual para colagem (operadores e máquina separados)
        if (isAcabado && obs.colagem) {
            const c = obs.colagem;
            const colagemOpIds: string[] = Array.isArray(c.operator_ids) ? c.operator_ids.filter(Boolean) : [];
            const colagemMachId = String(c.machine_id || '');
            const colagemMachName = c.machine_name || machNames[colagemMachId] || '—';
            if (colagemOpIds.length > 0 || colagemMachId) {
                const cDefMap: Record<string, number> = {};
                if (c.defects && typeof c.defects === 'object') {
                    Object.entries(c.defects).forEach(([k, v]) => {
                        const n = asN(v);
                        if (n > 0) cDefMap[k.replace(/_/g, ' ')] = n;
                    });
                }
                result.push({
                    id: `${r.id}_colagem`,
                    op: String(r.op || '—'),
                    date,
                    area: 'acabado',
                    status: 'COMPLETED',
                    machineName: colagemMachName,
                    machineId: colagemMachId,
                    operatorIds: colagemOpIds,
                    defects: cDefMap,
                    qtyProduzida: 0,
                    qtyEscolha: asN(c.qty_escolha),
                    qtyRefugo: asN(c.qty_reprovadas),
                    isColagem: true,
                });
            }
        }
    }

    return result;
}

// Defeitos do Corte e Vinco (acabamento_registros)
function normalizeCorteVinco(raw: any[]): NormalizedRecord[] {
    return raw.map(r => {
        const defMap: Record<string, number> = {};
        if (r.defects && typeof r.defects === 'object') {
            Object.entries(r.defects).forEach(([k, v]) => {
                const n = asN(v);
                if (n > 0) defMap[k.replace(/_/g, ' ')] = n;
            });
        }
        if (r.faca_defects && typeof r.faca_defects === 'object') {
            Object.entries(r.faca_defects).forEach(([k, v]) => {
                const n = asN(v);
                if (n > 0) defMap[`Faca ${k}`] = (defMap[`Faca ${k}`] || 0) + n;
            });
        }
        return {
            id: r.id,
            op: String(r.op || '—'),
            date: new Date(r.created_at),
            area: 'corte_vinco' as const,
            status: 'COMPLETED',
            machineName: r.machines?.name || '—',
            machineId: String(r.machine_id || ''),
            operatorIds: Array.isArray(r.operator_ids) ? r.operator_ids.filter(Boolean) : [],
            defects: defMap,
            qtyProduzida: asN(r.qty_revisadas),
            qtyEscolha: asN(r.qty_reprovadas),
            qtyRefugo: 0,
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

const AREA_LABELS: Record<string, string> = {
    inicial:    'Processo Inicial',
    corte_vinco:'Corte e Vinco',
    acabado:    'Produto Acabado',
};

// ─── Componente ───────────────────────────────────────────────────────────────
export default function QualityPanelView() {
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<NormalizedRecord[]>([]);
    const [opNames, setOpNames] = useState<Record<string, string>>({});
    const [period, setPeriod]   = useState<Period>('month');
    const [areaTab, setAreaTab] = useState<AreaKey>('all');

    useEffect(() => {
        (async () => {
            setLoading(true);
            const [insRes, acabRes, palletRes, opRes, machRes] = await Promise.all([
                supabase.from('inspections')
                    .select('id, op, created_at, status, machine_id, operator_id, observations, machines(name)')
                    .order('created_at', { ascending: false })
                    .limit(1000),
                supabase.from('acabamento_registros')
                    .select('id, op, created_at, modulo, machine_id, operator_ids, qty_revisadas, qty_aprovadas, qty_reprovadas, defects, faca_defects, machines(name)')
                    .eq('modulo', 'corte_vinco')
                    .order('created_at', { ascending: false })
                    .limit(1000),
                supabase.from('pallet_inspections')
                    .select('op, defects_detail')
                    .limit(5000),
                supabase.from('operators').select('id, name'),
                supabase.from('machines').select('id, name'),
            ]);

            // Mapa de nomes de operadores
            const names: Record<string, string> = {};
            (opRes.data || []).forEach((o: any) => { names[o.id] = o.name; });
            setOpNames(names);

            // Mapa de nomes de máquinas (para colagem que não tem join)
            const machNames: Record<string, string> = {};
            (machRes.data || []).forEach((m: any) => { machNames[m.id] = m.name; });

            // Agrega defeitos de pallet por OP
            const palletDefectsByOp = new Map<string, Record<string, number>>();
            (palletRes.data || []).forEach((pi: any) => {
                if (!pi.defects_detail || typeof pi.defects_detail !== 'object') return;
                const opKey = String(pi.op || '').toUpperCase();
                const existing = palletDefectsByOp.get(opKey) || {};
                Object.entries(pi.defects_detail as Record<string, number>).forEach(([k, v]) => {
                    existing[k] = (existing[k] || 0) + asN(v);
                });
                palletDefectsByOp.set(opKey, existing);
            });

            const insRecords  = normalizeInspections(insRes.data || [], palletDefectsByOp, machNames);
            const acabRecords = normalizeCorteVinco(acabRes.data || []);
            setRecords([...insRecords, ...acabRecords].sort((a, b) => b.date.getTime() - a.date.getTime()));
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
            if (!r.isColagem) registros++;
            opsSet.add(r.op);
            // Colagem não conta produzida (seria dupla contagem do produto acabado)
            if (!r.isColagem && (areaTab !== 'all' || r.area === 'inicial')) {
                produzida += r.qtyProduzida;
            }
            escolha += r.qtyEscolha;
            refugo  += r.qtyRefugo;
        });
        return { laudos: opsSet.size, registros, produzida, escolha, refugo };
    }, [filtered, areaTab]);

    // ── Ranking de defeitos ─────────────────────────────────────────────────
    const defectRanking = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach(r => {
            (Object.entries(r.defects) as [string, number][]).forEach(([k, v]) => map.set(k, (map.get(k) || 0) + v));
        });
        return Array.from(map.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);
    }, [filtered]);

    const maxDefect = defectRanking[0]?.count || 1;

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
                const top = (Object.entries(r.defects) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
                if (top) cur.topDefect = top[0];
                map.set(id, cur);
            });
        });
        return Array.from(map.entries())
            .map(([id, v]) => ({ id, name: id === '_sem' ? 'Sem operador' : (opNames[id] || 'Desconhecido'), ...v }))
            .sort((a, b) => b.escolha - a.escolha || b.refugo - a.refugo)
            .slice(0, 15);
    }, [filtered, opNames]);

    // ── Por máquina ─────────────────────────────────────────────────────────
    const byMachine = useMemo(() => {
        const map = new Map<string, { name: string; area: string; laudos: number; refugo: number; escolha: number; qtyTotal: number; topDefect: string }>();
        filtered.forEach(r => {
            const key = r.machineId || `_${r.machineName}`;
            const cur = map.get(key) || { name: r.machineName, area: r.area, laudos: 0, refugo: 0, escolha: 0, qtyTotal: 0, topDefect: '' };
            cur.laudos++;
            cur.refugo   += r.qtyRefugo;
            cur.escolha  += r.qtyEscolha;
            cur.qtyTotal += r.qtyProduzida;
            const top = (Object.entries(r.defects) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
            if (top) cur.topDefect = top[0];
            map.set(key, cur);
        });
        return Array.from(map.values())
            .sort((a, b) => b.escolha - a.escolha || b.refugo - a.refugo)
            .slice(0, 12);
    }, [filtered]);

    // ── Por área (resumo de registros por etapa) ──────────────────────────
    const byArea = useMemo(() => {
        const map = new Map<string, { count: number; escolha: number; refugo: number }>();
        records.forEach(r => {
            const start = getPeriodStart(period);
            if (start && r.date < start) return;
            const cur = map.get(r.area) || { count: 0, escolha: 0, refugo: 0 };
            cur.count++;
            cur.escolha += r.qtyEscolha;
            cur.refugo  += r.qtyRefugo;
            map.set(r.area, cur);
        });
        return map;
    }, [records, period]);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <span className="material-symbols-outlined animate-spin text-3xl text-slate-400">progress_activity</span>
        </div>
    );

    const PERIOD_OPTS: Array<{ v: Period; l: string }> = [
        { v: 'week', l: '7 dias' }, { v: 'month', l: '30 dias' },
        { v: 'quarter', l: '90 dias' }, { v: 'all', l: 'Tudo' },
    ];

    const AREA_TABS: Array<{ v: AreaKey; l: string; icon: string }> = [
        { v: 'all',         l: 'Todos',           icon: 'layers' },
        { v: 'inicial',     l: 'Proc. Inicial',    icon: 'print' },
        { v: 'corte_vinco', l: 'Corte e Vinco',    icon: 'content_cut' },
        { v: 'acabado',     l: 'Prod. Acabado',    icon: 'inventory_2' },
    ];

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5 pb-10 animate-fade-in">

            {/* Header */}
            <header className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-500">query_stats</span>
                                Painel de Qualidade
                            </h1>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                Processo Inicial · Corte e Vinco · Produto Acabado
                            </p>
                        </div>
                        {/* Período */}
                        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-9 self-start">
                            {PERIOD_OPTS.map(o => (
                                <button key={o.v} type="button" onClick={() => setPeriod(o.v)}
                                    className={`px-4 text-[10px] font-black uppercase tracking-widest transition-colors ${period === o.v ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                    {o.l}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tabs de área */}
                    <div className="flex flex-wrap gap-2">
                        {AREA_TABS.map(tab => {
                            const aData = byArea.get(tab.v === 'all' ? '' : tab.v);
                            const count = tab.v === 'all'
                                ? Array.from(byArea.values()).reduce((s: number, v) => s + (v as { count: number }).count, 0)
                                : (aData?.count ?? 0);
                            return (
                                <button key={tab.v} type="button" onClick={() => setAreaTab(tab.v)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${areaTab === tab.v ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'}`}>
                                    <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                                    {tab.l}
                                    {count > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${areaTab === tab.v ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{count}</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </header>

            {/* Cards de totais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-4 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                        OPs no período
                    </p>
                    <p className="text-3xl font-black text-indigo-700 dark:text-indigo-300">{fmt.format(totals.laudos)}</p>
                    <p className="text-[9px] text-indigo-400 font-bold">{totals.registros} registros</p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">inventory_2</span>
                        Total Produzido
                    </p>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{fmt.format(totals.produzida)}</p>
                    {areaTab === 'all' && <p className="text-[9px] text-slate-400 font-bold">Processo Inicial</p>}
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl p-4 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">rule</span>
                        Em Escolha
                    </p>
                    <p className="text-3xl font-black text-amber-700 dark:text-amber-300">{fmt.format(totals.escolha)}</p>
                    <p className="text-[10px] font-bold text-amber-500">{fmtPct(totals.escolha, totals.produzida)} do total</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">delete_sweep</span>
                        Refugo
                    </p>
                    <p className="text-3xl font-black text-rose-700 dark:text-rose-300">{fmt.format(totals.refugo)}</p>
                    <p className="text-[10px] font-bold text-rose-500">{fmtPct(totals.refugo, totals.produzida)} do total</p>
                </div>
            </div>

            {/* Resumo por etapa (só no modo Todos) */}
            {areaTab === 'all' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['inicial', 'corte_vinco', 'acabado'] as const).map(area => {
                        const d = byArea.get(area);
                        if (!d && area !== 'inicial') return null;
                        const aCount = d?.count ?? 0;
                        const aEscolha = d?.escolha ?? 0;
                        const aRefugo = d?.refugo ?? 0;
                        const icons: Record<string, string> = { inicial: 'print', corte_vinco: 'content_cut', acabado: 'inventory_2' };
                        const colors: Record<string, string> = { inicial: 'text-blue-500', corte_vinco: 'text-indigo-500', acabado: 'text-emerald-500' };
                        return (
                            <button key={area} onClick={() => setAreaTab(area)}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4 hover:border-indigo-300 transition-colors text-left">
                                <span className={`material-symbols-outlined text-2xl ${colors[area]}`}>{icons[area]}</span>
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{AREA_LABELS[area]}</p>
                                    <p className="text-xl font-black text-slate-800 dark:text-white">{aCount} <span className="text-sm font-bold text-slate-400">registros</span></p>
                                    <p className="text-[10px] font-bold text-slate-400">
                                        Escolha: <span className="text-amber-600">{fmt.format(aEscolha)}</span>
                                        {aRefugo > 0 && <> · Refugo: <span className="text-rose-600">{fmt.format(aRefugo)}</span></>}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Defeitos + Operadores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Ranking de defeitos */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-rose-500">emergency_home</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Ranking de Defeitos</h2>
                        <span className="ml-auto text-[9px] font-bold text-slate-400">{totals.registros} registros</span>
                    </div>
                    {defectRanking.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">Nenhum defeito registrado no período</p>
                    ) : (
                        <div className="space-y-2">
                            {defectRanking.map((d, i) => (
                                <div key={d.name} className="flex items-center gap-3">
                                    <span className={`text-[10px] font-black w-4 text-right shrink-0 ${i === 0 ? 'text-rose-500' : i === 1 ? 'text-amber-500' : 'text-slate-400'}`}>{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate capitalize">{d.name}</span>
                                            <span className="text-[10px] font-black text-slate-500 ml-2 shrink-0">{fmt.format(d.count)}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${i === 0 ? 'bg-rose-500' : i === 1 ? 'bg-amber-500' : i === 2 ? 'bg-orange-400' : 'bg-slate-400'}`}
                                                style={{ width: `${(d.count / maxDefect) * 100}%` }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
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
                                        <th className="pb-2 text-center">Reg.</th>
                                        <th className="pb-2 text-right text-amber-500">Escolha</th>
                                        <th className="pb-2 text-right text-rose-500">Refugo</th>
                                        <th className="pb-2 text-right">Top Defeito</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byOperator.map(op => (
                                        <tr key={op.id} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                                            <td className="py-2 pr-3 text-sm font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{op.name}</td>
                                            <td className="py-2 text-center text-xs font-bold text-slate-400">{op.laudos}</td>
                                            <td className="py-2 text-right text-sm font-black text-amber-600">{fmt.format(op.escolha)}</td>
                                            <td className="py-2 text-right text-sm font-black text-rose-600">{fmt.format(op.refugo)}</td>
                                            <td className="py-2 text-right text-[10px] font-bold text-slate-400 capitalize truncate max-w-[100px]">{op.topDefect || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Por máquina */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-500">precision_manufacturing</span>
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Por Máquina</h2>
                    {areaTab !== 'all' && (
                        <span className="ml-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{AREA_LABELS[areaTab]}</span>
                    )}
                </div>
                {byMachine.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Sem dados de máquinas</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px] text-left">
                            <thead>
                                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                    <th className="pb-2">Máquina</th>
                                    {areaTab === 'all' && <th className="pb-2">Etapa</th>}
                                    <th className="pb-2 text-center">Reg.</th>
                                    <th className="pb-2 text-right text-amber-500">Escolha</th>
                                    <th className="pb-2 text-right text-rose-500">Refugo</th>
                                    <th className="pb-2 text-right text-rose-400">% Refugo</th>
                                    <th className="pb-2 text-right">Top Defeito</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byMachine.map((m, idx) => (
                                    <tr key={idx} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                                        <td className="py-2.5 pr-3">
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{m.name}</span>
                                        </td>
                                        {areaTab === 'all' && (
                                            <td className="py-2.5 pr-3">
                                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{AREA_LABELS[m.area] || m.area}</span>
                                            </td>
                                        )}
                                        <td className="py-2.5 text-center text-xs font-bold text-slate-400">{m.laudos}</td>
                                        <td className="py-2.5 text-right text-sm font-black text-amber-600">{fmt.format(m.escolha)}</td>
                                        <td className="py-2.5 text-right text-sm font-black text-rose-600">{fmt.format(m.refugo)}</td>
                                        <td className="py-2.5 text-right">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.refugo > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                                {fmtPct(m.refugo, m.qtyTotal)}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-right text-[10px] font-bold text-slate-400 capitalize truncate max-w-[120px]">{m.topDefect || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
}
