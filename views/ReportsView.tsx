import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { reportService } from '../services/reportService';
import { ProcessType } from '../types';

type InspectionRecord = {
  id: string;
  op: string;
  status?: string;
  process_type?: string;
  created_at: string;
  observations?: string;
  machines?: { name?: string };
  operators?: { name?: string };
  inspection_defects?: Array<{ count: number; defect_types?: { name?: string } }>;
};

const parseObservations = (observations?: string) => {
  if (!observations) return {};
  try {
    return JSON.parse(observations);
  } catch {
    return {};
  }
};

const isSpreadsheetAnalysis = (record: InspectionRecord) => {
  const obs = parseObservations(record.observations);
  return obs.is_spreadsheet_analysis === true;
};

const getDefectsFromRecord = (record: InspectionRecord) => {
  const obs = parseObservations(record.observations);
  const defects: Array<{ name: string; count: number }> = [];

  // Defeitos ficam no campo defects (populado via observations JSON)
  if ((record as any).defects && (record as any).defects.length > 0) {
    (record as any).defects.forEach((d: any) => {
      defects.push({ name: d.name || 'Outros', count: d.count || 0 });
    });
    return defects;
  }

  if (obs.is_finishing_laudo && obs.defects) {
    const categories = ['critical', 'major', 'minor'];
    categories.forEach(cat => {
      const group = obs.defects?.[cat] || {};
      Object.entries(group).forEach(([key, val]) => {
        const count = Number(val) || 0;
        if (count > 0) defects.push({ name: key.replace(/_/g, ' '), count });
      });
    });
    return defects;
  }

  if (obs.defects) {
    Object.entries(obs.defects).forEach(([key, val]) => {
      const count = Number(val) || 0;
      if (count > 0) defects.push({ name: key.replace(/_/g, ' '), count });
    });
  }

  return defects;
};

const getOperatorIds = (record: InspectionRecord, operators: Array<{ id: string; name: string }>) => {
  const obs = parseObservations(record.observations);
  const ids = Array.isArray(obs.all_operator_ids) ? obs.all_operator_ids : (record as any).operator_id ? [(record as any).operator_id] : [];
  return ids.map((id: string) => operators.find(o => o.id === id)?.name || 'Desconhecido');
};

