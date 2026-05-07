
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
                const defectsMap = (parsedObservations.defects ?? {}) as Record<string, number>;
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
