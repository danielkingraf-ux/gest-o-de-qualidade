import * as XLSX from 'xlsx';
import type { ManagementReportData } from './reportService';

const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

/**
 * Exporta o relatorio gerencial como .xlsx com multiplas abas.
 */
export function exportManagementReportXlsx(report: ManagementReportData): void {
  const wb = XLSX.utils.book_new();

  // 1. Resumo Executivo
  const resumoData = [
    ['KINGRAF — RELATORIO GERENCIAL DE PRODUCAO'],
    [`Periodo: ${report.periodLabel}`],
    [`Gerado em: ${report.generatedAt}`],
    [],
    ['Indicador', 'Valor'],
    ['OPs no periodo', report.summary.totalOps],
    ['Unidades pedidas', report.summary.totalUnidadesPedidas],
    ['Unidades entregues', report.summary.totalUnidadesEntregues],
    ['Unidades perdidas', report.summary.totalUnidadesPerdidas],
    ['Reimpressoes', report.summary.totalReimpressoes],
    ['OPs com escolha', report.summary.opsComEscolha],
    ['OPs aprovadas', report.summary.opsAprovadas],
    ['OPs reprovadas', report.summary.opsReprovadas],
    [],
    ['KPI', 'Valor'],
    ['Eficiencia de producao', report.kpis.eficienciaProducao],
    ['Taxa media de defeitos', report.kpis.taxaMediaDefeitos],
    ['Taxa de escolha', report.kpis.taxaEscolha],
    ['Taxa de reimpressao', report.kpis.taxaReimpressao],
    ['Aprovacao sem restricao', report.kpis.aprovacaoSemRestricao],
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
  wsResumo['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  // 2. Detalhamento por OP
  const opHeaders = ['OP', 'Cliente', 'Pedido', 'Entregue', 'Perda', 'Status'];
  const opRows = report.opDetails.map(op => [op.op, op.cliente, op.pedido, op.entregue, op.perda, op.status]);
  const wsOps = XLSX.utils.aoa_to_sheet([opHeaders, ...opRows]);
  wsOps['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsOps, 'Por OP');

  // 3. Problemas por Operador
  const opHeaders3 = ['Operador', 'Maquina', 'OPs', 'Defeito Principal', 'Taxa Media'];
  const opRows3 = report.operatorProblems.map(op => [op.operador, op.maquina, op.ops, op.defeitoPrincipal, op.taxaMedia]);
  const wsOperators = XLSX.utils.aoa_to_sheet([opHeaders3, ...opRows3]);
  wsOperators['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsOperators, 'Por Operador');

  // 4. Problemas por Maquina
  const machHeaders = ['Maquina', 'Operadores', 'OPs', 'Defeito Recorrente', 'Taxa'];
  const machRows = report.machineProblems.map(mp => [mp.maquina, mp.operadores, mp.ops, mp.defeitoRecorrente, mp.taxa]);
  const wsMach = XLSX.utils.aoa_to_sheet([machHeaders, ...machRows]);
  wsMach['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsMach, 'Por Maquina');

  // 5. Reimpressoes
  const reimpHeaders = ['OP', 'Rodada', 'Motivo', 'Solicitante', 'Qtd. (unid.)'];
  const reimpRows = report.reimpressoes.map(r => [r.op, r.rodada, r.motivo, r.solicitante, r.quantidade]);
  const wsReimp = XLSX.utils.aoa_to_sheet([reimpHeaders, ...reimpRows]);
  wsReimp['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 35 }, { wch: 15 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsReimp, 'Reimpressoes');

  XLSX.writeFile(wb, 'RELATORIO_GERENCIAL.xlsx');
}

/**
 * Exporta dados de qualidade generico como .xlsx (para ReportsView).
 */
export function exportQualityReportXlsx(data: {
  title: string;
  generatedAt: string;
  totals: { inspections: number; defects: number; approved: number; rejected: number; restricted: number };
  topMachines: Array<{ name: string; count: number }>;
  topOperators: Array<{ name: string; count: number }>;
  topDefects: Array<{ name: string; count: number }>;
  weekly: Array<{ label: string; inspections: number; defects: number }>;
  monthly: Array<{ label: string; inspections: number; defects: number }>;
  annual: Array<{ label: string; inspections: number; defects: number }>;
}): void {
  const wb = XLSX.utils.book_new();

  // Resumo
  const resumoData = [
    [data.title],
    [`Gerado em: ${data.generatedAt}`],
    [],
    ['Indicador', 'Valor'],
    ['Inspecoes', data.totals.inspections],
    ['Defeitos', data.totals.defects],
    ['Aprovados', data.totals.approved],
    ['Reprovados', data.totals.rejected],
    ['Restritos', data.totals.restricted],
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
  wsResumo['!cols'] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  // Top Defeitos
  const wsDefects = XLSX.utils.aoa_to_sheet([
    ['Defeito', 'Quantidade'],
    ...data.topDefects.map(d => [d.name, d.count]),
  ]);
  wsDefects['!cols'] = [{ wch: 25 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsDefects, 'Top Defeitos');

  // Top Maquinas
  const wsMach = XLSX.utils.aoa_to_sheet([
    ['Maquina', 'Inspecoes'],
    ...data.topMachines.map(m => [m.name, m.count]),
  ]);
  wsMach['!cols'] = [{ wch: 25 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsMach, 'Top Maquinas');

  // Top Operadores
  const wsOps = XLSX.utils.aoa_to_sheet([
    ['Operador', 'Inspecoes'],
    ...data.topOperators.map(o => [o.name, o.count]),
  ]);
  wsOps['!cols'] = [{ wch: 25 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsOps, 'Top Operadores');

  // Serie Semanal
  const wsWeekly = XLSX.utils.aoa_to_sheet([
    ['Periodo', 'Inspecoes', 'Defeitos'],
    ...data.weekly.map(w => [w.label, w.inspections, w.defects]),
  ]);
  wsWeekly['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsWeekly, 'Semanal');

  // Serie Mensal
  const wsMonthly = XLSX.utils.aoa_to_sheet([
    ['Periodo', 'Inspecoes', 'Defeitos'],
    ...data.monthly.map(m => [m.label, m.inspections, m.defects]),
  ]);
  wsMonthly['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Mensal');

  XLSX.writeFile(wb, 'RELATORIO_QUALIDADE.xlsx');
}
