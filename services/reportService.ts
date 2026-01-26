
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InspectionRecord } from '../types';

export const reportService = {
    generateInspectionPDF(record: any, operatorsList: any[] = [], analystsList: any[] = []) {
        try {
            console.log('Initializing PDF Generation...');
            const doc = new jsPDF();
            console.log('PDF Instance created');

            const pageWidth = doc.internal.pageSize.getWidth();
            const parsedObservations = (() => {
                if (!record.observations) return {};
                try {
                    return JSON.parse(record.observations);
                } catch {
                    return {};
                }
            })();

            const safeNumber = (value: any) => {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : 0;
            };

            // Helper to get names
            const getNames = (type: 'operator' | 'analyst') => {
                let ids: string[] = [];
                const obs = parsedObservations;
                if (type === 'operator' && obs.all_operator_ids) ids = obs.all_operator_ids;
                else if (type === 'analyst' && obs.all_analyst_ids) ids = obs.all_analyst_ids;
                else {
                    const singleId = type === 'operator' ? record.operator_id : record.analyst_id;
                    if (singleId) ids = [singleId];
                }
                const list = type === 'operator' ? operatorsList : analystsList;
                if (ids.length === 0) return 'N/A';
                return ids.map(id => list.find(item => item.id === id)?.name || 'Desconhecido').join(', ');
            };

            // Helper to get defects
            const getDefects = () => {
                const defectsMap = parsedObservations.defects || {};
                const parsed = Object.entries(defectsMap)
                    .filter(([_, count]) => (count as number) > 0)
                    .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }));
                if (parsed.length > 0) return parsed;
                if (record.inspection_defects && record.inspection_defects.length > 0) {
                    return record.inspection_defects.map((d: any) => ({
                        name: d.defect_types?.name || 'Defeito',
                        count: d.count
                    }));
                }
                return [];
            };

            const getEscolhaData = () => {
                const escolhaSource = record.escolha || parsedObservations.escolha;
                if (escolhaSource) {
                    return {
                        op_total_unidades: safeNumber(escolhaSource.op_total_unidades),
                        folhas_impressas_total: safeNumber(escolhaSource.folhas_impressas_total),
                        folhas_revisadas_pilha: safeNumber(escolhaSource.folhas_revisadas_pilha),
                        escolhas_unidades: safeNumber(escolhaSource.escolhas_unidades),
                        observacoes: typeof escolhaSource.observacoes === 'string' ? escolhaSource.observacoes : ''
                    };
                }
                const quantities = parsedObservations.quantities || {};
                const hasLegacy = Object.keys(quantities).length > 0 || parsedObservations.restriction_reason || parsedObservations.observacoes;
                if (!hasLegacy) return null;
                return {
                    op_total_unidades: safeNumber(quantities.total_op),
                    folhas_impressas_total: safeNumber(quantities.folhas_impressas),
                    folhas_revisadas_pilha: safeNumber(quantities.folhas_revisadas),
                    escolhas_unidades: safeNumber(quantities.escolhas),
                    observacoes: typeof parsedObservations.restriction_reason === 'string'
                        ? parsedObservations.restriction_reason
                        : typeof parsedObservations.observacoes === 'string'
                            ? parsedObservations.observacoes
                            : ''
                };
            };

            // -- Header --
            doc.setFillColor(30, 41, 59); // slate-800
            doc.rect(0, 0, pageWidth, 40, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('KINGRAF', 15, 20);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text('RELATÃ“RIO TÃ‰CNICO DE INSPEÃ‡ÃƒO DE QUALIDADE', 15, 30);

            doc.setFontSize(8);
            doc.text(`DATA DE EMISSÃƒO: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 15, 20, { align: 'right' });
            doc.text(`ID REGISTRO: ${record.id.substring(0, 8).toUpperCase()}`, pageWidth - 15, 25, { align: 'right' });

            // -- Main Info Section --
            let y = 55;
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('INFORMAÃ‡Ã•ES GERAIS', 15, y);

            y += 5;
            doc.setDrawColor(226, 232, 240); // slate-200
            doc.line(15, y, pageWidth - 15, y);

            y += 10;
            const generalInfo = [
                ['ORDEM DE PRODUÃ‡ÃƒO (OP)', record.op],
                ['EQUIPAMENTO / MÃQUINA', record.machines?.name || 'N/A'],
                ['CÃ“DIGO DA MÃQUINA', record.machines?.code || 'N/A'],
                ['OPERADORES RESPONSÃVEIS', getNames('operator')],
                ['ANALISTAS DE QUALIDADE', getNames('analyst')],
                ['DATA DA INSPEÃ‡ÃƒO', new Date(record.created_at).toLocaleString('pt-BR')],
                ['STATUS FINAL', record.status.toUpperCase()]
            ];

            autoTable(doc, {
                startY: y,
                head: [],
                body: generalInfo,
                theme: 'plain',
                styles: { fontSize: 10, cellPadding: 2 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
                margin: { left: 15 }
            });

            // -- Defects Section --
            y = (doc as any).lastAutoTable.finalY + 20;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('OFF-SET / OCORRÃŠNCIAS E NÃƒO CONFORMIDADES', 15, y);

            y += 5;
            doc.line(15, y, pageWidth - 15, y);

            y += 10;
            const defects = getDefects();
            const defectTableData = defects.map((d: any) => [
                d.name,
                d.count,
                'NÃƒO CONFORME'
            ]);

            if (defectTableData.length > 0) {
                autoTable(doc, {
                    startY: y,
                    head: [['CLASSIFICAÃ‡ÃƒO DO DEFEITO', 'QUANTIDADE', 'AVALIAÃ‡ÃƒO']],
                    body: defectTableData,
                    theme: 'striped',
                    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 10 },
                    styles: { fontSize: 9 },
                    margin: { left: 15 }
                });
            } else {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'italic');
                doc.text('Nenhuma nÃ£o conformidade registrada nesta inspeÃ§Ã£o.', 15, y + 5);
                y += 10;
            }

            // -- Production Data & Observations --
            const finalY = (doc as any).lastAutoTable?.finalY || y + 10;
            y = finalY + 20;

            doc.setFont('helvetica', 'bold');
            doc.text('DADOS COMPLEMENTARES', 15, y);
            y += 5;
            doc.line(15, y, pageWidth - 15, y);

            y += 10;

            // --- CONCLUSION SECTION (New Request) ---
            // If status is not APPROVED, we add a specific summary block
            if (record.status !== 'APPROVED') {
                const isRejected = record.status === 'REJECTED';
                const statusColor = isRejected ? [220, 38, 38] : [217, 119, 6]; // red or amber

                // Draw Box
                const boxHeight = 35;
                doc.setDrawColor(statusColor[0], statusColor[1], statusColor[2]);
                doc.setLineWidth(1);
                doc.rect(15, y, pageWidth - 30, boxHeight);

                // Header in Box
                doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
                doc.rect(15, y, pageWidth - 30, 8, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text('CONCLUSÃƒO DA INSPEÃ‡ÃƒO / PARECER TÃ‰CNICO', pageWidth / 2, y + 5.5, { align: 'center' });

                // Content in Box
                y += 15;
                doc.setTextColor(0);
                doc.setFontSize(10);

                // ROW 1: Status big
                doc.setFont('helvetica', 'bold');
                doc.text(`STATUS: ${isRejected ? 'LOTE REPROVADO' : 'LOTE EM REVISÃƒO'}`, 20, y);

                // ROW 2: Specific Responsibility
                y += 7;
                doc.setFont('helvetica', 'normal');
                doc.text('RESPONSÃVEL(IS):', 20, y);
                doc.setFont('helvetica', 'bold');
                doc.text(getNames('operator'), 55, y);

                y += 7;
                doc.setFont('helvetica', 'normal');
                doc.text('MÃQUINA / OP:', 20, y);
                doc.setFont('helvetica', 'bold');
                doc.text(`${record.machines?.name || 'N/A'}  -  OP: ${record.op}`, 55, y);

                y = (doc as any).lastAutoTable?.finalY || y + 15; // Reset y for next section relatively
                y += boxHeight - 20; // Adjust manual y pointer
            }

            let obsText = '';
            try {
                const obs = record.observations ? JSON.parse(record.observations) : null;
                if (obs && typeof obs === 'object') {
                    obsText = 'Nenhuma observaÃ§Ã£o textual registrada.';
                } else {
                    obsText = record.observations || 'Nenhuma observaÃ§Ã£o informada.';
                }
            } catch (e) {
                obsText = record.observations || 'Nenhuma observaÃ§Ã£o informada.';
            }
            autoTable(doc, {
                startY: y,
                body: [
                    ['SAMPLES (AMOSTRAGEM)', record.samples_count || 0],
                    ['REWORK (RETRABALHO)', record.rework_count || 0],
                ],
                theme: 'plain',
                styles: { fontSize: 10 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
                margin: { left: 15 }
            });

            let observationsY = (doc as any).lastAutoTable.finalY + 15;
            const escolhaData = getEscolhaData();
            if (escolhaData) {
                doc.setFont('helvetica', 'bold');
                doc.text('ESCOLHA / SEPARAÇÃO MANUAL', 15, observationsY);
                observationsY += 5;
                doc.line(15, observationsY, pageWidth - 15, observationsY);
                observationsY += 10;
                const escolhaRows = [
                    ['OP (unidades)', escolhaData.op_total_unidades],
                    ['Folhas impressas', escolhaData.folhas_impressas_total],
                    ['Folhas revisadas', escolhaData.folhas_revisadas_pilha],
                    ['Escolhas (unidades)', escolhaData.escolhas_unidades]
                ];
                autoTable(doc, {
                    startY: observationsY,
                    head: [],
                    body: escolhaRows,
                    theme: 'plain',
                    styles: { fontSize: 10 },
                    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
                    margin: { left: 15 }
                });
                observationsY = (doc as any).lastAutoTable.finalY + 10;
                if (escolhaData.observacoes) {
                    doc.setFont('helvetica', 'italic');
                    doc.setFontSize(9);
                    const choiceLines = doc.splitTextToSize('Observações de escolha: ' + escolhaData.observacoes, pageWidth - 30);
                    doc.text(choiceLines, 15, observationsY);
                    observationsY += choiceLines.length * 6;
                }
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
            }
            y = observationsY;
            doc.setFont('helvetica', 'bold');
            doc.text('OBSERVAÇÕES TÉCNICAS:', 15, y);
            y += 7;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const splitObs = doc.splitTextToSize(obsText, pageWidth - 30);
            doc.text(splitObs, 15, y);

            // -- Footer / Signature --
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text('Documento gerado automaticamente pelo Sistema de GestÃ£o de Qualidade Kingraf', pageWidth / 2, pageHeight - 20, { align: 'center' });
            doc.text('PÃ¡gina 1 de 1', pageWidth / 2, pageHeight - 15, { align: 'center' });

            // Save
            console.log('Saving PDF...');
            doc.save(`KINGRAF_RELATORIO_${record.op}_${new Date().getTime()}.pdf`);
            console.log('PDF Saved.');
            return true;
        } catch (error) {
            console.error('CRITICAL PDF ERROR:', error);
            alert(`Erro crÃ­tico ao gerar PDF: ${error}`);
            return false;
        }
    }
};



