
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabase';

// Paleta de cores dos PDFs
const COLOR_HEADER_BG:  [number, number, number] = [31,  41,  55];
const COLOR_PRIMARY:    [number, number, number] = [76,  29,  149];
const COLOR_ACCENT:     [number, number, number] = [139, 92,  246];
const COLOR_TEAL:       [number, number, number] = [15,  118, 110];
const COLOR_INDIGO:     [number, number, number] = [99,  102, 241];

type PersonList = Array<{ id: string; name?: string }>;

interface PdfRecord {
    id: string;
    op: string;
    created_at: string;
    status: string;
    observations: string | null;
    operator_id?: string | null;
    analyst_id?: string | null;
    machines?: { name?: string } | null;
}

const parseObservations = (observations: string | null): Record<string, unknown> => {
    if (!observations) return {};
    try { return JSON.parse(observations); } catch { return {}; }
};

const getNames = (
    type: 'operator' | 'analyst',
    obs: Record<string, unknown>,
    record: PdfRecord,
    operatorsList: PersonList,
    analystsList: PersonList,
): string => {
    let ids: string[] = [];
    if (type === 'operator' && Array.isArray(obs.all_operator_ids)) {
        ids = obs.all_operator_ids as string[];
    } else if (type === 'analyst' && Array.isArray(obs.all_analyst_ids)) {
        ids = obs.all_analyst_ids as string[];
    } else {
        const singleId = type === 'operator' ? record.operator_id : record.analyst_id;
        if (singleId) ids = [singleId];
    }
    const list = type === 'operator' ? operatorsList : analystsList;
    if (ids.length === 0) return 'N/A';
    return ids.map(id => list.find(item => item.id === id)?.name ?? 'Desconhecido').join(', ');
};

// Tipos para o Relatorio Gerencial
export interface ManagementReportSummary {
    totalOps: number;
    totalUnidadesPedidas: number;
    totalUnidadesEntregues: number;
    totalUnidadesPerdidas: number;
    totalReimpressoes: number;
    opsComEscolha: number;
    opsAprovadas: number;
    opsReprovadas: number;
}

export interface ManagementOpDetail {
    op: string;
    cliente: string;
    pedido: number;
    entregue: number;
    perda: number;
    status: string;
}

export interface ManagementOperatorProblem {
    operador: string;
    maquina: string;
    ops: number;
    defeitoPrincipal: string;
    taxaMedia: string;
}

export interface ManagementMachineProblem {
    maquina: string;
    operadores: number;
    ops: number;
    defeitoRecorrente: string;
    taxa: string;
}

export interface ManagementReimpressao {
    op: string;
    rodada: number;
    motivo: string;
    solicitante: string;
    quantidade: number;
}

export interface ManagementKPIs {
    eficienciaProducao: string;
    taxaMediaDefeitos: string;
    taxaEscolha: string;
    taxaReimpressao: string;
    aprovacaoSemRestricao: string;
}

export interface ManagementReportData {
    periodLabel: string;
    generatedAt: string;
    summary: ManagementReportSummary;
    opDetails: ManagementOpDetail[];
    operatorProblems: ManagementOperatorProblem[];
    machineProblems: ManagementMachineProblem[];
    reimpressoes: ManagementReimpressao[];
    kpis: ManagementKPIs;
}

