import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { reportService } from '../services/reportService';
import { ProcessType } from '../types';

type AreaFilter = 'ALL' | 'INITIAL' | 'FINAL';
type PeriodPreset = '30' | '90' | '365' | 'ALL';

type InspectionRecord = {
  id: string;
  op: string;
  order_id?: string | null;
  status?: string;
  process_type?: string;
  created_at: string;
  observations?: string;
  samples_count?: number;
  rework_count?: number;
  machine_id?: string;
  operator_id?: string;
  machines?: { name?: string };
  operators?: { name?: string };
  orders?: { id: string; op: string } | Array<{ id: string; op: string }>;
};

type NormalizedRecord = InspectionRecord & {
  area: 'initial' | 'final';
  defects: Array<{ name: string; count: number }>;
  total_defects: number;
  operatorNames: string[];
};

type AreaSummary = {
  records: NormalizedRecord[];
  inspections: number;
  defects: number;
  samples: number;
  rework: number;
  approved: number;
  rejected: number;
  restricted: number;
};

type OpTraceSummary = {
  op: string;
  initial: number;
  final: number;
  initialDefects: number;
  finalDefects: number;
  latest: string;
};

type AcabamentoReg = {
  id: string;
  op: string;
  modulo: string;
  timestamp: string;
  qty_revisadas: number;
  qty_aprovadas: number;
  qty_reprovadas: number;
  defects: Record<string, number> | null;
  operator_ids: string[] | null;
  machine_id: string | null;
};

type OpFlowSummary = {
  op: string;
  latest: string;
  impressao:  { rodadas: number; escolha: number; desvios: number };
  corteVinco: { rodadas: number; escolha: number; desvios: number };
  colagem:    { rodadas: number; escolha: number; desvios: number };
  prodAcabado:{ pallets: number; aprovados: number; reprovados: number };
  revisaoFinal:{ qtyBoa: number; qtyRefugo: number; status: string };
};

const asNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseObservations = (observations?: string) => {
  if (!observations) return {};
  if (!observations.trim().startsWith('{')) return {};
  try {
    return JSON.parse(observations);
  } catch {
    return {};
  }
};

const normalizeDefects = (raw: any): Array<{ name: string; count: number }> => {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((item) => ({
        name: String(item?.name || item?.label || 'Outros'),
        count: asNumber(item?.count ?? item?.value ?? item?.qty),
      }))
      .filter((item) => item.count > 0);
  }

  if (typeof raw === 'object') {
    // Formato InspectionView: { por_folha: {...}, por_unidade: { key: { count: N, por_faca: {...} } } }
    if (raw.por_unidade && typeof raw.por_unidade === 'object') {
      return Object.entries(raw.por_unidade)
        .map(([name, val]: [string, any]) => ({
          name: name.replace(/_/g, ' '),
          count: asNumber(typeof val === 'object' ? val?.count : val),
        }))
        .filter((item) => item.count > 0);
    }

    // Formato FinishingView: { critical: {...}, major: {...}, minor: {...} }
    const groups = ['critical', 'major', 'minor'];
    const hasGroups = groups.some((group) => raw[group] && typeof raw[group] === 'object');
    if (hasGroups) {
      return groups
        .flatMap((group) =>
          Object.entries(raw[group] || {}).map(([name, count]) => ({
            name: name.replace(/_/g, ' '),
            count: asNumber(count),
          }))
        )
        .filter((item) => item.count > 0);
    }

    return Object.entries(raw)
      .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count: asNumber(count) }))
      .filter((item) => item.count > 0);
  }

  return [];
};

