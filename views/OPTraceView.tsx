/**
 * OPTraceView — Rastreabilidade completa de uma Ordem de Produção
 * Mostra do início ao fim: Processo Inicial → Produto Acabado → Pallets
 */
import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { toDefectEntry } from '../utils/defects';

// ─── helpers ─────────────────────────────────────────────────────────────────
const parseObs = (v: any): any => {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return {}; }
};
const asN = (v: any) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
const fmt = new Intl.NumberFormat('pt-BR');
const fmtDate = (s: string) =>
    new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
    APPROVED: { label: 'Aprovado',          dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    REJECTED: { label: 'Reprovado',         dot: 'bg-rose-500',    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
    RESTRICTED: { label: 'Com Restrição',   dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    approved: { label: 'Aprovado',          dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    rejected: { label: 'Reprovado',         dot: 'bg-rose-500',    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
    restricted: { label: 'Com Restrição',   dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};
const statusMeta = (s: string) => STATUS_META[s] ?? { label: s, dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' };

const Badge = ({ status }: { status: string }) => {
    const m = statusMeta(status);
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${m.badge}`}>
            <span className={`size-1.5 rounded-full ${m.dot}`} />
            {m.label}
        </span>
    );
};

// Extrai todos os defeitos do observations como array [{name, count}]
function extractDefects(obs: any): Array<{ name: string; count: number }> {
    const result: Array<{ name: string; count: number }> = [];

    const push = (key: string, val: any) => {
        const entry = toDefectEntry(key, typeof val === 'object' ? val?.count ?? val : val);
        if (entry) result.push(entry);
    };

    // Produto Acabado: obs.defects é Record<string, number>
    if (obs.defects && typeof obs.defects === 'object' && !Array.isArray(obs.defects)) {
        Object.entries(obs.defects).forEach(([k, v]) => push(k, v));
    }
    // Processo Inicial: obs.defeitos.por_unidade
    if (obs.defeitos?.por_unidade) {
        Object.entries(obs.defeitos.por_unidade).forEach(([k, v]) => push(k, v));
    }
    // UV
    if (obs.verniz_uv?.aplicavel && obs.verniz_uv?.defeitos) {
        Object.entries(obs.verniz_uv.defeitos).forEach(([k, v]: [string, any]) => {
            const entry = toDefectEntry(k, v?.count ?? v);
            if (entry) result.push({ name: `UV: ${entry.name}`, count: entry.count });
        });
    }
    // Hot Stamping
    if (obs.hot_stamping?.aplicavel && obs.hot_stamping?.defeitos) {
        Object.entries(obs.hot_stamping.defeitos).forEach(([k, v]: [string, any]) => {
            const entry = toDefectEntry(k, v?.count ?? v);
            if (entry) result.push({ name: `HS: ${entry.name}`, count: entry.count });
        });
    }

    return result.sort((a, b) => b.count - a.count);
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface InspRecord {
    id: string;
    created_at: string;
    status: string;
    area: 'inicial' | 'acabado';
    numero: string;
    machineName: string;
    operatorNames: string[];
    analystNames: string[];
    defects: Array<{ name: string; count: number }>;
    qtyProduzida: number;
    qtyEscolha: number;
    qtyRefugo: number;
    observacoes: string;
}

interface PalletRecord {
    id: string;
    pallet_number: number;
    result: 'APPROVED' | 'REJECTED' | 'RESTRICTED';
    completed_at: string;
    analyst_name: string | null;
    machine_name: string | null;
    defects_critical: number;
    defects_major: number;
    defects_minor: number;
    sample_size: number;
    boxes_to_inspect: number;
    observations: string | null;
}

interface OrderInfo {
    op: string;
    produto: string;
    qtd_total: number;
    status: string;
    created_at: string;
}

interface AcabRecord {
    id: string;
    modulo: string;
    timestamp: string;
    machineName: string;
    operatorNames: string[];
    qtyRevisadas: number;
    qtyAprovadas: number;
    qtyEscolha: number;
    qtyRefugo: number;
    defects: Record<string, number>;
    // Revisão Final extras
    recuperado: number;
    refugadoRevisao: number;
    custoRevisao: number;
    pessoas: number;
    horas: number;
    problemas: Array<{ setor: string; operador_nome: string; maquina_nome: string; problema: string; qty_afetada: number }>;
    statusFinal: string;
    fechouPedido: boolean | null;
}

interface TraceData {
    order: OrderInfo | null;
    inicial: InspRecord[];
    acabado: InspRecord[];
    etapasAcab: AcabRecord[];
    pallets: PalletRecord[];
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function OPTraceView() {
    const [search, setSearch]     = useState('');
    const [loading, setLoading]   = useState(false);
    const [trace, setTrace]       = useState<TraceData | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [opOptions, setOpOptions] = useState<string[]>([]);

    // Carrega sugestões de OP ao abrir
    React.useEffect(() => {
        supabase.from('orders').select('op').order('op').limit(300).then(({ data }) => {
            const ops = (data || []).map((r: { op: string }) => String(r.op));
            setOpOptions(ops);
        });
    }, []);

    const load = useCallback(async (op: string) => {
        const opUp = op.trim().toUpperCase();
        if (!opUp) return;
        setLoading(true);
        setNotFound(false);
        setTrace(null);

        const [ordRes, inspRes, palRes, opListRes, anListRes, acabRes] = await Promise.all([
            supabase.from('orders').select('op, produto, descricao, qtd_total, status, created_at').ilike('op', opUp).maybeSingle(),
            supabase.from('inspections')
                .select('id, op, created_at, status, machine_id, operator_id, analyst_id, observations, machines(name)')
                .ilike('op', opUp)
                .order('created_at', { ascending: true }),
            supabase.from('pallet_inspections')
                .select('id, pallet_number, result, completed_at, analyst_name, machine_name, defects_critical, defects_major, defects_minor, sample_size, boxes_to_inspect, observations')
                .ilike('op', opUp)
                .order('pallet_number', { ascending: true }),
            supabase.from('operators').select('id, name'),
            supabase.from('analysts').select('id, name'),
            supabase.from('acabamento_registros')
                .select('id, op, modulo, timestamp, machine_id, operator_ids, qty_revisadas, qty_aprovadas, qty_reprovadas, defects, notes')
                .ilike('op', opUp)
                .order('timestamp', { ascending: true }),
        ]);

        const opMap: Record<string, string> = {};
        (opListRes.data || []).forEach((o: any) => { opMap[o.id] = o.name; });
        const anMap: Record<string, string> = {};
        (anListRes.data || []).forEach((a: any) => { anMap[a.id] = a.name; });

        // Deduplicar: manter só o registro mais recente por rodada (dados vêm ordenados por created_at ASC)
        const seenRodadaInicial = new Set<number>();
        const seenRodadaPA = new Set<number>();
        const rawInsp = (inspRes.data || []).slice().reverse(); // mais recente primeiro
        const dedupedInsp: any[] = [];
        for (const r of rawInsp) {
            const obs = parseObs(r.observations);
            const numRodada = Number(obs.numero_rodada) || Number(obs.laudo_numero) || 1;
            const isAcab = obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis;
            const seenSet = isAcab ? seenRodadaPA : seenRodadaInicial;
            if (seenSet.has(numRodada)) continue; // duplicata — pular
            seenSet.add(numRodada);
            dedupedInsp.push(r);
        }
        dedupedInsp.reverse(); // volta à ordem cronológica

        const inspections = dedupedInsp.map((r: any): InspRecord => {
            const obs = parseObs(r.observations);
            const isAcabado = obs.process_area === 'produto_acabado' || obs.is_spreadsheet_analysis;

            const operatorIds: string[] = Array.isArray(obs.all_operator_ids) && obs.all_operator_ids.length > 0
                ? obs.all_operator_ids : r.operator_id ? [r.operator_id] : [];
            const analystIds: string[] = Array.isArray(obs.all_analyst_ids) && obs.all_analyst_ids.length > 0
                ? obs.all_analyst_ids : r.analyst_id ? [r.analyst_id] : [];

            const saldo = obs.saldo_unidades || {};
            const prod  = obs.producao || {};

            return {
                id: r.id,
                created_at: r.created_at,
                status: r.status || obs.status_final || obs.status || '',
                area: isAcabado ? 'acabado' : 'inicial',
                numero: obs.laudo_numero || obs.numero_rodada || '',
                machineName: r.machines?.name || '—',
                operatorNames: operatorIds.map(id => opMap[id] || id),
                analystNames:  analystIds.map(id => anMap[id] || id),
                defects: extractDefects(obs),
                qtyProduzida: isAcabado ? asN(prod.qty_produzida) : asN(saldo.rodadas),
                qtyEscolha:   isAcabado ? asN(prod.qty_escolha)   : asN(saldo.em_escolha),
                qtyRefugo:    isAcabado ? asN(prod.qty_refugo)     : asN(saldo.reprovadas),
                observacoes: obs.observacoes || obs.observacoes_analista || '',
            };
        });

        const order = ordRes.data ? {
            op: ordRes.data.op,
            produto: ordRes.data.produto || ordRes.data.descricao || '—',
            qtd_total: asN(ordRes.data.qtd_total),
            status: ordRes.data.status,
            created_at: ordRes.data.created_at,
        } : inspections.length > 0 ? {
            op: opUp, produto: '—', qtd_total: 0, status: '—', created_at: inspections[0].created_at,
        } : null;

        // Mapeia acabamento_registros (corte/vinco, colagem, revisão final)
        const machNames: Record<string, string> = {};
        // Build machine names from inspections machines joins
        (inspRes.data || []).forEach((r: any) => { if (r.machine_id && r.machines?.name) machNames[r.machine_id] = r.machines.name; });

        const etapasAcab: AcabRecord[] = ((acabRes.data || []).map((r: any) => {
            const def = typeof r.defects === 'string' ? JSON.parse(r.defects) : (r.defects || {});
            const isRevisao = r.modulo === 'revisao_final';

            // Ignorar sessões em andamento da revisão final (duplicariam os totais)
            if (isRevisao && def.session_status === 'em_andamento') return null;
            const operadorIds: string[] = Array.isArray(r.operator_ids) ? r.operator_ids.filter(Boolean) : [];

            // Defects map
            const defMap: Record<string, number> = {};
            if (!isRevisao) {
                Object.entries(def).forEach(([k, v]) => {
                    if (typeof v === 'number' && v > 0 && !['qty_refugo', 'turno', 'session_status'].includes(k)) defMap[k] = v;
                });
            }

            return {
                id: r.id,
                modulo: r.modulo,
                timestamp: r.timestamp,
                machineName: machNames[r.machine_id] || '—',
                operatorNames: operadorIds.map(id => opMap[id] || id),
                qtyRevisadas: asN(r.qty_revisadas),
                qtyAprovadas: asN(r.qty_aprovadas),
                qtyEscolha: asN(r.qty_reprovadas),
                qtyRefugo: isRevisao ? asN(def.quantidade_refugada_revisao) : asN(def.qty_refugo),
                defects: defMap,
                // Revisão Final extras
                recuperado: isRevisao ? asN(def.quantidade_recuperada_revisao) : 0,
                refugadoRevisao: isRevisao ? asN(def.quantidade_refugada_revisao) : 0,
                custoRevisao: isRevisao ? asN(def.custo_revisao) : 0,
                pessoas: isRevisao ? asN(def.total_pessoas) : 0,
                horas: isRevisao ? asN(def.total_horas) : 0,
                problemas: isRevisao && Array.isArray(def.problemas) ? def.problemas.map((p: any) => ({
                    setor: p.setor || '', operador_nome: p.operador_nome || '', maquina_nome: p.maquina_nome || '',
                    problema: p.problema || '', qty_afetada: asN(p.qty_afetada),
                })) : [],
                statusFinal: isRevisao ? String(def.status_final || '') : '',
                fechouPedido: isRevisao ? (typeof def.fechou_pedido === 'boolean' ? def.fechou_pedido : null) : null,
            };
        }) as (AcabRecord | null)[]).filter((r): r is AcabRecord => r !== null);

        const allRecs = [...inspections, ...(acabRes.data || [])];
        if (!order && allRecs.length === 0 && (palRes.data || []).length === 0) {
            setNotFound(true);
        } else {
            setTrace({
                order,
                inicial: inspections.filter(r => r.area === 'inicial'),
                acabado: inspections.filter(r => r.area === 'acabado'),
                etapasAcab,
                pallets: (palRes.data || []) as PalletRecord[],
            });
        }
        setLoading(false);
    }, []);

    // ── Totais consolidados ─────────────────────────────────────────────────
    const totals = React.useMemo(() => {
        if (!trace) return null;
        // Produzida: usa SÓ impressão (é a entrada de material — as etapas seguintes
        // processam o mesmo material, não criam peças novas)
        const produzida = trace.inicial.reduce((s, r) => s + r.qtyProduzida, 0);
        // Escolha: só da impressão (as escolhas de CV/Colagem são subconjunto)
        const escolha   = trace.inicial.reduce((s, r) => s + r.qtyEscolha, 0);
        // Refugo: soma de TODAS as etapas (peças diferentes refugadas em etapas distintas)
        const refugoInicial = trace.inicial.reduce((s, r) => s + r.qtyRefugo, 0);
        const refugoPA = trace.acabado.reduce((s, r) => s + r.qtyRefugo, 0);
        const refugoAcab = trace.etapasAcab.reduce((s, r) => s + r.qtyRefugo, 0);
        const refugo = refugoInicial + refugoPA + refugoAcab;

        // Defeitos consolidados (todas as etapas)
        const defMap = new Map<string, number>();
        const all = [...trace.inicial, ...trace.acabado];
        all.forEach(r => r.defects.forEach(d => defMap.set(d.name, (defMap.get(d.name) || 0) + d.count)));
        trace.etapasAcab.forEach(r => Object.entries(r.defects).forEach(([k, v]) => defMap.set(k, (defMap.get(k) || 0) + Number(v))));
        const topDefects = Array.from(defMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

        // Todos operadores únicos (todas as etapas)
        const ops = Array.from(new Set([
            ...all.flatMap(r => r.operatorNames),
            ...trace.etapasAcab.flatMap(r => r.operatorNames),
        ].filter(Boolean)));

        // Status geral
        const allStatuses = [
            ...trace.inicial.map(r => r.status),
            ...trace.acabado.map(r => r.status),
            ...trace.pallets.map(r => r.result),
        ];
        const hasRejected    = allStatuses.some(s => s === 'REJECTED' || s === 'rejected');
        const hasRestricted  = allStatuses.some(s => s === 'RESTRICTED' || s === 'restricted');
        const overallStatus  = hasRejected ? 'REJECTED' : hasRestricted ? 'RESTRICTED' : 'APPROVED';

        return { produzida, escolha, refugo, topDefects, ops, overallStatus };
    }, [trace]);

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5 pb-10 animate-fade-in">

            {/* Header + Busca */}
            <header className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">manage_search</span>
                        Rastreabilidade de OP
                    </h1>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        Processo Inicial → Produto Acabado → Pallets — tudo em uma visão
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                        <input
                            list="op-options"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && load(search)}
                            placeholder="Digite ou selecione a OP..."
                            className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <datalist id="op-options">
                            {opOptions.map(op => <option key={op} value={op} />)}
                        </datalist>
                    </div>
                    <button
                        type="button"
                        onClick={() => load(search)}
                        disabled={loading || !search.trim()}
                        className="h-11 px-6 rounded-xl bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading
                            ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                            : <span className="material-symbols-outlined text-sm">manage_search</span>}
                        Buscar
                    </button>
                </div>
            </header>

            {/* Não encontrado */}
            {notFound && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <span className="material-symbols-outlined text-5xl text-slate-300">search_off</span>
                    <p className="text-sm font-bold text-slate-400">OP <strong>"{search}"</strong> não encontrada</p>
                    <p className="text-xs text-slate-300">Verifique o código e tente novamente</p>
                </div>
            )}

            {trace && totals && (
                <>
                    {/* Cabeçalho da OP */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                                        OP {trace.order?.op ?? search.toUpperCase()}
                                    </h2>
                                    <Badge status={totals.overallStatus} />
                                </div>
                                {trace.order?.produto && trace.order.produto !== '—' && (
                                    <p className="text-sm font-bold text-slate-500 mt-0.5">{trace.order.produto}</p>
                                )}
                                {trace.order?.created_at && (
                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">Abertura: {fmtDate(trace.order.created_at)}</p>
                                )}
                            </div>
                            {trace.order?.qtd_total ? (
                                <div className="text-right">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Qtd. OP</p>
                                    <p className="text-2xl font-black text-slate-800 dark:text-white">{fmt.format(trace.order.qtd_total)} <span className="text-sm font-bold text-slate-400">un.</span></p>
                                </div>
                            ) : null}
                        </div>

                        {/* Resumo consolidado */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                            {/* Produzido */}
                                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">inventory_2</span>Produzido
                                    </p>
                                    <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{fmt.format(totals.produzida)}</p>
                                </div>
                                {/* Em escolha */}
                                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">rule</span>Em Escolha
                                    </p>
                                    <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{fmt.format(totals.escolha)}</p>
                                    {totals.produzida > 0 && <p className="text-[10px] font-bold text-amber-500">{((totals.escolha/totals.produzida)*100).toFixed(1)}%</p>}
                                </div>
                                {/* Refugo */}
                                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">delete_sweep</span>Refugo
                                    </p>
                                    <p className="text-2xl font-black text-rose-700 dark:text-rose-300">{fmt.format(totals.refugo)}</p>
                                    {totals.produzida > 0 && <p className="text-[10px] font-bold text-rose-500">{((totals.refugo/totals.produzida)*100).toFixed(1)}%</p>}
                                </div>
                                {/* Pallets */}
                                <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">stacks</span>Pallets
                                    </p>
                                    <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{trace.pallets.length}</p>
                                </div>
                        </div>

                        {/* Operadores + defeitos top */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                            {totals.ops.length > 0 && (
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">badge</span>Operadores envolvidos
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {totals.ops.map(name => (
                                            <span key={name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                                                <span className="material-symbols-outlined text-xs text-slate-400">person</span>{name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {totals.topDefects.length > 0 && (
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">emergency_home</span>Principais problemas
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {totals.topDefects.map(([name, count]) => (
                                            <span key={name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-xs font-bold capitalize">
                                                {name} <span className="font-black text-rose-500">{count}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── PROCESSO INICIAL ─────────────────────────────────────────── */}
                    {trace.inicial.length > 0 && (
                        <Section
                            icon="assignment_turned_in" color="blue"
                            title="Processo Inicial"
                            subtitle={`${trace.inicial.length} rodada${trace.inicial.length !== 1 ? 's' : ''}`}
                        >
                            {trace.inicial.map((r, i) => (
                                <InspCard key={r.id} record={r} index={i + 1} />
                            ))}
                        </Section>
                    )}

                    {/* ── PRODUTO ACABADO ───────────────────────────────────────────── */}
                    {trace.acabado.length > 0 && (
                        <Section
                            icon="table_chart" color="indigo"
                            title="Produto Acabado"
                            subtitle={`${trace.acabado.length} laudo${trace.acabado.length !== 1 ? 's' : ''}`}
                        >
                            {trace.acabado.map((r, i) => (
                                <InspCard key={r.id} record={r} index={i + 1} />
                            ))}
                        </Section>
                    )}

                    {/* ── PALLETS ──────────────────────────────────────────────────── */}
                    {trace.pallets.length > 0 && (
                        <Section
                            icon="stacks" color="indigo"
                            title="Inspeção de Pallets"
                            subtitle={`${trace.pallets.length} pallet${trace.pallets.length !== 1 ? 's' : ''}`}
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {trace.pallets.map(p => (
                                    <div key={p.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-black text-sm text-slate-800 dark:text-white">Pallet #{p.pallet_number}</p>
                                                <p className="text-[10px] font-bold text-slate-400">{fmtDate(p.completed_at)}</p>
                                            </div>
                                            <Badge status={p.result} />
                                        </div>
                                        <div className="flex gap-3 text-[10px] font-black">
                                            <span className="text-rose-600">{p.defects_critical} críticos</span>
                                            <span className="text-amber-600">{p.defects_major} maiores</span>
                                            <span className="text-slate-500">{p.defects_minor} menores</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold text-slate-400">
                                                {p.analyst_name || '—'} · {p.machine_name || '—'}
                                            </p>
                                            <Link
                                                to={`/pallet/${p.id}`}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 text-[9px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-xs">qr_code_2</span>QR
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Nenhum dado */}
                    {trace.inicial.length === 0 && trace.acabado.length === 0 && trace.pallets.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 gap-3">
                            <span className="material-symbols-outlined text-5xl text-slate-300">folder_open</span>
                            <p className="text-sm font-bold text-slate-400">OP encontrada, mas sem registros de inspeção ainda</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function Section({ icon, color, title, subtitle, children }: {
    icon: string; color: string; title: string; subtitle: string; children: React.ReactNode;
}) {
    const [open, setOpen] = useState(true);
    const colorMap: Record<string, string> = {
        blue: 'text-blue-500 bg-blue-600',
        indigo: 'text-indigo-500 bg-indigo-600',
    };
    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            >
                <span className={`material-symbols-outlined ${colorMap[color]?.split(' ')[0] ?? 'text-slate-500'}`}>{icon}</span>
                <div className="flex-1">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">{title}</h3>
                    <p className="text-[10px] text-slate-400 font-bold">{subtitle}</p>
                </div>
                <span className={`material-symbols-outlined text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}>expand_more</span>
            </button>
            {open && <div className="p-4 space-y-3">{children}</div>}
        </div>
    );
}

function InspCard({ record, index }: { key?: React.Key; record: InspRecord; index: number }) {
    const [expanded, setExpanded] = useState(false);
    const hasDefects = record.defects.length > 0;

    return (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
                <span className="size-7 rounded-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0">
                    {index}
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        {record.numero && (
                            <span className="text-xs font-black text-indigo-600">#{record.numero}</span>
                        )}
                        <Badge status={record.status} />
                        <span className="text-[10px] font-bold text-slate-400">{fmtDate(record.created_at)}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] font-bold text-slate-500 flex-wrap">
                        {record.machineName !== '—' && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-xs">precision_manufacturing</span>{record.machineName}</span>}
                        {record.operatorNames.length > 0 && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-xs">badge</span>{record.operatorNames.join(', ')}</span>}
                    </div>
                </div>
                {/* Mini quantidades */}
                {(record.qtyProduzida > 0 || record.qtyRefugo > 0) && (
                    <div className="hidden md:flex gap-3 text-[10px] font-black shrink-0">
                        {record.qtyProduzida > 0 && <span className="text-slate-500">{fmt.format(record.qtyProduzida)} un.</span>}
                        {record.qtyEscolha > 0 && <span className="text-amber-500">{fmt.format(record.qtyEscolha)} escolha</span>}
                        {record.qtyRefugo > 0 && <span className="text-rose-500">{fmt.format(record.qtyRefugo)} refugo</span>}
                    </div>
                )}
                <span className={`material-symbols-outlined text-slate-300 transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`}>expand_more</span>
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {/* Quantidades */}
                    {(record.qtyProduzida > 0 || record.qtyEscolha > 0 || record.qtyRefugo > 0) && (
                        <div className="grid grid-cols-3 gap-2">
                            <div className="p-2 rounded-xl text-center bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Produzido</p>
                                <p className="text-base font-black text-slate-800 dark:text-slate-100">{fmt.format(record.qtyProduzida)}</p>
                            </div>
                            <div className="p-2 rounded-xl text-center bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
                                <p className="text-[8px] font-black uppercase tracking-widest text-amber-500">Escolha</p>
                                <p className="text-base font-black text-amber-700 dark:text-amber-300">{fmt.format(record.qtyEscolha)}</p>
                            </div>
                            <div className="p-2 rounded-xl text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900">
                                <p className="text-[8px] font-black uppercase tracking-widest text-rose-500">Refugo</p>
                                <p className="text-base font-black text-rose-700 dark:text-rose-300">{fmt.format(record.qtyRefugo)}</p>
                            </div>
                        </div>
                    )}

                    {/* Defeitos */}
                    {hasDefects && (
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Defeitos registrados</p>
                            <div className="flex flex-wrap gap-1.5">
                                {record.defects.map(d => (
                                    <span key={d.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-[10px] font-bold capitalize">
                                        {d.name} <span className="font-black">{d.count}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Observações */}
                    {record.observacoes && (
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900">
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-1">Observações</p>
                            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{record.observacoes}</p>
                        </div>
                    )}

                    {/* Analistas */}
                    {record.analystNames.length > 0 && (
                        <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">microscope</span>
                            Analista{record.analystNames.length > 1 ? 's' : ''}: {record.analystNames.join(', ')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

