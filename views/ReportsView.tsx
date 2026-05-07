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
};

type NormalizedRecord = InspectionRecord & {
  area: 'initial' | 'final';
  defects: Array<{ name: string; count: number }>;
  total_defects: number;
  operatorNames: string[];
};

const asNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseObservations = (observations?: string) => {
  if (!observations) return {};
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

const ReportsView = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
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
      const { data: inspections, error } = await supabase
        .from('inspections')
        .select('*, machines(name), operators(name), analysts(name)')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const { data: operatorsData, error: operatorsError } = await supabase
        .from('operators')
        .select('id, name');

      if (operatorsError) throw operatorsError;

      setRecords((inspections || []).filter((record: any) => !!record.status));
      setOperators(operatorsData || []);
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
      const defects = normalizeDefects(obs.defects);
      const total = asNumber(obs.totalDefects) || defects.reduce((sum, defect) => sum + defect.count, 0);
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
      topMachines: toSortedArray(byMachine).slice(0, 10),
      topOperators: toSortedArray(byOperator).slice(0, 10),
      topDefects: toSortedArray(byDefect).slice(0, 10),
      weekly: toSeries(weekly).slice(-12),
      monthly: toSeries(monthly).slice(-12),
      annual: toSeries(annual).slice(-5),
    };
  }, [areaFilter, normalizedRecords, opFilter, periodPreset]);

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
              <option value="ALL">Todos</option>
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

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-[340px] flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</h3>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default ReportsView;