// Extrai todos os defeitos de uma observação (offset + UV + HS)
const extractAllDefects = (obs: any): Array<{ name: string; count: number }> => {
  const result: Array<{ name: string; count: number }> = [];

  // InspectionView: obs.defeitos (português)
  const rawDefeitos = obs.defeitos ?? obs.defects;
  result.push(...normalizeDefects(rawDefeitos));

  // UV
  if (obs.verniz_uv?.aplicavel && obs.verniz_uv?.defeitos) {
    normalizeDefects(obs.verniz_uv.defeitos).forEach(d =>
      result.push({ name: `UV: ${d.name}`, count: d.count })
    );
  }
  // Hot Stamping
  if (obs.hot_stamping?.aplicavel && obs.hot_stamping?.defeitos) {
    normalizeDefects(obs.hot_stamping.defeitos).forEach(d =>
      result.push({ name: `HS: ${d.name}`, count: d.count })
    );
  }

  return result;
};

const getArea = (record: InspectionRecord, obs: any): 'initial' | 'final' => {
  if (
    record.process_type === ProcessType.ACABAMENTO ||
    obs.process_type === ProcessType.ACABAMENTO ||
    obs.process_area === 'produto_acabado' ||
    obs.is_spreadsheet_analysis === true ||
    obs.is_finishing_laudo === true
  ) {
    return 'final';
  }
  return 'initial';
};

