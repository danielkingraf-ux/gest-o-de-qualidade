import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────
type ModuloInfo = {
  label: string;
  icon: string;
  rodado: number;   // qty_revisadas (rodado na etapa)
  escolha: number;  // qty_reprovadas (escolha gerada — NÃO é refugo)
  refugo: number;   // defects.qty_refugo
  count: number;
};

type AreaInfo = { count: number; boas: number; escolha: number; refugo: number };

type OpSummary = {
  op: string;
  produto: string | null;
  qtd_total: number;
  modulos: Record<string, ModuloInfo>;
  inicial: AreaInfo;
  acabado: AreaInfo;
  escolhaTotal: number;
  refugoTotal: number;
  boasExpedicao: number;
  status_ordem: string | null;
};

type Props = {
  op: string;
  /** Se informado, oculta o módulo corrente para evitar auto-referência */
  moduloAtual?: string;
};

const MODULO_META: Record<string, { label: string; icon: string }> = {
  escolhas:     { label: 'Escolhas',     icon: 'playlist_add_check' },
  corte_vinco:  { label: 'Corte/Vinco',  icon: 'content_cut' },
  colagem:      { label: 'Colagem',      icon: 'precision_manufacturing' },
  revisao_final:{ label: 'Revisão Final',icon: 'verified' },
};

const fmt = (n: number) => n.toLocaleString('pt-BR');
const emptyArea = (): AreaInfo => ({ count: 0, boas: 0, escolha: 0, refugo: 0 });
const num = (v: unknown) => Number(v) || 0;

