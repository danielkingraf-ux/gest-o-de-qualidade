import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { InspectionStatus, Order, ProcessType } from '../types';

type Period = 'week' | 'month' | 'year';
type StatusFilter = 'ALL' | InspectionStatus;
type AreaKey = 'initial' | 'final';

type ApprovalInspection = {
  id: string;
  op: string;
  orderId?: string;
  status: InspectionStatus;
  area: AreaKey;
  createdAt: Date;
  defects: number;
  samples: number;
  rework: number;
};

type OpApproval = {
  key: string;
  op: string;
  cliente: string;
  produto: string;
  qtdTotal: number;
  status: InspectionStatus;
  lastDate: Date;
  inspections: number;
  initial: number;
  final: number;
  defects: number;
  samples: number;
  rework: number;
};

const STATUS_META: Record<InspectionStatus, { label: string; color: string; dot: string; chart: string; priority: number }> = {
  [InspectionStatus.APPROVED]: {
    label: 'Aprovadas',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    chart: '#10b981',
    priority: 1,
  },
  [InspectionStatus.RESTRICTED]: {
    label: 'Com restrição',
    color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
    chart: '#f59e0b',
    priority: 2,
  },
  [InspectionStatus.REJECTED]: {
    label: 'Reprovadas',
    color: 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-800',
    dot: 'bg-rose-500',
    chart: '#e11d48',
    priority: 3,
  },
};

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
];

const asNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseObs = (value: any) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const normalizeDefects = (raw: any) => {
  if (!raw) return 0;
  if (Array.isArray(raw)) {
    return raw.reduce((sum, item) => sum + asNumber(item?.count ?? item?.value ?? item?.qty), 0);
  }
  if (typeof raw === 'object') {
    const groups = ['critical', 'major', 'minor'];
    const hasGroups = groups.some((group) => raw[group] && typeof raw[group] === 'object');
    if (hasGroups) {
      return groups.reduce((sum, group) => {
        return sum + Object.values(raw[group] || {}).reduce<number>((groupSum, count) => groupSum + asNumber(count), 0);
      }, 0);
    }
    return Object.values(raw).reduce<number>((sum, count) => sum + asNumber(count), 0);
  }
  return 0;
};

const getArea = (record: any, obs: any): AreaKey => {
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

const getPeriodBounds = (period: Period, anchorValue: string) => {
  const anchor = anchorValue ? new Date(`${anchorValue}T00:00:00`) : new Date();
  const start = new Date(anchor);
  const end = new Date(anchor);

  if (period === 'week') {
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 7);
  } else if (period === 'month') {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
  } else {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear() + 1, 0, 1);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { start, end };
};

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);
const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value));

const statusPriority = (status: InspectionStatus) => STATUS_META[status]?.priority ?? 0;

