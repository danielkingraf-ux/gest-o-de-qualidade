import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import {
  reportService,
  type ManagementReportData,
  type ManagementOpDetail,
  type ManagementOperatorProblem,
  type ManagementMachineProblem,
  type ManagementReimpressao,
} from '../services/reportService';
// Lazy import para reduzir bundle inicial
// import { exportManagementReportXlsx } from '../services/excelExportService';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const fmtMoney = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

// Mapa ESTÁTICO de cores — classes dinâmicas (bg-${color}-50) não são geradas pelo Tailwind.
const CARD_STYLES: Record<string, { box: string; icon: string; value: string }> = {
  indigo:  { box: 'border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/20',     icon: 'text-indigo-500',  value: 'text-indigo-700 dark:text-indigo-300' },
  slate:   { box: 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60',           icon: 'text-slate-500',   value: 'text-slate-800 dark:text-slate-100' },
  emerald: { box: 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20', icon: 'text-emerald-500', value: 'text-emerald-700 dark:text-emerald-300' },
  rose:    { box: 'border-rose-100 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20',             icon: 'text-rose-500',    value: 'text-rose-700 dark:text-rose-300' },
  amber:   { box: 'border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20',         icon: 'text-amber-500',   value: 'text-amber-700 dark:text-amber-300' },
};
const cardStyle = (c: string) => CARD_STYLES[c] ?? CARD_STYLES.slate;
const pct = (v: number, total: number) => total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '—';

const parseObs = (observations: string | null): Record<string, any> => {
  if (!observations) return {};
  try { return JSON.parse(observations); } catch { return {}; }
};

type PeriodPreset = '7' | '30' | '90' | 'custom';

// Veredito final consolidado por OP (Revisão Final + fluxo completo)
interface VereditoOp {
  op: string;
  cliente: string;
  pedido: number;
  aprovadoDireto: number;       // boas que passaram limpas (sem revisão)
  recuperado: number;           // recuperado na revisão
  refugadoRevisao: number;      // refugado na revisão
  entregueFinal: number;        // aprovadoDireto + recuperado
  saldo: number;                // entregueFinal − pedido
  fechou: boolean | null;       // null = sem revisão ainda
  statusFinal: string;
  custoRevisao: number;
  pessoas: number;
  horas: number;
  palletsReprovados: number;
  temRevisao: boolean;
}

// Causador apontado (setor / operador / máquina) na Revisão Final
interface Causador {
  tipo: 'setor' | 'operador' | 'maquina';
  nome: string;
  ocorrencias: number;
  qtdAfetada: number;
  ops: Set<string>;
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function ManagementReportView() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Filtros de periodo
  const [preset, setPreset] = useState<PeriodPreset>('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Dados brutos
  const [inspections, setInspections] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [reimpressoes, setReimpressoes] = useState<any[]>([]);
  const [userProfiles, setUserProfiles] = useState<any[]>([]);
  const [acabamentoRegs, setAcabamentoRegs] = useState<any[]>([]);
  const [palletInsps, setPalletInsps] = useState<any[]>([]);

  // Periodo calculado
  const period = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    let start: Date;

    if (preset === 'custom') {
      start = customStart ? new Date(customStart) : new Date(end.getTime() - 30 * 86400000);
      if (customEnd) {
        const ce = new Date(customEnd);
        ce.setHours(23, 59, 59, 999);
        return { start, end: ce };
      }
    } else {
      start = new Date(end.getTime() - Number(preset) * 86400000);
    }
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }, [preset, customStart, customEnd]);

  const periodLabel = useMemo(() => {
    return `${period.start.toLocaleDateString('pt-BR')} a ${period.end.toLocaleDateString('pt-BR')}`;
  }, [period]);

  // Fetch
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [inspRes, ordRes, machRes, opRes, reimpRes, profilesRes] = await Promise.all([
          supabase.from('inspections')
            .select('id, op, order_id, status, observations, machine_id, operator_id, created_at')
            .gte('created_at', period.start.toISOString())
            .lte('created_at', period.end.toISOString())
            .order('created_at', { ascending: false }),
          supabase.from('orders')
            .select('id, op, qtd_total, cliente, produto, descricao, status'),
          supabase.from('machines').select('id, name'),
          supabase.from('operators').select('id, name'),
          supabase.from('op_reimpressoes')
            .select('id, order_id, inspection_id, numero_rodada, quantidade_unid, motivo, solicitada_por, status, created_at')
            .gte('created_at', period.start.toISOString())
            .lte('created_at', period.end.toISOString()),
          supabase.from('user_profiles').select('user_id, full_name'),
        ]);

        const insps = inspRes.data || [];
        setInspections(insps);
        setOrders(ordRes.data || []);
        setMachines(machRes.data || []);
        setOperators(opRes.data || []);
        setReimpressoes(reimpRes.data || []);
        setUserProfiles(profilesRes.data || []);

        // Fase 2 — fluxo completo (acabamento + pallets) das OPs do período
        const opsPeriodo = [...new Set(insps.map((i: any) => i.op).filter(Boolean))] as string[];
        if (opsPeriodo.length > 0) {
          const [acabRes, palletRes] = await Promise.all([
            supabase.from('acabamento_registros')
              .select('id, op, modulo, qty_revisadas, qty_aprovadas, qty_reprovadas, operator_ids, machine_id, defects, timestamp')
              .in('op', opsPeriodo),
            supabase.from('pallet_inspections')
              .select('id, op, result, defects_critical, defects_major, defects_minor, units_per_box, boxes_per_pallet')
              .in('op', opsPeriodo)
              .is('archived_at', null),
          ]);
          setAcabamentoRegs(acabRes.data || []);
          setPalletInsps(palletRes.data || []);
        } else {
          setAcabamentoRegs([]);
          setPalletInsps([]);
        }
      } catch (err: any) {
        showToast(`Erro ao carregar dados: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [period, showToast]);

  // ─── Processamento dos dados ──────────────────────────────────────────────
  const reportData = useMemo((): (ManagementReportData & { vereditos: VereditoOp[]; causadores: Causador[] }) | null => {
    if (loading || inspections.length === 0) return null;

    const orderMap = new Map(orders.map((o: any) => [o.id, o]));
    const machineMap = new Map<string, string>(machines.map((m: any) => [m.id, m.name ?? '']));
    const operatorMap = new Map<string, string>(operators.map((o: any) => [o.id, o.name ?? '']));

    // Enriquecer inspecoes com dados parseados
    const enriched = inspections.map((insp: any) => {
      const obs = parseObs(insp.observations);
      const order = orderMap.get(insp.order_id);
      return { ...insp, obs, order };
    });

    // Apenas inspecoes de producao inicial (tem saldo_unidades)
    const initialInsp = enriched.filter(i => i.obs.process_area === 'producao_inicial' || i.obs.saldo_unidades);

    // OPs unicas no periodo
    const opSet = new Set<string>(enriched.map(i => i.op as string));
    const opsNoPeriodo = Array.from(opSet);

    // Resumo executivo
    let totalPedidas = 0;
    let totalEntregues = 0;
    let opsComEscolha = 0;
    let opsAprovadas = 0;
    let opsReprovadas = 0;

    const opDetailsMap = new Map<string, ManagementOpDetail>();

    // Agrupa registros de acabamento e pallets por OP (fluxo completo)
    const acabByOp = new Map<string, any[]>();
    for (const r of acabamentoRegs) {
      const arr = acabByOp.get(r.op) ?? [];
      arr.push(r);
      acabByOp.set(r.op, arr);
    }
    const palletsByOp = new Map<string, any[]>();
    for (const p of palletInsps) {
      const arr = palletsByOp.get(p.op) ?? [];
      arr.push(p);
      palletsByOp.set(p.op, arr);
    }

    const vereditos: VereditoOp[] = [];
    // Causadores apontados na Revisão Final (setor / operador / máquina)
    const causadorMap = new Map<string, Causador>();
    const addCausador = (tipo: Causador['tipo'], nome: string, qtd: number, op: string) => {
      const key = `${tipo}|${nome.toLowerCase()}`;
      if (!causadorMap.has(key)) causadorMap.set(key, { tipo, nome, ocorrencias: 0, qtdAfetada: 0, ops: new Set() });
      const c = causadorMap.get(key)!;
      c.ocorrencias += 1;
      c.qtdAfetada += qtd;
      c.ops.add(op);
    };

    for (const op of opsNoPeriodo) {
      const opInsps = enriched.filter(i => i.op === op);
      const order = opInsps[0]?.order;
      const pedido = Number(order?.qtd_total) || 0;
      totalPedidas += pedido;

      // Agregar saldos da producao inicial (impressão)
      let aprovadas = 0;
      let emEscolha = 0;
      let reprovadas = 0;
      let hasEscolha = false;
      let worstStatus = 'APPROVED';
      // Produto Acabado (boas que chegaram ao final)
      let boasPA = 0;

      // Deduplicar: mesma rodada pode ter sido salva mais de uma vez (teste, save-and-continue)
      // Dados vêm por created_at DESC, então o primeiro de cada rodada é o mais recente.
      const seenRodadaIni = new Set<number>();
      const seenRodadaPA = new Set<number>();

      for (const insp of opInsps) {
        const numRodada = Number(insp.obs.numero_rodada) || Number(insp.obs.laudo_numero) || 1;

        const saldo = insp.obs.saldo_unidades;
        if (saldo && !seenRodadaIni.has(numRodada)) {
          seenRodadaIni.add(numRodada);
          aprovadas += Number(saldo.aprovadas) || 0;
          emEscolha += Number(saldo.em_escolha) || 0;
          reprovadas += Number(saldo.reprovadas) || 0;
        }
        if (insp.obs.process_area === 'produto_acabado' && insp.obs.producao && !seenRodadaPA.has(numRodada)) {
          seenRodadaPA.add(numRodada);
          boasPA += Math.max(0, (Number(insp.obs.producao.qty_produzida) || 0) - (Number(insp.obs.producao.qty_escolha) || 0) - (Number(insp.obs.producao.qty_refugo) || 0));
        }
        if (emEscolha > 0 || (insp.obs.envio_escolha && insp.obs.envio_escolha.length > 0)) {
          hasEscolha = true;
        }
        if (insp.status === 'REJECTED') worstStatus = 'REJECTED';
        else if (insp.status === 'RESTRICTED' && worstStatus !== 'REJECTED') worstStatus = 'RESTRICTED';
      }

      // Etapas de acabamento (corte/vinco, colagem) + revisão final
      const acabRecs = acabByOp.get(op) ?? [];
      const cvAprov = acabRecs.filter(r => r.modulo === 'corte_vinco').reduce((s, r) => s + (Number(r.qty_aprovadas) || 0), 0);
      const colAprov = acabRecs.filter(r => r.modulo === 'colagem').reduce((s, r) => s + (Number(r.qty_aprovadas) || 0), 0);
      if (acabRecs.some(r => (r.modulo === 'corte_vinco' || r.modulo === 'colagem') && (Number(r.qty_reprovadas) || 0) > 0)) hasEscolha = true;

      // Revisão Final: usa o veredito salvo (latest)
      const revRec = acabRecs
        .filter(r => r.modulo === 'revisao_final')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      const revDef = revRec?.defects ?? null;
      const palletsReprovados = (palletsByOp.get(op) ?? []).filter(p => p.result === 'REJECTED').length;

      let entregueFinal: number;
      let aprovadoDireto: number;
      let recuperado = 0, refugadoRevisao = 0, custoRevisao = 0, pessoas = 0, horas = 0;
      let fechou: boolean | null = null;
      let statusFinal = '';
      const temRevisao = !!revDef && (revDef.tipo === 'revisao_final_v2' || revDef.quantidade_final_aprovada != null);

      if (temRevisao) {
        recuperado = Number(revDef.quantidade_recuperada_revisao) || 0;
        refugadoRevisao = Number(revDef.quantidade_refugada_revisao) || 0;
        aprovadoDireto = Number(revDef.quantidade_aprovado_direto ?? revDef.quantidade_boa_produto_acabado) || 0;
        entregueFinal = Number(revDef.quantidade_final_aprovada);
        if (!Number.isFinite(entregueFinal)) entregueFinal = aprovadoDireto + recuperado;
        custoRevisao = Number(revDef.custo_revisao) || 0;
        pessoas = Number(revDef.total_pessoas) || 0;
        horas = Number(revDef.total_horas) || 0;
        fechou = typeof revDef.fechou_pedido === 'boolean' ? revDef.fechou_pedido : entregueFinal >= pedido;
        statusFinal = revDef.status_final || (fechou ? 'fechou' : 'nao_fechou');

        // Causadores apontados na revisão
        const problemas = Array.isArray(revDef.problemas) ? revDef.problemas : [];
        for (const p of problemas) {
          const qtd = Number(p.qty_afetada) || 0;
          if (p.setor) addCausador('setor', String(p.setor), qtd, op);
          const opNome = p.operador_nome || operatorMap.get(p.operador_id) || '';
          if (opNome) addCausador('operador', opNome, qtd, op);
          if (p.maquina_nome || p.maquina) addCausador('maquina', String(p.maquina_nome || p.maquina), qtd, op);
        }
      } else {
        // Sem revisão ainda: usa as boas da etapa mais avançada concluída
        aprovadoDireto = boasPA > 0 ? boasPA : colAprov > 0 ? colAprov : cvAprov > 0 ? cvAprov : aprovadas;
        entregueFinal = aprovadoDireto;
      }

      const perda = Math.max(0, pedido - entregueFinal);
      totalEntregues += entregueFinal;
      if (hasEscolha) opsComEscolha++;

      // Status final: prioriza o veredito da revisão
      let statusLabel: string;
      if (temRevisao) {
        statusLabel = fechou ? 'Aprovada' : 'Reprovada';
      } else {
        statusLabel = worstStatus === 'APPROVED' ? 'Aprovada' : worstStatus === 'REJECTED' ? 'Reprovada' : 'Restricao';
      }
      if (statusLabel === 'Aprovada') opsAprovadas++;
      else if (statusLabel === 'Reprovada') opsReprovadas++;

      opDetailsMap.set(op, {
        op,
        cliente: order?.cliente || order?.produto || '—',
        pedido,
        entregue: entregueFinal,
        perda,
        status: statusLabel,
      });

      vereditos.push({
        op,
        cliente: order?.cliente || order?.produto || '—',
        pedido,
        aprovadoDireto,
        recuperado,
        refugadoRevisao,
        entregueFinal,
        saldo: entregueFinal - pedido,
        fechou,
        statusFinal,
        custoRevisao,
        pessoas,
        horas,
        palletsReprovados,
        temRevisao,
      });
    }

    const causadores: Causador[] = Array.from(causadorMap.values())
      .sort((a, b) => b.qtdAfetada - a.qtdAfetada || b.ocorrencias - a.ocorrencias);

    const totalPerdidas = Math.max(0, totalPedidas - totalEntregues);

    // Operadores — agregar por operador
    const operatorStats = new Map<string, { ops: Set<string>; machines: Set<string>; defects: Record<string, number>; totalDefects: number; totalVerificadas: number }>();

    for (const insp of initialInsp) {
      const opIds: string[] = Array.isArray(insp.obs.all_operator_ids) ? insp.obs.all_operator_ids : (insp.operator_id ? [insp.operator_id] : []);
      const machId = insp.machine_id || '';
      const metricas = insp.obs.metricas_falha || {};
      const taxaCombinada = Number(metricas.taxa_combinada) || 0;
      const rodadaUnidades = Number(insp.obs.producao?.quantidade_rodada_unidades) || 0;

      // Coletar defeitos
      const defeitosUnidade = insp.obs.defeitos?.por_unidade || {};
      const defeitosFolha = insp.obs.defeitos?.por_folha || {};

      for (const opId of opIds) {
        if (!operatorStats.has(opId)) {
          operatorStats.set(opId, { ops: new Set(), machines: new Set(), defects: {}, totalDefects: 0, totalVerificadas: 0 });
        }
        const stat = operatorStats.get(opId)!;
        stat.ops.add(insp.op);
        if (machId) stat.machines.add(machId);
        stat.totalVerificadas += rodadaUnidades;

        // Acumular defeitos por tipo
        for (const [key, val] of Object.entries(defeitosUnidade)) {
          const count = typeof val === 'object' && val !== null ? (Number((val as any).count) || 0) : (Number(val) || 0);
          stat.defects[key] = (stat.defects[key] || 0) + count;
          stat.totalDefects += count;
        }
        for (const [key, val] of Object.entries(defeitosFolha)) {
          const count = Number(val) || 0;
          stat.defects[key] = (stat.defects[key] || 0) + count;
          stat.totalDefects += count;
        }
      }
    }

    const operatorProblems: ManagementOperatorProblem[] = Array.from(operatorStats.entries())
      .map(([opId, stat]) => {
        const topDefect = Object.entries(stat.defects).sort((a, b) => b[1] - a[1])[0];
        const taxa = stat.totalVerificadas > 0 ? ((stat.totalDefects / stat.totalVerificadas) * 100).toFixed(1) + '%' : '—';
        const machNames = Array.from(stat.machines).map(mid => machineMap.get(mid) || '—').join(', ');
        return {
          operador: operatorMap.get(opId) || 'Desconhecido',
          maquina: machNames || '—',
          ops: stat.ops.size,
          defeitoPrincipal: topDefect ? topDefect[0] : '—',
          taxaMedia: taxa,
        };
      })
      .sort((a, b) => b.ops - a.ops);

    // Maquinas — agregar por maquina
    const machineStats = new Map<string, { ops: Set<string>; operators: Set<string>; defects: Record<string, number>; totalDefects: number; totalVerificadas: number }>();

    for (const insp of initialInsp) {
      const machId = insp.machine_id;
      if (!machId) continue;
      const opIds: string[] = Array.isArray(insp.obs.all_operator_ids) ? insp.obs.all_operator_ids : [];
      const rodadaUnidades = Number(insp.obs.producao?.quantidade_rodada_unidades) || 0;

      if (!machineStats.has(machId)) {
        machineStats.set(machId, { ops: new Set(), operators: new Set(), defects: {}, totalDefects: 0, totalVerificadas: 0 });
      }
      const stat = machineStats.get(machId)!;
      stat.ops.add(insp.op);
      for (const oid of opIds) stat.operators.add(oid);
      stat.totalVerificadas += rodadaUnidades;

      const defeitosUnidade = insp.obs.defeitos?.por_unidade || {};
      const defeitosFolha = insp.obs.defeitos?.por_folha || {};
      for (const [key, val] of Object.entries(defeitosUnidade)) {
        const count = typeof val === 'object' && val !== null ? (Number((val as any).count) || 0) : (Number(val) || 0);
        stat.defects[key] = (stat.defects[key] || 0) + count;
        stat.totalDefects += count;
      }
      for (const [key, val] of Object.entries(defeitosFolha)) {
        const count = Number(val) || 0;
        stat.defects[key] = (stat.defects[key] || 0) + count;
        stat.totalDefects += count;
      }
    }

    const machineProblems: ManagementMachineProblem[] = Array.from(machineStats.entries())
      .map(([machId, stat]) => {
        const topDefect = Object.entries(stat.defects).sort((a, b) => b[1] - a[1])[0];
        const taxa = stat.totalVerificadas > 0 ? ((stat.totalDefects / stat.totalVerificadas) * 100).toFixed(1) + '%' : '—';
        return {
          maquina: machineMap.get(machId) || 'Desconhecida',
          operadores: stat.operators.size,
          ops: stat.ops.size,
          defeitoRecorrente: topDefect ? topDefect[0] : '—',
          taxa,
        };
      })
      .sort((a, b) => b.ops - a.ops);

    // Reimpressoes
    const profileMap = new Map<string, string>(userProfiles.map((p: any) => [p.user_id, p.full_name ?? '']));
    const reimpressoesData: ManagementReimpressao[] = reimpressoes.map((r: any) => {
      const order = orderMap.get(r.order_id) as any;
      return {
        op: order?.op || '—',
        rodada: r.numero_rodada || 1,
        motivo: r.motivo || '',
        solicitante: (r.solicitada_por && profileMap.get(r.solicitada_por)) || '—',
        quantidade: r.quantidade_unid || 0,
      };
    });

    // KPIs
    const totalUnidadesRodadas = initialInsp.reduce((sum, i) => sum + (Number(i.obs.producao?.quantidade_rodada_unidades) || 0), 0);
    const totalDefectsAll = initialInsp.reduce((sum, i) => {
      const defU = i.obs.defeitos?.por_unidade || {};
      const defF = i.obs.defeitos?.por_folha || {};
      let d = 0;
      for (const val of Object.values(defU)) d += typeof val === 'object' && val !== null ? (Number((val as any).count) || 0) : (Number(val) || 0);
      for (const val of Object.values(defF)) d += Number(val) || 0;
      return sum + d;
    }, 0);

    const totalEscolhaUnid = initialInsp.reduce((sum, i) => sum + (Number(i.obs.saldo_unidades?.em_escolha) || 0), 0);

    return {
      periodLabel,
      generatedAt: new Date().toLocaleString('pt-BR'),
      summary: {
        totalOps: opsNoPeriodo.length,
        totalUnidadesPedidas: totalPedidas,
        totalUnidadesEntregues: totalEntregues,
        totalUnidadesPerdidas: totalPerdidas,
        totalReimpressoes: reimpressoes.length,
        opsComEscolha,
        opsAprovadas,
        opsReprovadas,
      },
      opDetails: Array.from(opDetailsMap.values()),
      operatorProblems,
      machineProblems,
      reimpressoes: reimpressoesData,
      kpis: {
        eficienciaProducao: pct(totalEntregues, totalPedidas),
        taxaMediaDefeitos: totalUnidadesRodadas > 0 ? ((totalDefectsAll / totalUnidadesRodadas) * 100).toFixed(1) + '%' : '—',
        taxaEscolha: totalUnidadesRodadas > 0 ? ((totalEscolhaUnid / totalUnidadesRodadas) * 100).toFixed(1) + '%' : '—',
        taxaReimpressao: opsNoPeriodo.length > 0 ? ((reimpressoes.length / opsNoPeriodo.length) * 100).toFixed(1) + '%' : '—',
        aprovacaoSemRestricao: opsNoPeriodo.length > 0 ? ((opsAprovadas / opsNoPeriodo.length) * 100).toFixed(1) + '%' : '—',
      },
      vereditos,
      causadores,
    };
  }, [loading, inspections, orders, machines, operators, reimpressoes, userProfiles, acabamentoRegs, palletInsps, periodLabel]);

  // Gerar PDF
  const handleGeneratePDF = useCallback(() => {
    if (!reportData) return;
    setGenerating(true);
    try {
      reportService.generateManagementReportPDF(reportData, { save: true });
      showToast('Relatorio gerencial gerado com sucesso', 'success');
    } catch (err: any) {
      showToast(`Erro ao gerar PDF: ${err.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  }, [reportData, showToast]);

  // Gerar Excel (lazy import)
  const handleGenerateExcel = useCallback(async () => {
    if (!reportData) return;
    try {
      const { exportManagementReportXlsx } = await import('../services/excelExportService');
      exportManagementReportXlsx(reportData);
      showToast('Planilha Excel gerada com sucesso', 'success');
    } catch (err: any) {
      showToast(`Erro ao gerar Excel: ${err.message}`, 'error');
    }
  }, [reportData, showToast]);

  // ─── Render ────────────────────────────────────────────────────────────────
  const s = reportData?.summary;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white">Relatorio Gerencial</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">Relatorio de accountability e eficiencia para a direcao</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateExcel}
            disabled={!reportData}
            className="h-10 px-5 rounded-xl border-2 border-emerald-500 text-emerald-600 font-black text-[10px] tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all disabled:opacity-50 uppercase flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">table_chart</span>
            Excel
          </button>
          <button
            onClick={handleGeneratePDF}
            disabled={!reportData || generating}
            className="h-10 px-5 rounded-xl bg-primary text-white font-black text-[10px] tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50 uppercase flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
            {generating ? 'Gerando...' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Filtros de periodo */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Periodo</p>
        <div className="flex flex-wrap gap-2">
          {([['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['custom', 'Personalizado']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPreset(val)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${preset === val
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex gap-3 mt-3">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium" />
            <span className="text-sm text-slate-400 self-center">ate</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium" />
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-2 font-medium">{periodLabel}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : !reportData || inspections.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300 mb-3">analytics</span>
          <p className="text-sm font-bold text-slate-500">Nenhuma inspecao encontrada no periodo selecionado.</p>
        </div>
      ) : (
        <>
          {/* 1. Resumo Executivo */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">1. Resumo Executivo</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'OPs no periodo', value: fmt(s!.totalOps), icon: 'receipt_long', color: 'indigo' },
                { label: 'Unid. pedidas', value: fmt(s!.totalUnidadesPedidas), icon: 'inventory', color: 'slate' },
                { label: 'Unid. entregues', value: `${fmt(s!.totalUnidadesEntregues)} (${pct(s!.totalUnidadesEntregues, s!.totalUnidadesPedidas)})`, icon: 'check_circle', color: 'emerald' },
                { label: 'Unid. perdidas', value: `${fmt(s!.totalUnidadesPerdidas)} (${pct(s!.totalUnidadesPerdidas, s!.totalUnidadesPedidas)})`, icon: 'error', color: 'rose' },
                { label: 'Reimpressoes', value: String(s!.totalReimpressoes), icon: 'refresh', color: 'amber' },
                { label: 'OPs com escolha', value: String(s!.opsComEscolha), icon: 'filter_alt', color: 'amber' },
                { label: 'OPs aprovadas', value: String(s!.opsAprovadas), icon: 'thumb_up', color: 'emerald' },
                { label: 'OPs reprovadas', value: String(s!.opsReprovadas), icon: 'thumb_down', color: 'rose' },
              ].map(card => (
                <div key={card.label} className={`rounded-xl border p-3 ${cardStyle(card.color).box}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`material-symbols-outlined text-sm ${cardStyle(card.color).icon}`}>{card.icon}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{card.label}</span>
                  </div>
                  <p className={`text-lg font-black ${cardStyle(card.color).value}`}>{card.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Detalhamento por OP */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">2. Detalhamento por OP</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    {['OP', 'Cliente', 'Pedido', 'Entregue final', 'Perda', 'Status'].map(h => (
                      <th key={h} className="p-2.5 font-black uppercase text-slate-400 text-[9px] tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {reportData.opDetails.map(op => (
                    <tr key={op.op} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="p-2.5 font-black text-slate-800 dark:text-slate-200">{op.op}</td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{op.cliente}</td>
                      <td className="p-2.5 font-bold text-right">{fmt(op.pedido)}</td>
                      <td className="p-2.5 font-bold text-right text-emerald-600">{fmt(op.entregue)}</td>
                      <td className="p-2.5 font-bold text-right text-rose-600">{fmt(op.perda)}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          op.status === 'Aprovada' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                          op.status === 'Reprovada' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' :
                          'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}>{op.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2b. Veredito Final por OP (Revisão Final) */}
          {reportData.vereditos.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-primary/30 p-5 shadow-sm">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Veredito Final por OP</h2>
              <p className="text-[10px] text-slate-400 mb-4 font-medium">Resultado real após a Revisão Final — deu o pedido / faltou, esforço e custo da revisão</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {['OP', 'Pedido', 'Aprov. direto', 'Recuperado', 'Entregue final', 'Resultado', 'Pessoas', 'Horas', 'Custo rev.', 'Status'].map(h => (
                        <th key={h} className="p-2.5 font-black uppercase text-slate-400 text-[9px] tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {[...reportData.vereditos]
                      .sort((a, b) => {
                        const rank = (v: VereditoOp) => v.temRevisao ? (v.fechou ? 2 : 0) : 1;
                        return rank(a) - rank(b) || a.saldo - b.saldo;
                      })
                      .map(v => (
                        <tr key={v.op} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 ${v.temRevisao && v.fechou === false ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''}`}>
                          <td className="p-2.5 font-black text-slate-800 dark:text-slate-200">{v.op}</td>
                          <td className="p-2.5 text-right font-bold">{fmt(v.pedido)}</td>
                          <td className="p-2.5 text-right text-slate-600 dark:text-slate-400">{fmt(v.aprovadoDireto)}</td>
                          <td className="p-2.5 text-right text-emerald-600">{v.recuperado > 0 ? fmt(v.recuperado) : '—'}</td>
                          <td className="p-2.5 text-right font-black text-slate-800 dark:text-white">{fmt(v.entregueFinal)}</td>
                          <td className={`p-2.5 text-right font-black ${v.saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {!v.temRevisao ? '—' : v.saldo >= 0 ? `sobra ${fmt(v.saldo)}` : `falta ${fmt(Math.abs(v.saldo))}`}
                          </td>
                          <td className="p-2.5 text-center text-slate-600 dark:text-slate-400">{v.pessoas || '—'}</td>
                          <td className="p-2.5 text-center text-slate-600 dark:text-slate-400">{v.horas ? v.horas.toFixed(1) : '—'}</td>
                          <td className="p-2.5 text-right text-slate-600 dark:text-slate-400">{v.custoRevisao > 0 ? fmtMoney(v.custoRevisao) : '—'}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase whitespace-nowrap ${
                              !v.temRevisao ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' :
                              v.fechou ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                              'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                            }`}>
                              {!v.temRevisao ? 'Em produção' : v.fechou ? 'Deu o pedido' : 'Não fechou'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2c. Causadores apontados na Revisão Final */}
          {reportData.causadores.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Causadores Apontados na Revisão</h2>
              <p className="text-[10px] text-slate-400 mb-4 font-medium">Setores, máquinas e operadores indicados como origem dos problemas — base para ação da direção</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {['Origem', 'Tipo', 'Ocorrências', 'Qtd. afetada', 'OPs'].map(h => (
                        <th key={h} className="p-2.5 font-black uppercase text-slate-400 text-[9px] tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {reportData.causadores.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200 capitalize">{c.nome}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            c.tipo === 'setor' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' :
                            c.tipo === 'maquina' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' :
                            'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}>{c.tipo}</span>
                        </td>
                        <td className="p-2.5 text-center font-bold">{c.ocorrencias}</td>
                        <td className="p-2.5 text-right font-black text-rose-600">{c.qtdAfetada > 0 ? fmt(c.qtdAfetada) : '—'}</td>
                        <td className="p-2.5 text-center text-slate-500">{c.ops.size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Operadores */}
          {reportData.operatorProblems.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">3. Problemas por Operador</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {['Operador', 'Maquina', 'OPs', 'Defeito Principal', 'Taxa Media'].map(h => (
                        <th key={h} className="p-2.5 font-black uppercase text-slate-400 text-[9px] tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {reportData.operatorProblems.map((op, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{op.operador}</td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-400">{op.maquina}</td>
                        <td className="p-2.5 font-bold text-center">{op.ops}</td>
                        <td className="p-2.5 capitalize">{op.defeitoPrincipal}</td>
                        <td className="p-2.5 font-black text-center">{op.taxaMedia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. Maquinas */}
          {reportData.machineProblems.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">4. Problemas por Maquina</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {['Maquina', 'Operadores', 'OPs', 'Defeito Recorrente', 'Taxa'].map(h => (
                        <th key={h} className="p-2.5 font-black uppercase text-slate-400 text-[9px] tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {reportData.machineProblems.map((mp, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{mp.maquina}</td>
                        <td className="p-2.5 text-center">{mp.operadores}</td>
                        <td className="p-2.5 font-bold text-center">{mp.ops}</td>
                        <td className="p-2.5 capitalize">{mp.defeitoRecorrente}</td>
                        <td className="p-2.5 font-black text-center">{mp.taxa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Reimpressoes */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">5. Reimpressoes</h2>
            {reportData.reimpressoes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {['OP', 'Rodada', 'Motivo', 'Qtd. (unid.)'].map(h => (
                        <th key={h} className="p-2.5 font-black uppercase text-slate-400 text-[9px] tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {reportData.reimpressoes.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-bold">{r.op}</td>
                        <td className="p-2.5 text-center">{r.rodada}</td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-400 truncate max-w-[200px]">{r.motivo}</td>
                        <td className="p-2.5 font-black text-right">{fmt(r.quantidade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs italic text-slate-400">Nenhuma reimpressao no periodo.</p>
            )}
          </div>

          {/* 6. Indicadores */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">6. Indicadores Consolidados</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Eficiencia de producao', value: reportData.kpis.eficienciaProducao, icon: 'speed', color: 'emerald' },
                { label: 'Taxa media de defeitos', value: reportData.kpis.taxaMediaDefeitos, icon: 'bug_report', color: 'rose' },
                { label: 'Taxa de escolha', value: reportData.kpis.taxaEscolha, icon: 'filter_alt', color: 'amber' },
                { label: 'Taxa de reimpressao', value: reportData.kpis.taxaReimpressao, icon: 'refresh', color: 'indigo' },
                { label: 'Aprovacao sem restricao', value: reportData.kpis.aprovacaoSemRestricao, icon: 'verified', color: 'emerald' },
              ].map(kpi => (
                <div key={kpi.label} className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                  <span className={`material-symbols-outlined text-2xl ${cardStyle(kpi.color).icon}`}>{kpi.icon}</span>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{kpi.label}</p>
                    <p className="text-xl font-black text-slate-800 dark:text-white">{kpi.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