const formatWeekKey = (date: Date) => {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const ReportsView = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [operators, setOperators] = useState<Array<{ id: string; name: string }>>([]);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [includeSpreadsheet, setIncludeSpreadsheet] = useState(false);
  const [processFilter, setProcessFilter] = useState<ProcessType | 'ALL'>('ALL');
  const [periodPreset, setPeriodPreset] = useState<'ALL' | '30' | '90' | '365'>('90');

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const { data: inspections, error } = await supabase
          .from('inspections')
          .select('*, machines(name), operators(name), analysts(name)')
          .order('created_at', { ascending: true });
        if (error) throw error;

        const { data: ops } = await supabase.from('operators').select('id, name');

        // Enriquecer com defeitos e process_type vindos do observations JSON
        const cleaned = (inspections || [])
          .filter((r: any) => !!r.status)
          .map((r: any) => {
            const obs = parseObservations(r.observations);
            const defects = obs.defects || [];
            return {
              ...r,
              defects,
              total_defects: obs.totalDefects ?? defects.reduce((a: number, d: any) => a + (d.count || 0), 0),
              process_type: r.process_type || obs.process_type || 'OFFSET',
            };
          });
        setRecords(cleaned);
        setOperators(ops || []);
      } catch (err: any) {
        showToast('Erro ao carregar relatórios', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [showToast]);

  const reportData = useMemo(() => {
    const now = new Date();
    const minDate = (() => {
      if (periodPreset === 'ALL') return null;
      const days = Number(periodPreset);
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d;
    })();

    const filteredRecords = records.filter(record => {
      if (!includeSpreadsheet && isSpreadsheetAnalysis(record)) return false;
      if (processFilter !== 'ALL' && record.process_type !== processFilter) return false;
      if (minDate) {
        const created = new Date(record.created_at);
        if (created < minDate) return false;
      }
      return true;
    });

    const totals = {
      inspections: filteredRecords.length,
      defects: 0,
      approved: 0,
      rejected: 0,
      restricted: 0
    };

    const byMachine = new Map<string, number>();
    const byOperator = new Map<string, number>();
    const byDefect = new Map<string, number>();
    const weekly = new Map<string, { inspections: number; defects: number }>();
    const monthly = new Map<string, { inspections: number; defects: number }>();
    const annual = new Map<string, { inspections: number; defects: number }>();

    filteredRecords.forEach(record => {
      if (record.status === 'APPROVED') totals.approved += 1;
      if (record.status === 'REJECTED') totals.rejected += 1;
      if (record.status === 'RESTRICTED') totals.restricted += 1;

      const defects = getDefectsFromRecord(record);
      const defectTotal = defects.reduce((acc, d) => acc + d.count, 0);
      totals.defects += defectTotal;

      const machineName = record.machines?.name || 'N/A';
      byMachine.set(machineName, (byMachine.get(machineName) || 0) + defectTotal);

      const opNames = getOperatorIds(record, operators);
      if (opNames.length === 0) opNames.push(record.operators?.name || 'N/A');
      opNames.forEach(name => byOperator.set(name, (byOperator.get(name) || 0) + defectTotal));

      defects.forEach(d => byDefect.set(d.name, (byDefect.get(d.name) || 0) + d.count));

      const date = new Date(record.created_at);
      const weekKey = formatWeekKey(date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const yearKey = `${date.getFullYear()}`;

      const week = weekly.get(weekKey) || { inspections: 0, defects: 0 };
      week.inspections += 1;
      week.defects += defectTotal;
      weekly.set(weekKey, week);

      const month = monthly.get(monthKey) || { inspections: 0, defects: 0 };
      month.inspections += 1;
      month.defects += defectTotal;
      monthly.set(monthKey, month);

      const year = annual.get(yearKey) || { inspections: 0, defects: 0 };
      year.inspections += 1;
      year.defects += defectTotal;
      annual.set(yearKey, year);
    });

    const toSortedArray = (map: Map<string, number>) =>
      Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    const toSeries = (map: Map<string, { inspections: number; defects: number }>) =>
      Array.from(map.entries()).map(([label, values]) => ({ label, inspections: values.inspections, defects: values.defects }));

    return {
      totals,
      topMachines: toSortedArray(byMachine).slice(0, 10),
      topOperators: toSortedArray(byOperator).slice(0, 10),
      topDefects: toSortedArray(byDefect).slice(0, 10),
      weekly: toSeries(weekly).slice(-12),
      monthly: toSeries(monthly).slice(-12),
      annual: toSeries(annual).slice(-5)
    };
  }, [records, operators, includeSpreadsheet, processFilter, periodPreset]);

  const handleExport = async () => {
    const blob = await reportService.generateSummaryReportPDF({
      title: 'RELATÓRIO DE QUALIDADE',
      generatedAt: new Date().toLocaleString('pt-BR'),
      totals: reportData.totals,
      topMachines: reportData.topMachines,
      topOperators: reportData.topOperators,
      topDefects: reportData.topDefects,
      weekly: reportData.weekly,
      monthly: reportData.monthly,
      annual: reportData.annual
    }, { save: true, returnBlob: false });
    return blob;
  };

  const handleSendEmail = async () => {
    if (!emailTo) return;
    setIsSending(true);
    try {
      const pdfBlob = await reportService.generateSummaryReportPDF({
        title: 'RELATÓRIO DE QUALIDADE',
        generatedAt: new Date().toLocaleString('pt-BR'),
        totals: reportData.totals,
        topMachines: reportData.topMachines,
        topOperators: reportData.topOperators,
        topDefects: reportData.topDefects,
        weekly: reportData.weekly,
        monthly: reportData.monthly,
        annual: reportData.annual
      }, { save: false, returnBlob: true, filename: 'RELATORIO_QUALIDADE.pdf' }) as Blob | null;

      if (!pdfBlob) throw new Error('Falha ao gerar PDF');
      await reportService.sendReportEmail({
        to: emailTo,
        subject: 'Relatório de Qualidade',
        filename: 'RELATORIO_QUALIDADE.pdf',
        pdfBlob
      });
      showToast('Relatório enviado com sucesso!', 'success');
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto w-full animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Relatórios de Qualidade</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
            Indicadores • Máquinas • Operadores • Problemas
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-primary rounded-xl h-9 px-4 text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-base">download</span>
            EXPORTAR PDF
          </button>
          <button
            onClick={() => setIsEmailOpen(true)}
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl h-9 px-4 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            <span className="material-symbols-outlined text-base">mail</span>
            ENVIAR POR E-MAIL
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Processo</label>
            <select
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value as ProcessType | 'ALL')}
              className="w-full h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-xs font-bold outline-none"
            >
              <option value="ALL">Todos</option>
              <option value={ProcessType.OFFSET}>Offset</option>
              <option value={ProcessType.UV}>UV</option>
              <option value={ProcessType.HOT_STAMPING}>Hot Stamping</option>
              <option value={ProcessType.ESCOLHAS}>Escolhas</option>
              <option value={ProcessType.ACABAMENTO}>Acabamento</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Período</label>
            <select
              value={periodPreset}
              onChange={(e) => setPeriodPreset(e.target.value as 'ALL' | '30' | '90' | '365')}
              className="w-full h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-xs font-bold outline-none"
            >
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Últimos 12 meses</option>
              <option value="ALL">Todo o histórico</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeSpreadsheet}
                onChange={(e) => setIncludeSpreadsheet(e.target.checked)}
                className="size-4 accent-primary"
              />
              Incluir análises de planilha
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inspeções</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{reportData.totals.inspections}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Defeitos</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{reportData.totals.defects}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aprovados</p>
          <p className="text-2xl font-black text-emerald-600">{reportData.totals.approved}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Reprovados</p>
          <p className="text-2xl font-black text-rose-600">{reportData.totals.rejected}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm h-[320px]">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Problemas Mais Frequentes</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reportData.topDefects} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#f43f5e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm h-[320px]">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Defeitos por Máquina</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reportData.topMachines} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm h-[320px]">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Defeitos por Operador</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={reportData.topOperators} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm h-[320px]">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Série Semanal</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={reportData.weekly} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="inspections" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="defects" stroke="#f43f5e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm h-[320px]">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Série Mensal</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={reportData.monthly} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="inspections" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="defects" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm h-[320px]">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Série Anual</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={reportData.annual} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="inspections" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="defects" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {isEmailOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsEmailOpen(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="text-lg font-black text-slate-800 dark:text-white mb-4">Enviar relatório</h3>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">E-mail destino</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="w-full h-11 mt-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="exemplo@empresa.com"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setIsEmailOpen(false)}
                className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendEmail}
                disabled={isSending || !emailTo}
                className="flex-1 h-11 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSending ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : null}
                Enviar
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-3">
              Requer função Supabase <span className="font-bold">send-report-email</span> configurada.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsView;