// ── Component ──────────────────────────────────────────────────────────────────
const OpTraceBanner: React.FC<Props> = ({ op, moduloAtual }) => {
  const [summary, setSummary] = useState<OpSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (opNum: string) => {
    if (!opNum.trim()) { setSummary(null); return; }
    setLoading(true);

    const opUpper = opNum.trim().toUpperCase();

    const [orderRes, acabamentoRes, inspecoesRes] = await Promise.all([
      supabase.from('orders').select('op, produto, qtd_total, status').eq('op', opUpper).maybeSingle(),
      supabase.from('acabamento_registros')
        .select('modulo, qty_revisadas, qty_reprovadas, qty_aprovadas, defects')
        .eq('op', opUpper)
        .neq('modulo', moduloAtual ?? '__none__'),
      supabase.from('inspections')
        .select('id, observations, status, created_at')
        .eq('op', opUpper)
        .order('created_at', { ascending: false }),
    ]);

    // Acabamento por módulo (escolha = qty_reprovadas; refugo = defects.qty_refugo)
    const modulos: Record<string, ModuloInfo> = {};
    for (const row of (acabamentoRes.data ?? []) as Array<{ modulo: string; qty_revisadas: number; qty_reprovadas: number; defects: Record<string, number> | null }>) {
      const m = row.modulo;
      if (!modulos[m]) {
        modulos[m] = { label: MODULO_META[m]?.label ?? m, icon: MODULO_META[m]?.icon ?? 'check', rodado: 0, escolha: 0, refugo: 0, count: 0 };
      }
      modulos[m].rodado  += num(row.qty_revisadas);
      modulos[m].escolha += num(row.qty_reprovadas);
      modulos[m].refugo  += num(row.defects?.qty_refugo);
      modulos[m].count++;
    }

    // Inspeções: início (producao_inicial) e acabado (produto_acabado), deduplicando por rodada
    const inicial = emptyArea();
    const acabado = emptyArea();
    const seenIni = new Set<number>();
    const seenPA = new Set<number>();
    for (const row of (inspecoesRes.data ?? []) as Array<{ observations: string }>) {
      let obs: Record<string, unknown> | null = null;
      try {
        if (typeof row.observations === 'string' && row.observations.trim().startsWith('{')) obs = JSON.parse(row.observations);
        else if (typeof row.observations === 'object') obs = row.observations as Record<string, unknown>;
      } catch { /* ignora */ }
      if (!obs) continue;

      const area = (obs.process_area as string) ?? '';
      if (area === 'producao_inicial' && obs.saldo_unidades) {
        const rod = num(obs.numero_rodada) || 1;
        if (seenIni.has(rod)) continue;
        seenIni.add(rod);
        const s = obs.saldo_unidades as Record<string, number>;
        inicial.count++;
        inicial.boas    += num(s.aprovadas);
        inicial.escolha += num(s.em_escolha);
        inicial.refugo  += num(s.reprovadas);
      } else if (area === 'produto_acabado' && obs.producao) {
        const laudo = num(obs.laudo_numero) || 1;
        if (seenPA.has(laudo)) continue;
        seenPA.add(laudo);
        const p = obs.producao as Record<string, number>;
        acabado.count++;
        acabado.boas    += Math.max(0, num(p.qty_produzida) - num(p.qty_escolha) - num(p.qty_refugo));
        acabado.escolha += num(p.qty_escolha);
        acabado.refugo  += num(p.qty_refugo);
      }
    }

    const modVals = Object.values(modulos);
    const escolhaTotal = inicial.escolha + modVals.reduce((s, m) => s + m.escolha, 0) + acabado.escolha;
    const refugoTotal  = inicial.refugo  + modVals.reduce((s, m) => s + m.refugo,  0) + acabado.refugo;
    const boasExpedicao = acabado.count > 0 ? acabado.boas : 0;

    setSummary({
      op: opUpper,
      produto: orderRes.data?.produto ?? null,
      qtd_total: orderRes.data?.qtd_total ?? 0,
      status_ordem: orderRes.data?.status ?? null,
      modulos,
      inicial,
      acabado,
      escolhaTotal,
      refugoTotal,
      boasExpedicao,
    });

    setLoading(false);
  }, [moduloAtual]);

  useEffect(() => {
    const timer = setTimeout(() => { if (op.trim().length >= 3) fetch(op); else setSummary(null); }, 600);
    return () => clearTimeout(timer);
  }, [op, fetch]);

  if (!op.trim() || op.trim().length < 3) return null;

  if (loading) {
    return (
      <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <div className="size-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin shrink-0" />
        <span className="text-xs text-slate-400">Buscando histórico da OP {op.trim().toUpperCase()}...</span>
      </div>
    );
  }

  if (!summary) return null;

  const hasHistory = summary.inicial.count > 0 || summary.acabado.count > 0 || Object.keys(summary.modulos).length > 0;

  if (!hasHistory && !summary.produto) {
    return (
      <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-600">
        <span className="material-symbols-outlined text-slate-300 text-sm">search_off</span>
        <span className="text-xs text-slate-400">Nenhum registro encontrado para OP {summary.op}</span>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-indigo-100 dark:border-indigo-900/40">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-indigo-500 text-sm">route</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">Rastreio OP {summary.op}</span>
          {summary.produto && <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">· {summary.produto}</span>}
        </div>
        {summary.qtd_total > 0 && (
          <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-300 shrink-0">{fmt(summary.qtd_total)} un.</span>
        )}
      </div>

      {/* Linhas por etapa */}
      <div className="px-3 py-2 flex flex-col gap-1.5">
        {summary.inicial.count > 0 && (
          <EtapaRow icon="assignment_turned_in" label="Processo Inicial" count={summary.inicial.count}
            boas={summary.inicial.boas} escolha={summary.inicial.escolha} refugo={summary.inicial.refugo} colorClass="text-blue-600 dark:text-blue-400" />
        )}
        {(Object.entries(summary.modulos) as [string, ModuloInfo][]).map(([key, info]) => (
          <EtapaRow key={key} icon={info.icon} label={info.label} count={info.count}
            rodado={info.rodado} escolha={info.escolha} refugo={info.refugo} colorClass="text-violet-600 dark:text-violet-400" />
        ))}
        {summary.acabado.count > 0 && (
          <EtapaRow icon="table_chart" label="Produto Acabado" count={summary.acabado.count}
            boas={summary.acabado.boas} escolha={summary.acabado.escolha} refugo={summary.acabado.refugo} colorClass="text-teal-600 dark:text-teal-400" />
        )}
      </div>

      {/* Totais */}
      {(summary.escolhaTotal > 0 || summary.refugoTotal > 0 || summary.boasExpedicao > 0) && (
        <div className="px-3 py-2 border-t border-indigo-100 dark:border-indigo-900/40 flex flex-wrap items-center gap-x-4 gap-y-1">
          {summary.boasExpedicao > 0 && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">local_shipping</span>
              <span className="font-black">{fmt(summary.boasExpedicao)}</span><span>boas → expedição</span>
            </span>
          )}
          {summary.escolhaTotal > 0 && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">rule</span>
              <span className="font-black">{fmt(summary.escolhaTotal)}</span><span>escolha → revisão</span>
            </span>
          )}
          <span className="text-[10px] text-rose-600 dark:text-rose-400 flex items-center gap-1 ml-auto">
            <span className="material-symbols-outlined text-[12px]">cancel</span>
            <span className="font-black">{fmt(summary.refugoTotal)}</span><span>refugo no total</span>
          </span>
        </div>
      )}
    </div>
  );
};

// ── EtapaRow ─────────────────────────────────────────────────────────────────
const EtapaRow: React.FC<{
  icon: string;
  label: string;
  count: number;
  rodado?: number;
  boas?: number;
  escolha?: number;
  refugo?: number;
  colorClass: string;
}> = ({ icon, label, count, rodado, boas, escolha, refugo, colorClass }) => (
  <div className="flex items-center gap-2">
    <span className={`material-symbols-outlined text-[13px] shrink-0 ${colorClass}`}>{icon}</span>
    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex-1 truncate">{label}</span>
    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[10px]">
      <span className="text-slate-400">{count} reg.</span>
      {rodado !== undefined && rodado > 0 && <span className="text-slate-500 font-bold">{fmt(rodado)} rod.</span>}
      {boas !== undefined && boas > 0 && <span className="text-emerald-600 font-bold">{fmt(boas)} boas</span>}
      {escolha !== undefined && escolha > 0 && <span className="text-amber-600 font-bold">{fmt(escolha)} esc.</span>}
      {refugo !== undefined && refugo > 0 && <span className="text-rose-500 font-bold">{fmt(refugo)} ref.</span>}
    </div>
  </div>
);

export default OpTraceBanner;
