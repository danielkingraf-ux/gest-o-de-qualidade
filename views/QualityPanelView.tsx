/**
 * QualityPanelView — Painel de Qualidade para Supervisão
 * Refugo · Escolha · Por Operador · Por Máquina · Ranking de Defeitos
 */
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { normalizeDefectLabel, toDefectEntry } from '../utils/defects';

// ─── Tipos internos ───────────────────────────────────────────────────────────
type Period = 'week' | 'month' | 'quarter' | 'all';

interface NormalizedRecord {
    id: string;
    op: string;
    date: Date;
    area: 'inicial' | 'acabado';
    process: string;
    turno: string;
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
            Object.entries(obs.defects).forEach(([k, v]) => {
                const entry = toDefectEntry(k, v);
                if (entry) defMap[entry.name] = entry.count;
            });
        } else if (obs.defeitos?.por_unidade) {
            Object.entries(obs.defeitos.por_unidade).forEach(([k, v]: [string, any]) => {
                const entry = toDefectEntry(k, v);
                if (entry) defMap[entry.name] = entry.count;
            });
            // UV e HS
            if (obs.verniz_uv?.aplicavel && obs.verniz_uv?.defeitos)
                Object.entries(obs.verniz_uv.defeitos).forEach(([k, v]: [string, any]) => {
                    const entry = toDefectEntry(k, v);
                    if (entry) defMap[`UV: ${entry.name}`] = entry.count;
                });
            if (obs.hot_stamping?.aplicavel && obs.hot_stamping?.defeitos)
                Object.entries(obs.hot_stamping.defeitos).forEach(([k, v]: [string, any]) => {
                    const entry = toDefectEntry(k, v);
                    if (entry) defMap[`HS: ${entry.name}`] = entry.count;
                });
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
            process: isAcabado ? 'Produto Acabado' : 'Impressão',
            turno: String(obs.turno || obs.shift || 'Sem turno'),
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
    const [loading, setLoading]   = useState(true);
    const [records, setRecords]   = useState<NormalizedRecord[]>([]);
    const [opNames, setOpNames]   = useState<Record<string, string>>({});
    const [period, setPeriod]     = useState<Period>('month');
    const [areaTab, setAreaTab]   = useState<'all' | 'inicial' | 'acabado'>('all');
    const [palletRecs, setPalletRecs] = useState<any[]>([]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const [insRes, opRes, colRes, machRes, palRes] = await Promise.all([
                supabase.from('inspections')
                    .select('id, op, created_at, status, machine_id, operator_id, observations, machines(name)')
                    .order('created_at', { ascending: false })
                    .limit(1000),
                supabase.from('operators').select('id, name'),
                supabase.from('acabamento_registros')
                    .select('id, op, timestamp, machine_id, operator_ids, qty_revisadas, qty_reprovadas, defects')
                    .in('modulo', ['corte_vinco', 'colagem', 'revisao_final'])
                    .order('timestamp', { ascending: false })
                    .limit(500),
                supabase.from('machines').select('id, name'),
                supabase.from('pallet_inspections')
                    .select('op, pallet_number, result, completed_at, units_per_box, boxes_per_pallet')
                    .is('archived_at', null)
                    .order('pallet_number', { ascending: true })
                    .limit(1000),
            ]);

            setPalletRecs(palRes.data || []);

            const names: Record<string, string> = {};
            (opRes.data || []).forEach((o: any) => { names[o.id] = o.name; });
            setOpNames(names);

            const machNames: Record<string, string> = {};
            (machRes.data || []).forEach((m: any) => { machNames[m.id] = m.name; });

            const inspRecs = normalize(insRes.data || []);

            // Normaliza registros de colagem para o formato NormalizedRecord
            const colagemRecs: NormalizedRecord[] = (colRes.data || []).map((r: any) => {
                const defRaw = r.defects || {};
                const isRevisao = r.modulo === 'revisao_final';
                const defMap: Record<string, number> = {};
                if (!isRevisao) {
                    // Corte/Vinco e Colagem: defects é map de contagem de defeitos
                    Object.entries(defRaw).forEach(([k, v]) => {
                        if (['qty_refugo', 'turno', 'session_status'].includes(k)) return;
                        const entry = toDefectEntry(k, v);
                        if (entry) defMap[entry.name] = entry.count;
                    });
                }

                // Refugo: revisão final salva em quantidade_refugada_revisao
                const qtyRefugo = isRevisao
                    ? asN(defRaw.quantidade_refugada_revisao)
                    : asN(defRaw.qty_refugo);

                // Produzido: revisão final tem quantidade_enviada_revisao (para contexto)
                const qtyProduzida = isRevisao ? asN(defRaw.quantidade_enviada_revisao) : asN(r.qty_revisadas);

                // Operadores: revisão final pode ter operator_ids vazio — puxar dos problemas
                let operatorIds: string[] = Array.isArray(r.operator_ids) ? r.operator_ids.filter(Boolean) : [];
                // Se revisão final sem operador, não gerar registro fantasma: pular
                if (isRevisao && operatorIds.length === 0 && qtyRefugo === 0 && qtyProduzida === 0) {
                    return null; // será filtrado abaixo
                }

                return {
                    id: `col_${r.id}`,
                    op: String(r.op || '—'),
                    date: new Date(r.timestamp || r.created_at),
                    area: 'acabado' as const,
                    process: r.modulo === 'corte_vinco' ? 'Corte/Vinco' : isRevisao ? 'Revisão Final' : 'Colagem',
                    turno: String(defRaw.turno || 'Sem turno'),
                    status: isRevisao ? String(defRaw.status_final || 'APPROVED') : 'APPROVED',
                    machineName: machNames[r.machine_id] || '—',
                    machineId: String(r.machine_id || ''),
                    operatorIds,
                    defects: defMap,
                    qtyProduzida,
                    qtyEscolha: isRevisao ? 0 : asN(r.qty_reprovadas),
                    qtyRefugo,
                };
            }).filter((r: any): r is NormalizedRecord => r !== null && !isNaN(new Date(r?.date).getTime()));

            setRecords([...inspRecs, ...colagemRecs]);
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
            // Quando exibindo ambas as áreas, não somar produto acabado para produzida e escolha:
            // - qtyProduzida: a OP tem UMA quantidade (a do processo inicial)
            // - qtyEscolha: o em_escolha do acabado é subconjunto do em_escolha da impressão
            // - qtyRefugo: é aditivo — diferentes peças refugadas em etapas distintas
            if (areaTab !== 'all' || r.area === 'inicial') {
                produzida += r.qtyProduzida;
                escolha   += r.qtyEscolha;
            }
            refugo += r.qtyRefugo;
        });
        return { laudos: opsSet.size, registros, produzida, escolha, refugo };
    }, [filtered, areaTab]);

    // ── Ranking de defeitos ─────────────────────────────────────────────────
    const defectRanking = useMemo(() => {
        const map = new Map<string, number>();
        filtered.forEach(r => {
            (Object.entries(r.defects) as [string, number][])
                .forEach(([k, v]) => {
                    const name = normalizeDefectLabel(k);
                    map.set(name, (map.get(name) || 0) + v);
                });
        });
        return Array.from(map.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 12);
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

    const byProcess = useMemo(() => {
        const map = new Map<string, { processo: string; defeitos: number; escolha: number; refugo: number }>();
        filtered.forEach(r => {
            const cur = map.get(r.process) || { processo: r.process, defeitos: 0, escolha: 0, refugo: 0 };
            cur.defeitos += Object.values(r.defects).reduce<number>((s, v) => s + asN(v), 0);
            cur.escolha += r.qtyEscolha;
            cur.refugo += r.qtyRefugo;
            map.set(r.process, cur);
        });
        return Array.from(map.values()).sort((a, b) => (b.defeitos + b.escolha + b.refugo) - (a.defeitos + a.escolha + a.refugo));
    }, [filtered]);

    const byTurno = useMemo(() => {
        const map = new Map<string, { turno: string; defeitos: number; escolha: number; refugo: number }>();
        filtered.forEach(r => {
            const cur = map.get(r.turno) || { turno: r.turno, defeitos: 0, escolha: 0, refugo: 0 };
            cur.defeitos += Object.values(r.defects).reduce<number>((s, v) => s + asN(v), 0);
            cur.escolha += r.qtyEscolha;
            cur.refugo += r.qtyRefugo;
            map.set(r.turno, cur);
        });
        return Array.from(map.values()).sort((a, b) => (b.defeitos + b.escolha + b.refugo) - (a.defeitos + a.escolha + a.refugo));
    }, [filtered]);

    const riskOps = useMemo(() => {
        const map = new Map<string, { op: string; escolha: number; refugo: number; processos: Set<string>; latest: Date }>();
        filtered.forEach(r => {
            if (r.qtyEscolha <= 0 && r.qtyRefugo <= 0) return;
            const cur = map.get(r.op) || { op: r.op, escolha: 0, refugo: 0, processos: new Set<string>(), latest: r.date };
            cur.escolha += r.qtyEscolha;
            cur.refugo += r.qtyRefugo;
            cur.processos.add(r.process);
            if (r.date > cur.latest) cur.latest = r.date;
            map.set(r.op, cur);
        });
        return Array.from(map.values()).sort((a, b) => (b.escolha + b.refugo) - (a.escolha + a.refugo)).slice(0, 12);
    }, [filtered]);

    const rejectedPalletOps = useMemo(() => {
        const map = new Map<string, { op: string; reprovados: number; restritos: number; latest: string }>();
        palletRecs.forEach((p: any) => {
            if (p.result !== 'REJECTED' && p.result !== 'RESTRICTED') return;
            const op = String(p.op || '').trim().toUpperCase();
            if (!op) return;
            const cur = map.get(op) || { op, reprovados: 0, restritos: 0, latest: '' };
            if (p.result === 'REJECTED') cur.reprovados++;
            if (p.result === 'RESTRICTED') cur.restritos++;
            if (!cur.latest || p.completed_at > cur.latest) cur.latest = p.completed_at;
            map.set(op, cur);
        });
        return Array.from(map.values()).sort((a, b) => b.reprovados - a.reprovados || b.latest.localeCompare(a.latest)).slice(0, 10);
    }, [palletRecs]);

    const pendingReviewQty = riskOps.reduce((s, op) => s + op.escolha, 0);
    const defectIncreaseAlerts = defectRanking.slice(0, 3).filter(d => d.count > Math.max(10, totals.registros * 2));

    // ── Status de pallets por OP ────────────────────────────────────────────
    const palletsByOp = useMemo(() => {
        type PalletItem = { pallet_number: number; result: string };
        type PalletOp = {
            op: string; inspecionados: number; aprovados: number;
            reprovados: number; restritos: number; currentPallet: number;
            palletLotSize: number; latestDate: string; pallets: PalletItem[];
            qtyProduzida: number; totalExpected: number | null; faltam: number | null;
        };
        const map = new Map<string, PalletOp>();
        palletRecs.forEach((r: any) => {
            const op = String(r.op || '').trim().toUpperCase();
            if (!op) return;
            const cur = map.get(op) ?? { op, inspecionados: 0, aprovados: 0, reprovados: 0, restritos: 0, currentPallet: 0, palletLotSize: 0, latestDate: '', pallets: [], qtyProduzida: 0, totalExpected: null, faltam: null };
            cur.inspecionados++;
            cur.pallets.push({ pallet_number: r.pallet_number, result: r.result });
            if (r.result === 'APPROVED') cur.aprovados++;
            else if (r.result === 'REJECTED') cur.reprovados++;
            else cur.restritos++;
            cur.currentPallet = Math.max(cur.currentPallet, r.pallet_number);
            cur.palletLotSize = (r.units_per_box || 0) * (r.boxes_per_pallet || 0);
            if (!cur.latestDate || r.completed_at > cur.latestDate) cur.latestDate = r.completed_at;
            map.set(op, cur);
        });
        return Array.from(map.values()).map(p => {
            const opRecs = records.filter(r => r.op.toUpperCase() === p.op && r.area === 'inicial');
            const qtyProduzida = opRecs.reduce((s, r) => s + r.qtyEscolha, 0);
            const totalExpected = p.palletLotSize > 0 && qtyProduzida > 0 ? Math.ceil(qtyProduzida / p.palletLotSize) : null;
            const faltam = totalExpected !== null ? Math.max(0, totalExpected - p.inspecionados) : null;
            return { ...p, qtyProduzida, totalExpected, faltam };
        }).sort((a, b) => b.latestDate.localeCompare(a.latestDate)).slice(0, 30);
    }, [palletRecs, records]);

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
                            Refugo · Escolha · Por Operador · Por Máquina · Defeitos
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
                    </div>
                </div>
            </header>

            {/* Cards de totais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-rose-500">priority_high</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">OPs em risco de não fechar</h2>
                    </div>
                    {riskOps.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Nenhuma OP em risco no filtro</p> : (
                        <div className="space-y-2">
                            {riskOps.map(op => (
                                <div key={op.op} className="rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-black text-slate-900 dark:text-white">OP {op.op}</span>
                                        <span className="text-[10px] font-black text-rose-600">{fmt.format(op.escolha + op.refugo)} un.</span>
                                    </div>
                                    <p className="mt-1 text-[10px] font-bold text-rose-500">Escolha {fmt.format(op.escolha)} · Refugo {fmt.format(op.refugo)} · {[...op.processos].join(', ')}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500">stacks</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Pallets reprovados no NQA</h2>
                    </div>
                    {rejectedPalletOps.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Sem pallets reprovados/restritos</p> : (
                        <div className="space-y-2">
                            {rejectedPalletOps.map(op => (
                                <div key={op.op} className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3">
                                    <span className="text-sm font-black text-slate-900 dark:text-white">OP {op.op}</span>
                                    <span className="text-[10px] font-black text-rose-600">{op.reprovados} reprov. · {op.restritos} restr.</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500">manage_search</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Aguardando revisão</h2>
                    </div>
                    <p className="text-4xl font-black text-amber-700 dark:text-amber-300">{fmt.format(pendingReviewQty)}</p>
                    <p className="text-xs font-bold text-slate-400">Quantidade em escolha aguardando ação da Revisão Final</p>
                    {defectIncreaseAlerts.length > 0 && (
                        <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 p-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Alertas de aumento de defeito</p>
                            <p className="mt-1 text-xs font-bold text-rose-700 dark:text-rose-300">{defectIncreaseAlerts.map(d => d.name).join(', ')}</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">account_tree</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Defeitos reais por processo</h2>
                    </div>
                    <div className="space-y-2">
                        {byProcess.map(p => (
                            <div key={p.processo} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3">
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{p.processo}</span>
                                <span className="text-[10px] font-black text-slate-500">Def. {fmt.format(p.defeitos)} · Esc. {fmt.format(p.escolha)} · Ref. {fmt.format(p.refugo)}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">schedule</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Defeitos por turno</h2>
                    </div>
                    <div className="space-y-2">
                        {byTurno.map(t => (
                            <div key={t.turno} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3">
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.turno}</span>
                                <span className="text-[10px] font-black text-slate-500">Def. {fmt.format(t.defeitos)} · Esc. {fmt.format(t.escolha)} · Ref. {fmt.format(t.refugo)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Pallets por OP */}
            {palletsByOp.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">stacks</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Pallets em andamento</h2>
                        <span className="ml-auto text-[9px] font-bold text-slate-400">{palletsByOp.length} OP{palletsByOp.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-3">
                        {palletsByOp.map(p => {
                            const total = Math.max(p.totalExpected ?? p.currentPallet + 1, p.currentPallet + 1);
                            const nums = Array.from({ length: total }, (_, i) => i + 1);
                            const nextNum = p.currentPallet + 1;
                            return (
                                <div key={p.op} className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
                                    {/* Cabeçalho do card */}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="text-sm font-black text-slate-900 dark:text-white">OP {p.op}</span>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black">
                                            <span className="material-symbols-outlined text-[11px]">radio_button_checked</span>
                                            Analisando #{nextNum}
                                        </span>
                                        {p.faltam !== null && p.faltam > 0 && (
                                            <span className="text-[10px] font-black text-amber-600">
                                                {p.inspecionados}/{p.totalExpected} — faltam {p.faltam}
                                            </span>
                                        )}
                                        {p.faltam === 0 && (
                                            <span className="text-[10px] font-black text-emerald-600">✓ Todos analisados</span>
                                        )}
                                        <span className="ml-auto text-[10px] text-slate-400">{new Date(p.latestDate).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    {/* Grade de pallets */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {nums.map(num => {
                                            const saved = p.pallets.find(pl => pl.pallet_number === num);
                                            const isCurrent = num === nextNum;
                                            let cls = '';
                                            let icon = '';
                                            if (saved) {
                                                if (saved.result === 'APPROVED')    { cls = 'bg-emerald-500 border-emerald-500 text-white'; icon = 'check'; }
                                                else if (saved.result === 'RESTRICTED') { cls = 'bg-amber-400 border-amber-400 text-white'; icon = 'warning'; }
                                                else                                { cls = 'bg-rose-500 border-rose-500 text-white'; icon = 'close'; }
                                            } else if (isCurrent) {
                                                cls = 'bg-indigo-600 border-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-700 ring-offset-1 animate-pulse';
                                            } else {
                                                cls = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400';
                                            }
                                            return (
                                                <div key={num} title={saved ? `#${num}: ${saved.result === 'APPROVED' ? 'Aprovado' : saved.result === 'RESTRICTED' ? 'Restrição' : 'Reprovado'}` : isCurrent ? `#${num}: em andamento` : `#${num}: pendente`}
                                                    className={`flex flex-col items-center justify-center w-10 h-10 rounded-xl border-2 select-none transition-all ${cls}`}>
                                                    <span className="text-[9px] font-black leading-none">#{num}</span>
                                                    {icon && <span className="material-symbols-outlined text-[11px] leading-none mt-0.5">{icon}</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Legenda compacta */}
                                    <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                                        {p.aprovados > 0  && <span className="text-[10px] font-bold text-emerald-600">✓ {p.aprovados} aprov.</span>}
                                        {p.restritos > 0  && <span className="text-[10px] font-bold text-amber-500">⚠ {p.restritos} restr.</span>}
                                        {p.reprovados > 0 && <span className="text-[10px] font-bold text-rose-500">✗ {p.reprovados} reprov.</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Defeitos + Operadores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Ranking de defeitos */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-rose-500">emergency_home</span>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Ranking de Problemas</h2>
                        <span className="ml-auto text-[9px] font-bold text-slate-400">{totals.laudos} OPs · {totals.registros} registros</span>
                    </div>
                    {defectRanking.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">Nenhum defeito registrado no período</p>
                    ) : (
                        <div className="space-y-2">
                            {defectRanking.map((d, i) => (
                                <div key={d.name} className="flex items-center gap-3">
                                    <span className={`text-[10px] font-black w-4 text-right ${i === 0 ? 'text-rose-500' : i === 1 ? 'text-amber-500' : 'text-slate-400'}`}>{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate capitalize">{d.name.replace(/_/g, ' ')}</span>
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