export const reportService = {
    generateFinishingPDF(record: PdfRecord, operatorsList: PersonList = [], analystsList: PersonList = []) {
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const parsedObservations = parseObservations(record.observations);

            const headerData = (parsedObservations.header ?? {}) as Record<string, string>;
            const testsData  = (parsedObservations.tests  ?? {}) as Record<string, Record<string, string>>;
            const defectsData = (parsedObservations.defects ?? { critical: {}, major: {}, minor: {} }) as Record<string, Record<string, number>>;
            const isSpreadsheetAnalysis = parsedObservations.is_spreadsheet_analysis === true;

            // -- Header Block --
            doc.setFillColor(...COLOR_HEADER_BG);
            doc.rect(0, 0, pageWidth, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('LAUDO DE ANÁLISE PRODUTO ACABADO', 15, 20);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(`LAUDO Nº: ${headerData.reportNumber || 'N/A'}`, pageWidth - 15, 20, { align: 'right' });
            doc.text('KINGRAF - CONTROLE DE QUALIDADE', 15, 28);
            doc.text(`DATA: ${new Date(record.created_at).toLocaleDateString('pt-BR')}`, pageWidth - 15, 28, { align: 'right' });

            // -- Header Sub-Details Table --
            let y = 50;
            const headerTable = [
                ['CLIENTE:', headerData.cliente || 'N/A', 'OP:', record.op],
                ['CÓDIGO PRODUTO:', headerData.codigo_produto || 'N/A', 'DESENHO TÉCNICO:', headerData.desenho_tecnico || 'N/A'],
                ['DESCRIÇÃO:', headerData.descricao_material || 'N/A', 'VERSÃO:', headerData.versao || 'N/A'],
                ['CARTÃO:', headerData.cartao || 'N/A', 'Nº FACAS:', headerData.num_facas || 'N/A'],
                ['QTD TOTAL:', headerData.qtd_total || '0', 'QTD ANALISADA:', headerData.qtd_analisada || '0'],
                ['MAQUINÁRIO:', record.machines?.name || 'N/A', '', '']
            ];

            autoTable(doc, {
                startY: y,
                body: headerTable,
                theme: 'plain',
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 35 }, 1: { cellWidth: 60 },
                    2: { fontStyle: 'bold', cellWidth: 25 }, 3: { cellWidth: 40 }
                },
                margin: { left: 15 }
            });

            // -- Technical Tests Section --
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
            doc.setTextColor(...COLOR_PRIMARY);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('1. RESULTADOS DOS TESTES TÉCNICOS', 15, y);
            y += 4;

            const testsTableRows = [
                ['ESPESSURA', testsData.espessura?.a1 || '-', testsData.espessura?.a2 || '-', testsData.espessura?.avg || '-', testsData.espessura?.limit || '-', 'mm'],
                ['GRAMATURA', testsData.gramatura?.a1 || '-', testsData.gramatura?.a2 || '-', testsData.gramatura?.avg || '-', testsData.gramatura?.limit || '-', 'g/m²'],
                ['COMPRIMENTO', testsData.comprimento?.a1 || '-', testsData.comprimento?.a2 || '-', testsData.comprimento?.avg || '-', testsData.comprimento?.limit || '-', 'mm'],
                ['LARGURA', testsData.largura?.a1 || '-', testsData.largura?.a2 || '-', testsData.largura?.avg || '-', testsData.largura?.limit || '-', 'mm'],
                ['ALTURA', testsData.altura?.a1 || '-', testsData.altura?.a2 || '-', testsData.altura?.avg || '-', testsData.altura?.limit || '-', 'mm']
            ];

            autoTable(doc, {
                startY: y,
                head: [['TESTES REALIZADOS', '1ª AMO.', '2ª AMO.', 'MÉDIA', 'LIMITES / ESPEC.', 'UNID.']],
                body: testsTableRows,
                theme: 'grid',
                headStyles: { fillColor: COLOR_PRIMARY, textColor: 255, fontSize: 8, halign: 'center' },
                styles: { fontSize: 8, halign: 'center' },
                columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 40 } },
                margin: { left: 15, right: 15 }
            });

            // -- Defect Classification Section --
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
            doc.setTextColor(...COLOR_PRIMARY);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('2. CLASSIFICAÇÃO DE DEFEITOS (NÃO CONFORMIDADES)', 15, y);
            y += 4;

            const allDefects: [string, string, number][] = [];
            const addDefects = (categoryMap: Record<string, number>, label: string) => {
                Object.entries(categoryMap).forEach(([key, count]) => {
                    if (count > 0) {
                        allDefects.push([label.toUpperCase(), key.replace(/_/g, ' ').toUpperCase(), count]);
                    }
                });
            };

            addDefects(defectsData.critical || {}, 'Crítico');
            addDefects(defectsData.major || {}, 'Maior');
            addDefects(defectsData.minor || {}, 'Menor');

            if (allDefects.length > 0) {
                autoTable(doc, {
                    startY: y,
                    head: [['GRAVIDADE', 'DESCRIÇÃO DO DEFEITO', 'QUANTIDADE']],
                    body: allDefects,
                    theme: 'striped',
                    headStyles: { fillColor: COLOR_ACCENT, textColor: 255, fontSize: 8 },
                    styles: { fontSize: 8 },
                    margin: { left: 15, right: 15 }
                });
            } else {
                doc.setTextColor(100);
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.text('Nenhuma não conformidade registrada para este lote.', 15, y + 5);
                y += 5;
            }

            // -- Final Opinion & Observations --
            y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 15;

            if (!isSpreadsheetAnalysis) {
                const statusColor = record.status === 'APPROVED' ? [16, 185, 129] : [220, 38, 38];
                doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`PARECER FINAL: ${record.status === 'APPROVED' ? 'LOTE APROVADO' : 'LOTE REPROVADO'}`, 15, y);
                y += 10;
            }
            doc.setTextColor(31, 41, 55);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('EQUIPE RESPONSÁVEL:', 15, y);
            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`OPERADORES: ${getNames('operator', parsedObservations, record, operatorsList, analystsList)}`, 15, y);
            y += 5;
            doc.text(`ANALISTAS: ${getNames('analyst', parsedObservations, record, operatorsList, analystsList)}`, 15, y);

            y += 10;
            doc.setFont('helvetica', 'bold');
            doc.text('OBSERVAÇÕES:', 15, y);
            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const obsText = (parsedObservations.observations as string | undefined) ?? 'Nenhuma observação adicional.';
            const splitObs = doc.splitTextToSize(obsText, pageWidth - 30);
            doc.text(splitObs, 15, y);

            // -- Footer Responsibilities --
            y = pageHeight - 40;
            doc.setFontSize(8);
            doc.setDrawColor(200);
            doc.line(15, y, 90, y);
            doc.line(pageWidth - 90, y, pageWidth - 15, y);
            doc.text('ASSINATURA DO OPERADOR', 52, y + 5, { align: 'center' });
            doc.text('ANALISADO POR (ASSINATURA)', pageWidth - 52, y + 5, { align: 'center' });

            doc.setTextColor(150);
            doc.text(`Kingraf Sistema de Gestão de Qualidade - Impresso em ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

            doc.save(`LAUDO_ACABAMENTO_${record.op}_${headerData.reportNumber || ''}.pdf`);
            return true;
        } catch {
            return false;
        }
    },

    generateInspectionPDF(record: PdfRecord, operatorsList: PersonList = [], analystsList: PersonList = []) {
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const parsedObservations = parseObservations(record.observations);

            const getDefects = () => {
                const obs = parsedObservations as Record<string, any>;
                // Schema v2: defeitos.por_folha.cor + defeitos.por_unidade + verniz_uv.defeitos + hot_stamping.defeitos
                if (obs.schema_version === 2 || obs.defeitos) {
                    const result: Array<{ name: string; count: number }> = [];
                    const defeitos = obs.defeitos ?? {};
                    const cor = Number((defeitos.por_folha ?? {}).cor) || 0;
                    if (cor > 0) result.push({ name: 'Cor', count: cor });
                    const porUnidade = defeitos.por_unidade ?? {};
                    Object.entries(porUnidade).forEach(([key, val]: [string, any]) => {
                        const count = typeof val === 'object' ? (Number(val?.count) || 0) : (Number(val) || 0);
                        if (count > 0) result.push({ name: key.replace(/_/g, ' '), count });
                    });
                    const uv = obs.verniz_uv ?? {};
                    if (uv.aplicavel && uv.defeitos) {
                        Object.entries(uv.defeitos).forEach(([key, val]: [string, any]) => {
                            const count = typeof val === 'object' ? (Number(val?.count) || 0) : (Number(val) || 0);
                            if (count > 0) result.push({ name: `UV: ${key.replace(/_/g, ' ')}`, count });
                        });
                    }
                    const hs = obs.hot_stamping ?? {};
                    if (hs.aplicavel && hs.defeitos) {
                        Object.entries(hs.defeitos).forEach(([key, val]: [string, any]) => {
                            const count = typeof val === 'object' ? (Number(val?.count) || 0) : (Number(val) || 0);
                            if (count > 0) result.push({ name: `HS: ${key.replace(/_/g, ' ')}`, count });
                        });
                    }
                    return result;
                }
                // Schema legado
                const defectsMap = (obs.defects ?? {}) as Record<string, number>;
                return Object.entries(defectsMap)
                    .filter(([, count]) => count > 0)
                    .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }));
            };

            // -- Header --
            doc.setFillColor(...COLOR_HEADER_BG);
            doc.rect(0, 0, pageWidth, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('KINGRAF', 15, 20);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text('RELATÓRIO TÉCNICO DE INSPEÇÃO DE QUALIDADE', 15, 30);
            doc.setFontSize(8);
            doc.text(`DATA: ${new Date(record.created_at).toLocaleString('pt-BR')}`, pageWidth - 15, 20, { align: 'right' });

            let y = 50;
            const generalInfo = [
                ['OP:', record.op, 'MÁQUINA:', record.machines?.name || 'N/A'],
                ['OPERADORES:', getNames('operator', parsedObservations, record, operatorsList, analystsList), 'ANALISTAS:', getNames('analyst', parsedObservations, record, operatorsList, analystsList)],
                ['STATUS:', record.status.toUpperCase(), 'ID:', record.id.substring(0, 8).toUpperCase()]
            ];

            autoTable(doc, {
                startY: y,
                body: generalInfo,
                theme: 'plain',
                styles: { fontSize: 9, cellPadding: 2 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 2: { fontStyle: 'bold', cellWidth: 30 } },
                margin: { left: 15 }
            });

            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('OCORRÊNCIAS E NÃO CONFORMIDADES', 15, y);
            y += 4;
            doc.line(15, y, pageWidth - 15, y);
            y += 6;

            const defects = getDefects();
            if (defects.length > 0) {
                autoTable(doc, {
                    startY: y,
                    head: [['DESCRIÇÃO DO DEFEITO', 'QUANTIDADE']],
                    body: defects.map(d => [d.name.toUpperCase(), d.count]),
                    theme: 'striped',
                    headStyles: { fillColor: COLOR_HEADER_BG, textColor: 255, fontSize: 9 },
                    styles: { fontSize: 8 },
                    margin: { left: 15 }
                });
            } else {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'italic');
                doc.text('Nenhuma ocorrência registrada.', 15, y + 5);
                y += 10;
            }

            y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 15;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('OBSERVAÇÕES:', 15, y);
            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const obsText = record.observations && !record.observations.startsWith('{') ? record.observations : 'Documento processado eletronicamente.';
            const splitObs = doc.splitTextToSize(obsText, pageWidth - 30);
            doc.text(splitObs, 15, y);

            doc.save(`INSPECAO_${record.op}_${record.id.substring(0, 4)}.pdf`);
            return true;
        } catch {
            return false;
        }
    },

    async generateSummaryReportPDF(report: {
        title: string;
        generatedAt: string;
        filters?: Record<string, string>;
        totals: { inspections: number; defects: number; approved: number; rejected: number; restricted: number };
        topMachines: Array<{ name: string; count: number }>;
        topOperators: Array<{ name: string; count: number }>;
        topDefects: Array<{ name: string; count: number }>;
        weekly: Array<{ label: string; inspections: number; defects: number }>;
        monthly: Array<{ label: string; inspections: number; defects: number }>;
        annual: Array<{ label: string; inspections: number; defects: number }>;
    }, options: { save?: boolean; filename?: string; returnBlob?: boolean } = {}) {
        const { save = true, filename = 'RELATORIO_QUALIDADE.pdf', returnBlob = false } = options;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Header
        doc.setFillColor(...COLOR_HEADER_BG);
        doc.rect(0, 0, pageWidth, 60, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(report.title, 20, 32);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Gerado em: ${report.generatedAt}`, pageWidth - 20, 30, { align: 'right' });

        let y = 80;
        doc.setTextColor(31, 41, 55);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Resumo Geral', 20, y);
        y += 8;

        autoTable(doc, {
            startY: y,
            body: [
                ['Inspeções', report.totals.inspections.toString(), 'Defeitos', report.totals.defects.toString()],
                ['Aprovados', report.totals.approved.toString(), 'Reprovados', report.totals.rejected.toString()],
                ['Restritos', report.totals.restricted.toString(), '', '']
            ],
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 2: { fontStyle: 'bold', cellWidth: 80 } },
            margin: { left: 20 }
        });

        y = (doc as any).lastAutoTable.finalY + 10;

        const drawBarChart = (title: string, data: Array<{ name: string; count: number }>) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text(title, 20, y);
            y += 6;
            const maxVal = Math.max(1, ...data.map(d => d.count));
            const chartWidth = pageWidth - 60;
            data.slice(0, 8).forEach((d, idx) => {
                const barWidth = (d.count / maxVal) * chartWidth;
                const rowY = y + idx * 14;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.text(d.name.substring(0, 28), 20, rowY + 8);
                doc.setFillColor(99, 102, 241);
                doc.rect(160, rowY + 1, barWidth, 8, 'F');
                doc.setTextColor(31, 41, 55);
                doc.text(String(d.count), 160 + barWidth + 6, rowY + 8);
            });
            y += data.slice(0, 8).length * 14 + 10;
        };

        drawBarChart('Top Problemas', report.topDefects);
        drawBarChart('Top Máquinas', report.topMachines);
        drawBarChart('Top Operadores', report.topOperators);

        const addSeriesTable = (title: string, series: Array<{ label: string; inspections: number; defects: number }>) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text(title, 20, y);
            y += 6;
            autoTable(doc, {
                startY: y,
                head: [['Período', 'Inspeções', 'Defeitos']],
                body: series.map(s => [s.label, s.inspections.toString(), s.defects.toString()]),
                theme: 'grid',
                styles: { fontSize: 8, halign: 'center' },
                headStyles: { fillColor: COLOR_TEAL, textColor: 255, fontSize: 8 },
                margin: { left: 20, right: 20 }
            });
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
            if (y > pageHeight - 140) {
                doc.addPage();
                y = 40;
            }
        };

        addSeriesTable('Série Semanal (últimas 12 semanas)', report.weekly);
        addSeriesTable('Série Mensal (últimos 12 meses)', report.monthly);
        addSeriesTable('Série Anual (últimos 5 anos)', report.annual);

        let blob: Blob | null = null;
        if (returnBlob) {
            blob = doc.output('blob');
        }
        if (save) {
            doc.save(filename);
        }
        return blob;
    },
    // ─── Relatorio Gerencial (Direcao) ─────────────────────────────────
    generateManagementReportPDF(
        report: ManagementReportData,
        options: { save?: boolean; filename?: string; returnBlob?: boolean } = {},
    ): Blob | null {
        const { save = true, filename = 'RELATORIO_GERENCIAL.pdf', returnBlob = false } = options;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();

        const checkPage = (needed: number) => {
            if (y > ph - needed) { doc.addPage(); y = 40; }
        };

        // Header
        doc.setFillColor(...COLOR_HEADER_BG);
        doc.rect(0, 0, pw, 60, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('KINGRAF — RELATORIO GERENCIAL DE PRODUCAO', 20, 28);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Periodo: ${report.periodLabel}`, 20, 45);
        doc.text(`Gerado em: ${report.generatedAt}`, pw - 20, 45, { align: 'right' });

        let y = 80;
        doc.setTextColor(31, 41, 55);

        // 1. Resumo Executivo
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('1. RESUMO EXECUTIVO', 20, y);
        y += 10;

        const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
        const pct = (v: number, total: number) => total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '—';

        autoTable(doc, {
            startY: y,
            body: [
                ['OPs no periodo', String(report.summary.totalOps), 'Unidades pedidas', fmt(report.summary.totalUnidadesPedidas)],
                ['Unidades entregues', `${fmt(report.summary.totalUnidadesEntregues)} (${pct(report.summary.totalUnidadesEntregues, report.summary.totalUnidadesPedidas)})`, 'Unidades perdidas', `${fmt(report.summary.totalUnidadesPerdidas)} (${pct(report.summary.totalUnidadesPerdidas, report.summary.totalUnidadesPedidas)})`],
                ['Reimpressoes', String(report.summary.totalReimpressoes), 'OPs com escolha', String(report.summary.opsComEscolha)],
                ['OPs aprovadas', String(report.summary.opsAprovadas), 'OPs reprovadas', String(report.summary.opsReprovadas)],
            ],
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 }, 2: { fontStyle: 'bold', cellWidth: 110 } },
            margin: { left: 20, right: 20 },
        });
        y = (doc as any).lastAutoTable.finalY + 16;

        // 2. Detalhamento por OP
        checkPage(100);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('2. DETALHAMENTO POR OP', 20, y);
        y += 10;

        if (report.opDetails.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['OP', 'Cliente', 'Pedido', 'Entregue', 'Perda', 'Status']],
                body: report.opDetails.map(op => [
                    op.op,
                    (op.cliente || '—').substring(0, 20),
                    fmt(op.pedido),
                    fmt(op.entregue),
                    fmt(op.perda),
                    op.status,
                ]),
                theme: 'grid',
                styles: { fontSize: 7, halign: 'center', cellPadding: 2 },
                headStyles: { fillColor: COLOR_PRIMARY, textColor: 255, fontSize: 7 },
                columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' } },
                margin: { left: 20, right: 20 },
            });
            y = (doc as any).lastAutoTable.finalY + 16;
        }

        // 3. Problemas por Operador
        checkPage(100);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('3. PROBLEMAS POR OPERADOR', 20, y);
        y += 10;

        if (report.operatorProblems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['Operador', 'Maquina', 'OPs', 'Defeito Principal', 'Taxa Media']],
                body: report.operatorProblems.map(op => [
                    op.operador,
                    op.maquina,
                    String(op.ops),
                    op.defeitoPrincipal,
                    op.taxaMedia,
                ]),
                theme: 'grid',
                styles: { fontSize: 7, halign: 'center', cellPadding: 2 },
                headStyles: { fillColor: COLOR_TEAL, textColor: 255, fontSize: 7 },
                columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' }, 3: { halign: 'left' } },
                margin: { left: 20, right: 20 },
            });
            y = (doc as any).lastAutoTable.finalY + 16;
        }

        // 4. Problemas por Maquina
        checkPage(100);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('4. PROBLEMAS POR MAQUINA', 20, y);
        y += 10;

        if (report.machineProblems.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['Maquina', 'Operadores', 'OPs', 'Defeito Recorrente', 'Taxa']],
                body: report.machineProblems.map(mp => [
                    mp.maquina,
                    String(mp.operadores),
                    String(mp.ops),
                    mp.defeitoRecorrente,
                    mp.taxa,
                ]),
                theme: 'grid',
                styles: { fontSize: 7, halign: 'center', cellPadding: 2 },
                headStyles: { fillColor: COLOR_INDIGO, textColor: 255, fontSize: 7 },
                columnStyles: { 0: { halign: 'left' }, 3: { halign: 'left' } },
                margin: { left: 20, right: 20 },
            });
            y = (doc as any).lastAutoTable.finalY + 16;
        }

        // 5. Reimpressoes
        checkPage(100);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('5. REIMPRESSOES REALIZADAS', 20, y);
        y += 10;

        if (report.reimpressoes.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['OP', 'Rodada', 'Motivo', 'Solicitante', 'Qtd.']],
                body: report.reimpressoes.map(r => [
                    r.op,
                    String(r.rodada),
                    (r.motivo || '').substring(0, 30),
                    r.solicitante,
                    fmt(r.quantidade),
                ]),
                theme: 'grid',
                styles: { fontSize: 7, halign: 'center', cellPadding: 2 },
                headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 7 },
                columnStyles: { 2: { halign: 'left' }, 3: { halign: 'left' } },
                margin: { left: 20, right: 20 },
            });
            y = (doc as any).lastAutoTable.finalY + 16;
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.text('Nenhuma reimpressao no periodo.', 20, y);
            y += 16;
        }

        // 6. Indicadores Consolidados
        checkPage(80);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('6. INDICADORES CONSOLIDADOS', 20, y);
        y += 10;

        autoTable(doc, {
            startY: y,
            body: [
                ['Eficiencia de producao', report.kpis.eficienciaProducao],
                ['Taxa media de defeitos', report.kpis.taxaMediaDefeitos],
                ['Taxa de escolha', report.kpis.taxaEscolha],
                ['Taxa de reimpressao', report.kpis.taxaReimpressao],
                ['Aprovacao sem restricao', report.kpis.aprovacaoSemRestricao],
            ],
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 4 },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 200 }, 1: { halign: 'right' } },
            margin: { left: 20, right: 20 },
        });

        // Rodape
        const totalPages = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(150);
            doc.text(`KINGRAF — Relatorio Gerencial — Pagina ${i}/${totalPages}`, pw / 2, ph - 15, { align: 'center' });
        }

        let blob: Blob | null = null;
        if (returnBlob) blob = doc.output('blob');
        if (save) doc.save(filename);
        return blob;
    },

    async sendReportEmail(payload: { to: string; subject: string; filename: string; pdfBlob: Blob }) {
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = () => reject(new Error('Falha ao ler PDF'));
            reader.readAsDataURL(payload.pdfBlob);
        });

        const { data, error } = await supabase.functions.invoke('send-report-email', {
            body: {
                to: payload.to,
                subject: payload.subject,
                filename: payload.filename,
                fileBase64: base64
            }
        });
        if (error) throw error;
        return data;
    }
};