export default function SupervisorView() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inspections, setInspections] = useState<ApprovalInspection[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [anchorDate, setAnchorDate] = useState(formatDateInput(new Date()));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [opFilter, setOpFilter] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: inspectionsData, error: inspectionsError } = await supabase
        .from('inspections')
        .select('*')
        .order('created_at', { ascending: false });

      if (inspectionsError) throw inspectionsError;

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*');

      if (ordersError) throw ordersError;

      setOrders(ordersData || []);
      setInspections((inspectionsData || []).map((record: any) => {
        const obs = parseObs(record.observations);
        return {
          id: record.id,
          op: String(record.op || 'Sem OP'),
          orderId: record.order_id,
          status: record.status,
          area: getArea(record, obs),
          createdAt: new Date(record.created_at || record.timestamp),
          defects: asNumber(obs.totalDefects) || normalizeDefects(obs.defects),
          samples: asNumber(record.samples_count),
          rework: asNumber(record.rework_count),
        };
      }).filter((item: ApprovalInspection) => item.status && !Number.isNaN(item.createdAt.getTime())));
    } catch (error) {
      showToast('Erro ao carregar aprovações', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const orderMap = useMemo(() => {
    const map = new Map<string, Order>();
    orders.forEach((order) => {
      map.set(order.id, order);
      map.set(order.op, order);
    });
    return map;
  }, [orders]);

  const periodData = useMemo(() => {
    const { start, end } = getPeriodBounds(period, anchorDate);
    const opSearch = opFilter.trim().toLowerCase();

    const inPeriod = inspections.filter((inspection) => {
      if (inspection.createdAt < start || inspection.createdAt >= end) return false;
      if (opSearch && !inspection.op.toLowerCase().includes(opSearch)) return false;
      return true;
    });

    const grouped = new Map<string, OpApproval>();

    inPeriod.forEach((inspection) => {
      const order = orderMap.get(inspection.orderId || '') || orderMap.get(inspection.op);
      const key = inspection.orderId || inspection.op;
      const current = grouped.get(key) || {
        key,
        op: inspection.op,
        cliente: order?.cliente || 'Sem cliente',
        produto: order?.produto || 'Sem produto',
        qtdTotal: asNumber(order?.qtd_total),
        status: inspection.status,
        lastDate: inspection.createdAt,
        inspections: 0,
        initial: 0,
        final: 0,
        defects: 0,
        samples: 0,
        rework: 0,
      };

      if (statusPriority(inspection.status) > statusPriority(current.status)) current.status = inspection.status;
      if (inspection.createdAt > current.lastDate) current.lastDate = inspection.createdAt;
      current.inspections += 1;
      current.initial += inspection.area === 'initial' ? 1 : 0;
      current.final += inspection.area === 'final' ? 1 : 0;
      current.defects += inspection.defects;
      current.samples += inspection.samples;
      current.rework += inspection.rework;
      grouped.set(key, current);
    });

    const ops = Array.from(grouped.values())
      .filter((op) => statusFilter === 'ALL' || op.status === statusFilter)
      .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());

    const totals = {
      all: ops.length,
      approved: ops.filter((op) => op.status === InspectionStatus.APPROVED).length,
      restricted: ops.filter((op) => op.status === InspectionStatus.RESTRICTED).length,
      rejected: ops.filter((op) => op.status === InspectionStatus.REJECTED).length,
      defects: ops.reduce((sum, op) => sum + op.defects, 0),
      samples: ops.reduce((sum, op) => sum + op.samples, 0),
      rework: ops.reduce((sum, op) => sum + op.rework, 0),
    };

    const chart = [
      { name: 'Aprovadas', value: totals.approved, color: STATUS_META.APPROVED.chart },
      { name: 'Com restrição', value: totals.restricted, color: STATUS_META.RESTRICTED.chart },
      { name: 'Reprovadas', value: totals.rejected, color: STATUS_META.REJECTED.chart },
    ];

    const byArea = [
      { name: 'Processo inicial', aprovadas: 0, restricao: 0, reprovadas: 0 },
      { name: 'Produto acabado', aprovadas: 0, restricao: 0, reprovadas: 0 },
    ];

    inPeriod.forEach((inspection) => {
      const row = inspection.area === 'initial' ? byArea[0] : byArea[1];
      if (inspection.status === InspectionStatus.APPROVED) row.aprovadas += 1;
      if (inspection.status === InspectionStatus.RESTRICTED) row.restricao += 1;
      if (inspection.status === InspectionStatus.REJECTED) row.reprovadas += 1;
    });

    return { ops, totals, chart, byArea, start, end };
  }, [anchorDate, inspections, opFilter, orderMap, period, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-in space-y-4 p-4 pb-20 md:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span className="size-1.5 rounded-full bg-amber-500" />
              Visão de aprovação por OP
            </p>
            <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Aprovações</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">
              OPs aprovadas, reprovadas e aprovadas com restrição por semana, mês ou ano.
            </p>
          </div>

          <button
            onClick={fetchData}
            className="h-10 rounded-lg bg-slate-100 px-4 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
          >
            Atualizar
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">OP</span>
            <input
              value={opFilter}
              onChange={(event) => setOpFilter(event.target.value)}
              placeholder="Filtrar OP"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Período</span>
            <div className="grid h-10 grid-cols-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriod(option.value)}
                  className={`text-[10px] font-black uppercase tracking-widest transition ${period === option.value ? 'bg-primary text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Data base</span>
            <input
              type="date"
              value={anchorDate}
              onChange={(event) => setAnchorDate(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="ALL">Todos</option>
              <option value={InspectionStatus.APPROVED}>Aprovadas</option>
              <option value={InspectionStatus.RESTRICTED}>Com restrição</option>
              <option value={InspectionStatus.REJECTED}>Reprovadas</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <Metric label="OPs" value={periodData.totals.all} />
        <Metric label="Aprovadas" value={periodData.totals.approved} tone="emerald" />
        <Metric label="Restrição" value={periodData.totals.restricted} tone="amber" />
        <Metric label="Reprovadas" value={periodData.totals.rejected} tone="rose" />
        <Metric label="Amostras" value={periodData.totals.samples} />
        <Metric label="Revisão" value={periodData.totals.rework} />
        <Metric label="Desvios" value={periodData.totals.defects} tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[320px] rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Distribuição das OPs</h3>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={periodData.chart} dataKey="value" nameKey="name" innerRadius={58} outerRadius={85} paddingAngle={4}>
                {periodData.chart.map((item) => (
                  <Cell key={item.name} fill={item.color} stroke={item.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="h-[320px] rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Status por processo</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={periodData.byArea}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
              <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
              <Tooltip />
              <Bar dataKey="aprovadas" name="Aprovadas" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="restricao" name="Com restrição" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="reprovadas" name="Reprovadas" stackId="a" fill="#e11d48" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">OPs do período</h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {periodData.start.toLocaleDateString('pt-BR')} a {new Date(periodData.end.getTime() - 1).toLocaleDateString('pt-BR')}
          </p>
        </div>

        {periodData.ops.length === 0 ? (
          <div className="py-16 text-center text-sm font-black uppercase tracking-widest text-slate-400">
            Nenhuma OP encontrada para os filtros atuais
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                  <th className="py-3">OP</th>
                  <th className="py-3">Cliente / Produto</th>
                  <th className="py-3">Status</th>
                  <th className="py-3 text-right">Registros</th>
                  <th className="py-3 text-right">Inicial</th>
                  <th className="py-3 text-right">Acabado</th>
                  <th className="py-3 text-right">Amostras</th>
                  <th className="py-3 text-right">Revisão</th>
                  <th className="py-3 text-right">Desvios</th>
                </tr>
              </thead>
              <tbody>
                {periodData.ops.map((op) => (
                  <tr key={op.key} className="border-b border-slate-50 text-sm font-bold text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-200">
                    <td className="py-3 font-black">{op.op}</td>
                    <td className="py-3">
                      <p>{op.cliente}</p>
                      <p className="text-xs text-slate-400">{op.produto}</p>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_META[op.status].color}`}>
                        <span className={`size-2 rounded-full ${STATUS_META[op.status].dot}`} />
                        {STATUS_META[op.status].label}
                      </span>
                    </td>
                    <td className="py-3 text-right">{formatNumber(op.inspections)}</td>
                    <td className="py-3 text-right">{formatNumber(op.initial)}</td>
                    <td className="py-3 text-right">{formatNumber(op.final)}</td>
                    <td className="py-3 text-right">{formatNumber(op.samples)}</td>
                    <td className="py-3 text-right">{formatNumber(op.rework)}</td>
                    <td className="py-3 text-right text-rose-600">{formatNumber(op.defects)}</td>
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

function Metric({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const colors = {
    slate: 'text-slate-900 dark:text-white',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-black ${colors[tone]}`}>{formatNumber(value)}</p>
    </div>
  );
}
