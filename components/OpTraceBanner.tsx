import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────
type ModuloInfo = {
  label: string;
  icon: string;
  qty_revisadas: number;
  qty_reprovadas: number;
  count: number;
};

type OpSummary = {
  op: string;
  produto: string | null;
  qtd_total: number;
  modulos: Record<string, ModuloInfo>;
  total_refugo: number;
  total_revisado: number;
  inspecoes_inicial: number;
  inspecoes_acabado: number;
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
  revisao_final:{ label: 'Revisão Final',icon: 'verified' },
};

const fmt = (n: number) => n.toLocaleString('pt-BR');

// ── Component ──────────────────────────────────────────────────────────────────
const OpTraceBanner: React.FC<Props> = ({ op, moduloAtual }) => {
  const [summary, setSummary] = useState<OpSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (opNum: string) => {
    if (!opNum.trim()) { setSummary(null); return; }
    setLoading(true);

    const opUpper = opNum.trim().toUpperCase();

    // Busca paralela em todas as fontes
    const [orderRes, acabamentoRes, inspecoesRes] = await Promise.all([
      supabase.from('orders').select('op, produto, qtd_total, status').eq('op', opUpper).maybeSingle(),
      supabase.from('acabamento_registros')
        .select('modulo, qty_revisadas, qty_reprovadas')
        .eq('op', opUpper)
        .neq('modulo', moduloAtual ?? '__none__'),
      supabase.from('inspections')
        .select('id, observations, status')
        .eq('op', opUpper),
    ]);

    // Agrupa registros de acabamento por módulo
    const modulos: Record<string, ModuloInfo> = {};
    for (const row of (acabamentoRes.data ?? [])) {
      const m = row.modulo as string;
      if (!modulos[m]) {
        modulos[m] = {
          label: MODULO_META[m]?.label ?? m,
          icon:  MODULO_META[m]?.icon  ?? 'check',
          qty_revisadas: 0,
          qty_reprovadas: 0,
          count: 0,
        };
      }
      modulos[m].qty_revisadas  += row.qty_revisadas  ?? 0;
      modulos[m].qty_reprovadas += row.qty_reprovadas ?? 0;
      modulos[m].count++;
    }

    // Conta inspeções por área
    const inspRows = inspecoesRes.data ?? [];
    let insp_inicial = 0, insp_acabado = 0, refugo_impressao = 0, refugo_acabado = 0;
    for (const row of inspRows) {
      let obs: Record<string, unknown> | null = null;
      try {
        if (typeof row.observations === 'string' && row.observations.startsWith('{')) {
          obs = JSON.parse(row.observations) as Record<string, unknown>;
        } else if (typeof row.observations === 'object') {
          obs = row.observations as Record<string, unknown>;
        }
      } catch { /* ignora */ }

      const area = (obs?.process_area as string) ?? '';
      if (area === 'producao_inicial') {
        insp_inicial++;
        const saldo = obs?.saldo_unidades as Record<string, number> | undefined;
        refugo_impressao += saldo?.reprovadas ?? 0;
      } else if (area === 'produto_acabado') {
        insp_acabado++;
        const producao = obs?.producao as Record<string, number> | undefined;
        refugo_acabado += producao?.qty_refugo ?? 0;
      }
    }

    // Totais
    const refugo_acabamento = Object.values(modulos).reduce((s, m) => s + m.qty_reprovadas, 0);
    const total_refugo = refugo_impressao + refugo_acabado + refugo_acabamento;
    const total_revisado = Object.values(modulos).reduce((s, m) => s + m.qty_revisadas, 0);

    setSummary({
      op: opUpper,
      produto: orderRes.data?.produto ?? null,
      qtd_total: orderRes.data?.qtd_total ?? 0,
      status_ordem: orderRes.data?.status ?? null,
      modulos,
      total_refugo,
      total_revisado,
      inspecoes_inicial: insp_inicial,
      inspecoes_acabado: insp_acabado,
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

  const hasHistory = summary.inspecoes_inicial > 0 || summary.inspecoes_acabado > 0 || Object.keys(summary.modulos).length > 0;

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
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">
            Rastreio OP {summary.op}
          </span>
          {summary.produto && (
            <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium">
              · {summary.produto}
            </span>
          )}
        </div>
        {summary.qtd_total > 0 && (
          <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-300 shrink-0">
            {fmt(summary.qtd_total)} un.
          </span>
        )}
      </div>

      {/* Módulos */}
      <div className="px-3 py-2 flex flex-col gap-1.5">
        {/* Inspeções de Processo Inicial */}
        {summary.inspecoes_inicial > 0 && (
          <ModuloRow
            icon="assignment_turned_in"
            label="Processo Inicial"
            count={summary.inspecoes_inicial}
            colorClass="text-blue-600 dark:text-blue-400"
          />
        )}

        {/* Inspeções de Produto Acabado */}
        {summary.inspecoes_acabado > 0 && (
          <ModuloRow
            icon="table_chart"
            label="Produto Acabado"
            count={summary.inspecoes_acabado}
            colorClass="text-teal-600 dark:text-teal-400"
          />
        )}

        {/* Módulos de acabamento */}
        {(Object.entries(summary.modulos) as [string, ModuloInfo][]).map(([key, info]) => (
          <ModuloRow
            key={key}
            icon={info.icon}
            label={info.label}
            count={info.count}
            qtyRevisadas={info.qty_revisadas}
            qtyRefugadas={info.qty_reprovadas}
            colorClass="text-violet-600 dark:text-violet-400"
          />
        ))}
      </div>

      {/* Totais */}
      {(summary.total_refugo > 0 || summary.total_revisado > 0) && (
        <div className="px-3 py-2 border-t border-indigo-100 dark:border-indigo-900/40 flex items-center gap-4">
          {summary.total_revisado > 0 && (
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">checklist</span>
              <span className="font-black">{fmt(summary.total_revisado)}</span>
              <span>revisadas (acabamento)</span>
            </span>
          )}
          {summary.total_refugo > 0 && (
            <span className="text-[10px] text-rose-600 dark:text-rose-400 flex items-center gap-1 ml-auto">
              <span className="material-symbols-outlined text-[12px]">cancel</span>
              <span className="font-black">{fmt(summary.total_refugo)}</span>
              <span>refugadas no total</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ── ModuloRow ──────────────────────────────────────────────────────────────────
const ModuloRow: React.FC<{
  icon: string;
  label: string;
  count: number;
  qtyRevisadas?: number;
  qtyRefugadas?: number;
  colorClass: string;
}> = ({ icon, label, count, qtyRevisadas, qtyRefugadas, colorClass }) => (
  <div className="flex items-center gap-2">
    <span className={`material-symbols-outlined text-[13px] shrink-0 ${colorClass}`}>{icon}</span>
    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex-1">{label}</span>
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-slate-400">{count} reg.</span>
      {qtyRevisadas !== undefined && qtyRevisadas > 0 && (
        <span className="text-slate-500 font-bold">{fmt(qtyRevisadas)} rev.</span>
      )}
      {qtyRefugadas !== undefined && qtyRefugadas > 0 && (
        <span className="text-rose-500 font-bold">{fmt(qtyRefugadas)} ref.</span>
      )}
    </div>
  </div>
);

export default OpTraceBanner;