const formatWeekKey = (date: Date) => {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`;
};

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));
const getJoinedOrder = (orders: InspectionRecord['orders']) => Array.isArray(orders) ? orders[0] : orders;

const createAreaSummary = (records: NormalizedRecord[]): AreaSummary => ({
  records,
  inspections: records.length,
  defects: records.reduce((sum, record) => sum + record.total_defects, 0),
  samples: records.reduce((sum, record) => sum + asNumber(record.samples_count), 0),
  rework: records.reduce((sum, record) => sum + asNumber(record.rework_count), 0),
  approved: records.filter((record) => record.status === 'APPROVED').length,
  rejected: records.filter((record) => record.status === 'REJECTED').length,
  restricted: records.filter((record) => record.status === 'RESTRICTED').length,
});

const ReportsView = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [abRecs, setAbRecs] = useState<AcabamentoReg[]>([]);
  const [operators, setOperators] = useState<Array<{ id: string; name: string }>>([]);
  const [opFilter, setOpFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('ALL');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('90');
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [isSending, setIsSending] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [insRes, opRes, abRes] = await Promise.all([
        supabase.from('inspections')
          .select('*, orders!inner(id, op), machines(name), operators(name), analysts(name)')
          .order('created_at', { ascending: true }),
        supabase.from('operators').select('id, name'),
        supabase.from('acabamento_registros')
          .select('id, op, modulo, timestamp, qty_revisadas, qty_aprovadas, qty_reprovadas, defects, operator_ids, machine_id')
          .in('modulo', ['corte_vinco', 'colagem', 'revisao_final'])
          .order('timestamp', { ascending: true }),
      ]);

      if (insRes.error) throw insRes.error;
      if (opRes.error) throw opRes.error;

      setRecords((insRes.data || [])
        .filter((record: any) => {
          const order = getJoinedOrder(record.orders);
          return (
            !!record.status &&
            !!record.order_id &&
            order?.id === record.order_id &&
            String(order?.op || '').trim().toUpperCase() === String(record.op || '').trim().toUpperCase()
          );
        })
        .map((record: any) => ({ ...record, op: getJoinedOrder(record.orders)?.op || record.op })));
      setOperators(opRes.data || []);
      setAbRecs((abRes.data || []) as AcabamentoReg[]);
    } catch (err) {
      showToast('Erro ao carregar relatórios', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const normalizedRecords = useMemo<NormalizedRecord[]>(() => {
    return records.map((record) => {
      const obs = parseObservations(record.observations);
      const defects = extractAllDefects(obs);

      // Total: preferir metricas_falha (InspectionView v2), depois totalDefects, depois soma dos defeitos
      const total =
        asNumber(obs.metricas_falha?.falhas_por_unidade) ||
        asNumber(obs.totalDefects) ||
        defects.reduce((sum, d) => sum + d.count, 0) +
        asNumber(record.rework_count);

      const operatorIds = Array.isArray(obs.all_operator_ids)
        ? obs.all_operator_ids
        : record.operator_id
          ? [record.operator_id]
          : [];

      const fallbackOperatorName = obs.operator_name || obs.operador || record.operators?.name || 'N/A';

      return {
        ...record,
        process_type: record.process_type || obs.process_type || ProcessType.OFFSET,
        area: getArea(record, obs),
        defects,
        total_defects: total,
        operatorNames: operatorIds.length > 0
          ? operatorIds.map((id: string) => operators.find((operator) => operator.id === id)?.name || 'Desconhecido')
          : [fallbackOperatorName],
      };
    });
  }, [operators, records]);

  const opOptions = useMemo(() => {
    return Array.from(new Set<string>(normalizedRecords.map((record) => String(record.op || ''))))
      .filter((op): op is string => op.length > 0)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [normalizedRecords]);

  const reportData = useMemo(() => {
    const now = new Date();
    const minDate = (() => {
      if (periodPreset === 'ALL') return null;
      const date = new Date(now);
      date.setDate(date.getDate() - Number(periodPreset));
      return date;
    })();

    const op = opFilter.trim().toLowerCase();
    const filtered = normalizedRecords.filter((record) => {
      if (op && !record.op.toLowerCase().includes(op)) return false;
      if (areaFilter === 'INITIAL' && record.area !== 'initial') return false;
      if (areaFilter === 'FINAL' && record.area !== 'final') return false;
      if (minDate && new Date(record.created_at) < minDate) return false;
      return true;
    });

    const totals = {
      inspections: filtered.length,
      defects: 0,
      approved: 0,
      rejected: 0,
      restricted: 0,
      samples: 0,
      rework: 0,
      initial: 0,
      final: 0,
    };

    const byMachine = new Map<string, number>();
    const byOperator = new Map<string, number>();
    const byDefect = new Map<string, number>();
    const weekly = new Map<string, { inspections: number; defects: number }>();
    const monthly = new Map<string, { inspections: number; defects: number }>();
    const annual = new Map<string, { inspections: number; defects: number }>();

    filtered.forEach((record) => {
      totals.defects += record.total_defects;
      totals.samples += asNumber(record.samples_count);
      totals.rework += asNumber(record.rework_count);
      if (record.area === 'initial') totals.initial += 1;
      if (record.area === 'final') totals.final += 1;
      if (record.status === 'APPROVED') totals.approved += 1;
      if (record.status === 'REJECTED') totals.rejected += 1;
      if (record.status === 'RESTRICTED') totals.restricted += 1;

      byMachine.set(record.machines?.name || 'N/A', (byMachine.get(record.machines?.name || 'N/A') || 0) + record.total_defects);
      record.operatorNames.forEach((name) => {
        byOperator.set(name, (byOperator.get(name) || 0) + record.total_defects);
      });
      record.defects.forEach((defect) => {
        byDefect.set(defect.name, (byDefect.get(defect.name) || 0) + defect.count);
      });

      const date = new Date(record.created_at);
      const weekKey = formatWeekKey(date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${date.getFullYear()}`;

      const week = weekly.get(weekKey) || { inspections: 0, defects: 0 };
      week.inspections += 1;
      week.defects += record.total_defects;
      weekly.set(weekKey, week);

      const month = monthly.get(monthKey) || { inspections: 0, defects: 0 };
      month.inspections += 1;
      month.defects += record.total_defects;
      monthly.set(monthKey, month);

      const year = annual.get(yearKey) || { inspections: 0, defects: 0 };
      year.inspections += 1;
      year.defects += record.total_defects;
      annual.set(yearKey, year);
    });

    const toSortedArray = (map: Map<string, number>) =>
      Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    const toSeries = (map: Map<string, { inspections: number; defects: number }>) =>
      Array.from(map.entries())
        .map(([label, values]) => ({ label, inspections: values.inspections, defects: values.defects }))
        .sort((a, b) => a.label.localeCompare(b.label));

    return {
      filtered,
      totals,
      initialSummary: createAreaSummary(filtered.filter((record) => record.area === 'initial')),
      finalSummary: createAreaSummary(filtered.filter((record) => record.area === 'final')),
      topMachines: toSortedArray(byMachine).slice(0, 10),
      topOperators: toSortedArray(byOperator).slice(0, 10),
      topDefects: toSortedArray(byDefect).slice(0, 10),
      weekly: toSeries(weekly).slice(-12),
      monthly: toSeries(monthly).slice(-12),
      annual: toSeries(annual).slice(-5),
    };
  }, [areaFilter, normalizedRecords, opFilter, periodPreset]);

  const opTraceRows = useMemo<OpTraceSummary[]>(() => {
    const byOp = new Map<string, OpTraceSummary>();

    reportData.filtered.forEach((record) => {
      const op = String(record.op || 'Sem OP');
      const current = byOp.get(op) || {
        op,
        initial: 0,
        final: 0,
        initialDefects: 0,
        finalDefects: 0,
        latest: record.created_at,
      };

      if (record.area === 'initial') {
        current.initial += 1;
        current.initialDefects += record.total_defects;
      } else {
        current.final += 1;
        current.finalDefects += record.total_defects;
      }

      if (new Date(record.created_at) > new Date(current.latest)) {
        current.latest = record.created_at;
      }

      byOp.set(op, current);
    });

    return Array.from(byOp.values())
      .sort((a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime())
      .slice(0, 80);
  }, [reportData.filtered]);

  // Fluxo completo por OP: cruza inspections + acabamento_registros
  const opFlowRows = useMemo<OpFlowSummary[]>(() => {
    const now = new Date();
    const minDate = periodPreset === 'ALL' ? null : (() => {
      const d = new Date(now);
      d.setDate(d.getDate() - Number(periodPreset));
      return d;
    })();

    const opFilter_ = opFilter.trim().toLowerCase();
    const byOp = new Map<string, OpFlowSummary>();

    const getOrCreate = (op: string): OpFlowSummary => {
      if (!byOp.has(op)) byOp.set(op, {
        op, latest: '',
        impressao:   { rodadas: 0, escolha: 0, desvios: 0 },
        corteVinco:  { rodadas: 0, escolha: 0, desvios: 0 },
        colagem:     { rodadas: 0, escolha: 0, desvios: 0 },
        prodAcabado: { pallets: 0, aprovados: 0, reprovados: 0 },
        revisaoFinal:{ qtyBoa: 0, qtyRefugo: 0, status: '' },
      });
      return byOp.get(op)!;
    };

    const updateLatest = (row: OpFlowSummary, ts: string) => {
      if (!row.latest || ts > row.latest) row.latest = ts;
    };

    // Impressão e Produto Acabado — de inspections
    for (const rec of normalizedRecords) {
      if (opFilter_ && !rec.op.toLowerCase().includes(opFilter_)) continue;
      if (minDate && new Date(rec.created_at) < minDate) continue;
      const obs = parseObservations(rec.observations);
      const row = getOrCreate(rec.op);
      updateLatest(row, rec.created_at);
      if (rec.area === 'initial') {
        row.impressao.rodadas += asNumber(obs.saldo_unidades?.rodadas);
        row.impressao.escolha += asNumber(obs.saldo_unidades?.em_escolha);
        row.impressao.desvios += rec.total_defects;
      } else {
        // Produto Acabado — conta pallets de pallet_inspections via obs
        row.prodAcabado.reprovados += rec.total_defects;
      }
    }

    // Corte/Vinco, Colagem, Revisão Final — de acabamento_registros
    for (const ab of abRecs) {
      const op = String(ab.op || '').trim().toUpperCase();
      if (!op) continue;
      if (opFilter_ && !op.toLowerCase().includes(opFilter_)) continue;
      if (minDate && new Date(ab.timestamp) < minDate) continue;
      const row = getOrCreate(op);
      updateLatest(row, ab.timestamp);
      const defTotal = ab.defects
        ? Object.entries(ab.defects)
            .filter(([k]) => k !== 'qty_refugo')
            .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0)
        : 0;
      if (ab.modulo === 'corte_vinco') {
        row.corteVinco.rodadas += ab.qty_revisadas;
        row.corteVinco.escolha += ab.qty_reprovadas;
        row.corteVinco.desvios += defTotal;
      } else if (ab.modulo === 'colagem') {
        row.colagem.rodadas += ab.qty_revisadas;
        row.colagem.escolha += ab.qty_reprovadas;
        row.colagem.desvios += defTotal;
      } else if (ab.modulo === 'revisao_final' && ab.defects) {
        const def = ab.defects as Record<string, any>;
        if (def.resultado) {
          row.revisaoFinal.qtyBoa    += asNumber(def.resultado.qty_boa);
          row.revisaoFinal.qtyRefugo += asNumber(def.resultado.qty_refugada);
        }
        if (def.status_final && !row.revisaoFinal.status) row.revisaoFinal.status = String(def.status_final);
      }
    }

    return Array.from(byOp.values())
      .filter(r => r.latest)
      .sort((a, b) => b.latest.localeCompare(a.latest))
      .slice(0, 100);
  }, [normalizedRecords, abRecs, opFilter, periodPreset]);

  // Defeitos do acabamento para o ranking global
  const abDefectRanking = useMemo(() => {
    const map = new Map<string, number>();
    const minDate = periodPreset === 'ALL' ? null : (() => {
      const d = new Date();
      d.setDate(d.getDate() - Number(periodPreset));
      return d;
    })();
    for (const ab of abRecs) {
      if (minDate && new Date(ab.timestamp) < minDate) continue;
      if (!ab.defects) continue;
      for (const [k, v] of Object.entries(ab.defects)) {
        if (k === 'qty_refugo' || typeof v !== 'number' || v <= 0) continue;
        const label = `[${ab.modulo === 'corte_vinco' ? 'CV' : 'Col'}] ${k.replace(/_/g, ' ')}`;
        map.set(label, (map.get(label) || 0) + v);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [abRecs, periodPreset]);

  const pdfPayload = () => ({
    title: 'RELATÓRIO DE QUALIDADE',
    generatedAt: new Date().toLocaleString('pt-BR'),
    totals: reportData.totals,
    topMachines: reportData.topMachines,
    topOperators: reportData.topOperators,
    topDefects: reportData.topDefects,
    weekly: reportData.weekly,
    monthly: reportData.monthly,
    annual: reportData.annual,
  });

  const handleExport = async () => {
    try {
      await reportService.generateSummaryReportPDF(pdfPayload(), { save: true, returnBlob: false });
      showToast('Relatório gerado com sucesso', 'success');
    } catch (err: any) {
      showToast(`Erro ao gerar PDF: ${err.message}`, 'error');
    }
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) return;
    setIsSending(true);
    try {
      const pdfBlob = await reportService.generateSummaryReportPDF(pdfPayload(), {
        save: false,
        returnBlob: true,
        filename: 'RELATORIO_QUALIDADE.pdf',
      }) as Blob | null;

      if (!pdfBlob) throw new Error('Falha ao gerar PDF');
      await reportService.sendReportEmail({
        to: emailTo,
        subject: 'Relatório de Qualidade',
        filename: 'RELATORIO_QUALIDADE.pdf',
        pdfBlob,
      });
      showToast('Relatório enviado com sucesso', 'success');
      setIsEmailOpen(false);
      setEmailTo('');
    } catch (err: any) {
      showToast(`Erro ao enviar e-mail: ${err.message}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl animate-fade-in space-y-4 p-4 pb-20 md:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Relatórios de Qualidade</h1>
            <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              OP, processo inicial, produto acabado, operadores e desvios
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleExport}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-primary/90"
            >
              <span className="material-symbols-outlined text-base">download</span>
              Exportar PDF
            </button>
            <button
              onClick={() => setIsEmailOpen(true)}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            >
              <span className="material-symbols-outlined text-base">mail</span>
              Enviar e-mail
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">OP</span>
            <input
              value={opFilter}
              onChange={(event) => setOpFilter(event.target.value)}
              list="report-op-list"
              placeholder="Filtrar por OP"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <datalist id="report-op-list">
              {opOptions.map((op) => <option key={op} value={op} />)}
            </datalist>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Processo</span>
            <select
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value as AreaFilter)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="ALL">Rastreio por OP</option>
              <option value="INITIAL">Processo inicial</option>
              <option value="FINAL">Produto acabado</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Período</span>
            <select
              value={periodPreset}
              onChange={(event) => setPeriodPreset(event.target.value as PeriodPreset)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Últimos 12 meses</option>
              <option value="ALL">Todo o histórico</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={fetchData}
              className="h-10 w-full rounded-lg bg-slate-100 px-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            >
              Atualizar dados
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric title="Registros" value={reportData.totals.inspections} />
        <Metric title="Desvios" value={reportData.totals.defects} />
        <Metric title="Amostras" value={reportData.totals.samples} />
        <Metric title="Para revisão" value={reportData.totals.rework} />
        <Metric title="Inicial" value={reportData.totals.initial} />
        <Metric title="Acabado" value={reportData.totals.final} />
      </div>

      {reportData.filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-black uppercase tracking-widest text-slate-400">Nenhum registro encontrado para os filtros atuais</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AreaReportPanel
              title="Início do Processo"
              icon="precision_manufacturing"
              summary={reportData.initialSummary}
              empty="Nenhum registro de início do processo nos filtros atuais"
            />
            <AreaReportPanel
              title="Produto Acabado"
              icon="inventory_2"
              summary={reportData.finalSummary}
              empty="Nenhum registro de produto acabado nos filtros atuais"
            />
          </div>

          {/* Fluxo completo por OP */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Fluxo Completo por OP</h3>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Impressão → Corte/Vinco → Colagem → Produto Acabado → Revisão Final
                </p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{opFlowRows.length} OPs</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                    <th className="py-2 pr-3">OP</th>
                    <th className="py-2 text-center border-l border-slate-100 dark:border-slate-800 px-2" colSpan={2}>
                      <span className="flex items-center justify-center gap-1"><span className="material-symbols-outlined text-[11px]">print</span>Impressão</span>
                    </th>
                    <th className="py-2 text-center border-l border-slate-100 dark:border-slate-800 px-2" colSpan={2}>
                      <span className="flex items-center justify-center gap-1"><span className="material-symbols-outlined text-[11px]">content_cut</span>Corte/Vinco</span>
                    </th>
                    <th className="py-2 text-center border-l border-slate-100 dark:border-slate-800 px-2" colSpan={2}>
                      <span className="flex items-center justify-center gap-1"><span className="material-symbols-outlined text-[11px]">precision_manufacturing</span>Colagem</span>
                    </th>
                    <th className="py-2 text-center border-l border-slate-100 dark:border-slate-800 px-2" colSpan={2}>
                      <span className="flex items-center justify-center gap-1"><span className="material-symbols-outlined text-[11px]">inventory_2</span>Prod. Acabado</span>
                    </th>
                    <th className="py-2 text-center border-l border-slate-100 dark:border-slate-800 px-2" colSpan={2}>
                      <span className="flex items-center justify-center gap-1"><span className="material-symbols-outlined text-[11px]">verified</span>Rev. Final</span>
                    </th>
                    <th className="py-2 text-right border-l border-slate-100 dark:border-slate-800 pl-2">Data</th>
                  </tr>
                  <tr className="border-b border-slate-100 text-[8px] font-black uppercase tracking-widest text-slate-300 dark:border-slate-800 dark:text-slate-600">
                    <th className="pb-1" />
                    <th className="pb-1 text-right px-2 border-l border-slate-100 dark:border-slate-800">Rod.</th>
                    <th className="pb-1 text-right px-1 text-amber-400">Esc.</th>
                    <th className="pb-1 text-right px-2 border-l border-slate-100 dark:border-slate-800">Rod.</th>
                    <th className="pb-1 text-right px-1 text-amber-400">Esc.</th>
                    <th className="pb-1 text-right px-2 border-l border-slate-100 dark:border-slate-800">Rod.</th>
                    <th className="pb-1 text-right px-1 text-amber-400">Esc.</th>
                    <th className="pb-1 text-right px-2 border-l border-slate-100 dark:border-slate-800">Pallets</th>
                    <th className="pb-1 text-right px-1 text-rose-400">Rep.</th>
                    <th className="pb-1 text-right px-2 border-l border-slate-100 dark:border-slate-800">Boa</th>
                    <th className="pb-1 text-right px-1 text-rose-400">Ref.</th>
                    <th className="pb-1 border-l border-slate-100 dark:border-slate-800" />
                  </tr>
                </thead>
                <tbody>
                  {opFlowRows.map((row) => {
                    const statusLabel: Record<string, string> = {
                      deu_pedido: '✅', faltou_quantidade: '⚠️', aguardando_complemento: '🕐', reprovado: '❌',
                    };
                    return (
                      <tr key={row.op} className="border-b border-slate-50 font-bold text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 pr-3 font-black text-slate-900 dark:text-white">{row.op}</td>
                        {/* Impressão */}
                        <td className="py-2 text-right px-2 border-l border-slate-100 dark:border-slate-800">
                          {row.impressao.rodadas > 0 ? formatNumber(row.impressao.rodadas) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 text-right px-1 text-amber-600">
                          {row.impressao.escolha > 0 ? formatNumber(row.impressao.escolha) : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Corte/Vinco */}
                        <td className="py-2 text-right px-2 border-l border-slate-100 dark:border-slate-800">
                          {row.corteVinco.rodadas > 0 ? formatNumber(row.corteVinco.rodadas) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 text-right px-1 text-amber-600">
                          {row.corteVinco.escolha > 0 ? formatNumber(row.corteVinco.escolha) : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Colagem */}
                        <td className="py-2 text-right px-2 border-l border-slate-100 dark:border-slate-800">
                          {row.colagem.rodadas > 0 ? formatNumber(row.colagem.rodadas) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 text-right px-1 text-amber-600">
                          {row.colagem.escolha > 0 ? formatNumber(row.colagem.escolha) : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Produto Acabado */}
                        <td className="py-2 text-right px-2 border-l border-slate-100 dark:border-slate-800">
                          {row.prodAcabado.pallets > 0 ? `${formatNumber(row.prodAcabado.pallets)} plt` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 text-right px-1 text-rose-500">
                          {row.prodAcabado.reprovados > 0 ? formatNumber(row.prodAcabado.reprovados) : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Revisão Final */}
                        <td className="py-2 text-right px-2 border-l border-slate-100 dark:border-slate-800">
                          {row.revisaoFinal.qtyBoa > 0 ? formatNumber(row.revisaoFinal.qtyBoa) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 text-right px-1 text-rose-500">
                          {row.revisaoFinal.qtyRefugo > 0 ? formatNumber(row.revisaoFinal.qtyRefugo) : '—'}
                          {row.revisaoFinal.status ? ` ${statusLabel[row.revisaoFinal.status] || ''}` : ''}
                        </td>
                        <td className="py-2 text-right text-slate-400 pl-2 border-l border-slate-100 dark:border-slate-800 whitespace-nowrap">
                          {new Date(row.latest).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Defeitos do acabamento (Corte/Vinco + Colagem) */}
          {abDefectRanking.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">
                Principais desvios — Corte/Vinco e Colagem
              </h3>
              <div className="space-y-2">
                {abDefectRanking.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="w-5 text-[9px] font-black text-slate-400 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{d.name}</span>
                        <span className="text-xs font-black text-rose-600 ml-2 shrink-0">{formatNumber(d.count)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-500"
                          style={{ width: `${Math.round((d.count / (abDefectRanking[0]?.count || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartPanel title="Principais desvios">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.topDefects} layout="vertical" margin={{ top: 10, right: 20, left: 35, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={115} />
                  <Tooltip />
                  <Bar dataKey="count" name="Desvios" fill="#e11d48" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Desvios por operador">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.topOperators} layout="vertical" margin={{ top: 10, right: 20, left: 35, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={115} />
                  <Tooltip />
                  <Bar dataKey="count" name="Desvios" fill="#2563eb" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartPanel title="Desvios por máquina">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.topMachines} layout="vertical" margin={{ top: 10, right: 20, left: 35, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={115} />
                  <Tooltip />
                  <Bar dataKey="count" name="Desvios" fill="#f97316" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Evolução semanal">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.weekly} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="inspections" name="Registros" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="defects" name="Desvios" stroke="#e11d48" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Registros considerados no relatório</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                    <th className="py-3">Data</th>
                    <th className="py-3">OP</th>
                    <th className="py-3">Processo</th>
                    <th className="py-3">Máquina</th>
                    <th className="py-3 text-right">Amostras</th>
                    <th className="py-3 text-right">Revisão</th>
                    <th className="py-3 text-right">Desvios</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.filtered.slice(0, 80).map((record) => (
                    <tr key={record.id} className="border-b border-slate-50 text-sm font-bold text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-200">
                      <td className="py-3">{new Date(record.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="py-3">{record.op}</td>
                      <td className="py-3">{record.area === 'initial' ? 'Processo inicial' : 'Produto acabado'}</td>
                      <td className="py-3">{record.machines?.name || 'N/A'}</td>
                      <td className="py-3 text-right">{formatNumber(asNumber(record.samples_count))}</td>
                      <td className="py-3 text-right">{formatNumber(asNumber(record.rework_count))}</td>
                      <td className="py-3 text-right">{formatNumber(record.total_defects)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {isEmailOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsEmailOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-black text-slate-800 dark:text-white">Enviar relatório</h3>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">E-mail destino</label>
            <input
              type="email"
              value={emailTo}
              onChange={(event) => setEmailTo(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800"
              placeholder="exemplo@empresa.com"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setIsEmailOpen(false)}
                className="h-11 flex-1 rounded-lg border border-slate-200 font-bold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendEmail}
                disabled={isSending || !emailTo.trim()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"
              >
                {isSending ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : null}
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{formatNumber(value)}</p>
    </div>
  );
}

function AreaReportPanel({ title, icon, summary, empty }: { title: string; icon: string; summary: AreaSummary; empty: string }) {
  const latestRecords = summary.records
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">{title}</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Visualização separada</p>
          </div>
        </div>
        <p className="text-2xl font-black text-slate-900 dark:text-white">{formatNumber(summary.inspections)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Desvios" value={summary.defects} tone="rose" />
        <MiniMetric label="Amostras" value={summary.samples} />
        <MiniMetric label="Revisão" value={summary.rework} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatusPill label="Aprovado" value={summary.approved} tone="emerald" />
        <StatusPill label="Restrição" value={summary.restricted} tone="amber" />
        <StatusPill label="Reprovado" value={summary.rejected} tone="rose" />
      </div>

      <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        {latestRecords.length === 0 ? (
          <p className="py-6 text-center text-xs font-black uppercase tracking-widest text-slate-400">{empty}</p>
        ) : latestRecords.map((record) => (
          <div key={record.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-800 dark:text-white">OP {record.op}</p>
              <p className="text-[10px] font-medium text-slate-400">
                {new Date(record.created_at).toLocaleDateString('pt-BR')} · {record.machines?.name || 'N/A'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-black text-rose-500">{formatNumber(record.total_defects)}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">desvios</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'rose' }) {
  const color = tone === 'rose' ? 'text-rose-500' : 'text-slate-900 dark:text-white';

  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
      <p className={`text-lg font-black ${color}`}>{formatNumber(value)}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'rose' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-300',
  }[tone];

  return (
    <div className={`rounded-lg p-2 text-center ${colors}`}>
      <p className="text-sm font-black">{formatNumber(value)}</p>
      <p className="text-[8px] font-black uppercase tracking-widest">{label}</p>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-[340px] flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</h3>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default ReportsView;
