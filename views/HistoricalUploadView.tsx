import React, { useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { InspectionStatus, ProcessType } from '../types';
import { useUser } from '../contexts/UserContext';

type ImportRow = Record<string, string>;

type PreviewItem = {
    op: string;
    created_at: string;
    process_type: ProcessType;
    process_area: 'producao_inicial' | 'produto_acabado';
    status: InspectionStatus;
    samples_count: number;
    rework_count: number;
    defects: Record<string, number>;
    totalDefects: number;
    cliente: string;
    produto: string;
    operador: string;
    analista: string;
    laudo: string;
    numAnalises: number;
};

const REQUIRED_COLUMNS = ['OP', 'ANO', 'MES', 'SETOR'];
const PRODUCT_REQUIRED_COLUMNS = ['OP'];
const EXAMPLE_COLUMNS = [
    'OP', 'ANO', 'MES', 'SETOR', 'CLIENTE', 'PRODUTO', 'OPERADOR', 'ANALISTA',
    'TOTAL_AMOSTRAS', 'REPROVADO', 'TOTAL_DEFEITOS', 'COR', 'MANCHAS', 'PINTAS',
    'REGISTRO', 'FALHA_TEXTO', 'TEXTO_FECHADO', 'CORTE', 'VINCO', 'REBARBA', 'OUTROS'
];
const PRODUCT_EXAMPLE_COLUMNS = [
    'OP', 'Nº DO LAUDO', 'ANALISTA', 'Nº DE ANÁLISES EFETUADAS', 'Nº AMOSTRAGEM',
    'MANCHAS', 'COR', 'RASGADO', 'AMASSADO', 'REBARBA', 'RASPADO', 'CORTE',
    'DECALQUE', 'IMPRESSÃO DESC.', 'SUJO', 'ATRITO', 'PINTA', 'QUEBRA TINTA',
    'VINCO', 'RISCO', 'FALHA NA PLASTIFICAÇÃO', 'RELEVO DESC.', 'HS DESC./ FALHA',
    'VERNIZ', 'COLAGEM'
];

const SETOR_MAP: Record<string, { process: ProcessType; area: 'producao_inicial' | 'produto_acabado' }> = {
    OFFSET: { process: ProcessType.OFFSET, area: 'producao_inicial' },
    IMPRESSAO_OFFSET: { process: ProcessType.OFFSET, area: 'producao_inicial' },
    IMPRESSAO: { process: ProcessType.OFFSET, area: 'producao_inicial' },
    UV: { process: ProcessType.UV, area: 'producao_inicial' },
    IMPRESSAO_UV: { process: ProcessType.UV, area: 'producao_inicial' },
    HOT_STAMPING: { process: ProcessType.HOT_STAMPING, area: 'producao_inicial' },
    HOT: { process: ProcessType.HOT_STAMPING, area: 'producao_inicial' },
    ACABAMENTO: { process: ProcessType.ACABAMENTO, area: 'produto_acabado' },
    PRODUTO_ACABADO: { process: ProcessType.ACABAMENTO, area: 'produto_acabado' },
    CORTE_VINCO: { process: ProcessType.ACABAMENTO, area: 'produto_acabado' },
    ESCOLHAS: { process: ProcessType.ESCOLHAS, area: 'produto_acabado' },
};

const DEFECT_COLUMNS: Array<{ key: string; aliases: string[] }> = [
    { key: 'manchas', aliases: ['MANCHAS'] },
    { key: 'cor', aliases: ['COR'] },
    { key: 'rasgado', aliases: ['RASGADO'] },
    { key: 'amassado', aliases: ['AMASSADO'] },
    { key: 'rebarba', aliases: ['REBARBA'] },
    { key: 'raspado', aliases: ['RASPADO'] },
    { key: 'corte', aliases: ['CORTE'] },
    { key: 'decalque', aliases: ['DECALQUE'] },
    { key: 'impressao_desc', aliases: ['IMPRESSAO_DESC', 'IMPRESSAO_DESC_FORA_DE_REGISTRO'] },
    { key: 'sujo', aliases: ['SUJO', 'SUJEIRA'] },
    { key: 'atrito', aliases: ['ATRITO'] },
    { key: 'pinta', aliases: ['PINTA', 'PINTAS'] },
    { key: 'quebra_tinta', aliases: ['QUEBRA_TINTA'] },
    { key: 'vinco', aliases: ['VINCO'] },
    { key: 'risco', aliases: ['RISCO', 'RISCOS'] },
    { key: 'falha_plastificacao', aliases: ['FALHA_NA_PLASTIFICACAO', 'FALHA_PLASTIFICACAO'] },
    { key: 'relevo_desc', aliases: ['RELEVO_DESC'] },
    { key: 'hs_desc_falha', aliases: ['HS_DESC_FALHA'] },
    { key: 'verniz', aliases: ['VERNIZ', 'FALHA_VERNIZ'] },
    { key: 'colagem', aliases: ['COLAGEM', 'COLAGEM_ACETATO_TORTO_CAR_SUJO_COLA'] },
    { key: 'falha_texto', aliases: ['FALHA_TEXTO'] },
    { key: 'texto_fechado', aliases: ['TEXTO_FECHADO'] },
    { key: 'outros', aliases: ['OUTROS', 'OUTRO'] },
];

const normalizeHeader = (value: string) => value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();

const toNumber = (value: string | undefined) => {
    if (!value) return 0;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
};

const getValue = (row: ImportRow, aliases: string[]) => {
    for (const alias of aliases) {
        const normalized = normalizeHeader(alias);
        if (row[normalized] !== undefined && row[normalized] !== '') return row[normalized];
    }
    return '';
};

const splitCsvLine = (line: string, delimiter: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"' && next === '"') {
            current += '"';
            index += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === delimiter && !quoted) {
            cells.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    cells.push(current.trim());
    return cells;
};

const parseCsv = (text: string): ImportRow[] => {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const firstLine = lines.slice(0, 20).join('\n');
    const delimiterCounts = [
        { delimiter: ';', count: (firstLine.match(/;/g) || []).length },
        { delimiter: ',', count: (firstLine.match(/,/g) || []).length },
        { delimiter: '\t', count: (firstLine.match(/\t/g) || []).length },
    ];
    const delimiter = delimiterCounts.sort((a, b) => b.count - a.count)[0].delimiter;

    const headerIndex = lines.findIndex((line) => {
        const headers = splitCsvLine(line, delimiter).map(normalizeHeader);
        return headers.includes('OP') && (
            headers.includes('ANALISTA') ||
            headers.includes('N_AMOSTRAGEM') ||
            headers.includes('N_DO_LAUDO') ||
            headers.includes('LAUDO') ||
            (headers.includes('ANO') && headers.includes('MES') && headers.includes('SETOR'))
        );
    });

    if (headerIndex < 0) return [];

    const headers = splitCsvLine(lines[headerIndex], delimiter).map(normalizeHeader);

    return lines.slice(headerIndex + 1).map((line) => {
        const cells = splitCsvLine(line, delimiter);
        return headers.reduce((row: ImportRow, header, index) => {
            row[header] = cells[index] || '';
            return row;
        }, {});
    });
};

const parseCsvSafeJson = (value: any) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const buildPreview = (rows: ImportRow[], options: { mode: 'padrao' | 'produto_acabado'; year: number; month: number }): PreviewItem[] => {
    return rows.map((row) => {
        const isProductFinished = options.mode === 'produto_acabado' || !row.SETOR;
        const setor = normalizeHeader(row.SETOR || '');
        const mapped = isProductFinished
            ? { process: ProcessType.ACABAMENTO, area: 'produto_acabado' as const }
            : SETOR_MAP[setor] || SETOR_MAP.OFFSET;
        const defects = DEFECT_COLUMNS.reduce((acc: Record<string, number>, defect) => {
            const value = toNumber(getValue(row, defect.aliases));
            if (value > 0) acc[defect.key] = value;
            return acc;
        }, {});
        const defectsTotal = toNumber(row.TOTAL_DEFEITOS) || Object.values(defects).reduce((sum, value) => sum + value, 0);
        const rework = toNumber(row.REPROVADO);
        const year = Math.max(2000, Math.min(2100, Math.round(toNumber(row.ANO)) || options.year));
        const month = Math.max(1, Math.min(12, Math.round(toNumber(row.MES)) || options.month));
        const samples = toNumber(row.TOTAL_AMOSTRAS) || toNumber(row.N_AMOSTRAGEM);

        return {
            op: String(row.OP || '').trim().toUpperCase(),
            created_at: new Date(year, month - 1, 1, 8, 0, 0).toISOString(),
            process_type: mapped.process,
            process_area: mapped.area,
            status: rework > 0 ? InspectionStatus.REJECTED : defectsTotal > 0 ? InspectionStatus.RESTRICTED : InspectionStatus.APPROVED,
            samples_count: samples,
            rework_count: rework,
            defects,
            totalDefects: defectsTotal,
            cliente: row.CLIENTE || '',
            produto: row.PRODUTO || '',
            operador: row.OPERADOR || row.OPERADOR_NORM || '',
            analista: row.ANALISTA || '',
            laudo: row.N_DO_LAUDO || row.LAUDO || '',
            numAnalises: toNumber(row.N_DE_ANALISES_EFETUADAS),
        };
    }).filter(item => item.op);
};

export default function HistoricalUploadView() {
    const { showToast } = useToast();
    const { profile } = useUser();
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [lastResult, setLastResult] = useState<{ orders: number; inspections: number } | null>(null);
    const [importMode, setImportMode] = useState<'padrao' | 'produto_acabado'>('produto_acabado');
    const [importYear, setImportYear] = useState(2026);
    const [importMonth, setImportMonth] = useState(new Date().getMonth() + 1);

    const preview = useMemo(
        () => buildPreview(rows, { mode: importMode, year: importYear, month: importMonth }),
        [importMode, importMonth, importYear, rows]
    );

    const missingColumns = useMemo(() => {
        if (rows.length === 0) return [];
        const headers = new Set(Object.keys(rows[0]));
        const required = importMode === 'produto_acabado' ? PRODUCT_REQUIRED_COLUMNS : REQUIRED_COLUMNS;
        return required.filter(column => !headers.has(column));
    }, [importMode, rows]);

    const summary = useMemo(() => {
        return {
            total: preview.length,
            approved: preview.filter(item => item.status === InspectionStatus.APPROVED).length,
            restricted: preview.filter(item => item.status === InspectionStatus.RESTRICTED).length,
            rejected: preview.filter(item => item.status === InspectionStatus.REJECTED).length,
            initial: preview.filter(item => item.process_area === 'producao_inicial').length,
            final: preview.filter(item => item.process_area === 'produto_acabado').length,
        };
    }, [preview]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            showToast('Exporte a planilha antiga como CSV antes de importar', 'warning');
            return;
        }

        const text = await file.text();
        const parsed = parseCsv(text);
        setFileName(file.name);
        setRows(parsed);
        setLastResult(null);

        if (parsed.length === 0) {
            showToast('Nenhuma linha encontrada no CSV', 'warning');
        } else {
            showToast(`${parsed.length} linhas carregadas para conferência`, 'success');
        }
    };

    const ensureOrders = async () => {
        const uniqueOps = Array.from(new Set<string>(preview.map(item => item.op)));
        if (uniqueOps.length === 0) return new Map<string, string>();

        const { data: existing, error: fetchError } = await supabase
            .from('orders')
            .select('id, op')
            .in('op', uniqueOps);

        if (fetchError) throw fetchError;

        const orderMap = new Map<string, string>();
        (existing || []).forEach((order: any) => orderMap.set(order.op, order.id));

        const toInsert = uniqueOps
            .filter(op => !orderMap.has(op))
            .map(op => {
                const item = preview.find(row => row.op === op);
                return {
                    op,
                    cliente: item?.cliente || '',
                    produto: item?.produto || '',
                    qtd_total: 0,
                    status: 'concluido',
                };
            });

        for (let index = 0; index < toInsert.length; index += 100) {
            const { data, error } = await supabase
                .from('orders')
                .insert(toInsert.slice(index, index + 100))
                .select('id, op');
            if (error) throw error;
            (data || []).forEach((order: any) => orderMap.set(order.op, order.id));
        }

        return orderMap;
    };

    const handleImport = async () => {
        if (preview.length === 0) return;
        if (missingColumns.length > 0) {
            showToast(`Colunas obrigatórias ausentes: ${missingColumns.join(', ')}`, 'error');
            return;
        }

        setIsImporting(true);
        try {
            const orderMap = await ensureOrders();
            let inserted = 0;
            let skipped = 0;

            const payload = preview.map(item => ({
                op: item.op,
                order_id: orderMap.get(item.op) || null,
                machine_id: null,
                operator_id: null,
                analyst_id: null,
                process_type: item.process_type,
                status: item.status,
                samples_count: item.samples_count,
                rework_count: item.rework_count,
                created_at: item.created_at,
                created_by_user_id: profile?.user_id ?? null,
                observations: JSON.stringify({
                    defects: item.defects,
                    totalDefects: item.totalDefects,
                    process_type: item.process_type,
                    process_area: item.process_area,
                    operator_name: item.operador,
                    analyst_name: item.analista,
                    laudo_numero: item.laudo,
                    num_analises: item.numAnalises,
                    imported_file: fileName,
                    is_spreadsheet_analysis: item.process_area === 'produto_acabado',
                    is_historical: true,
                }),
            }));

            const ops = Array.from(new Set(payload.map(item => item.op)));
            const { data: existingHistorical, error: existingError } = await supabase
                .from('inspections')
                .select('op, created_at, observations')
                .in('op', ops);

            if (existingError) throw existingError;

            const existingKeys = new Set(
                (existingHistorical || []).map((item: any) => {
                    const obs = parseCsvSafeJson(item.observations);
                    return obs.is_historical
                        ? `${item.op}|${String(item.created_at).slice(0, 10)}|${obs.process_type || ''}|${obs.laudo_numero || ''}`
                        : '';
                }).filter(Boolean)
            );

            const dedupedPayload = payload.filter(item => {
                const obs = parseCsvSafeJson(item.observations);
                const key = `${item.op}|${String(item.created_at).slice(0, 10)}|${obs.process_type || ''}|${obs.laudo_numero || ''}`;
                if (existingKeys.has(key)) {
                    skipped += 1;
                    return false;
                }
                existingKeys.add(key);
                return true;
            });

            for (let index = 0; index < dedupedPayload.length; index += 100) {
                const { error } = await supabase
                    .from('inspections')
                    .insert(dedupedPayload.slice(index, index + 100));
                if (error) throw error;
                inserted += dedupedPayload.slice(index, index + 100).length;
            }

            setLastResult({ orders: orderMap.size, inspections: inserted });
            showToast(`${inserted} registros importados. ${skipped} duplicados ignorados.`, 'success');
        } catch (error: any) {
            showToast(`Erro ao importar: ${error.message}`, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="mx-auto max-w-7xl animate-fade-in space-y-5 p-4 pb-20 md:p-6">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Base histórica para relatórios
                </p>
                <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Importar Histórico</h1>
                <p className="mt-1 text-xs font-medium text-slate-500">
                    Para Produto Acabado, exporte uma aba mensal da planilha ODS como CSV e informe o mes/ano antes de importar.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Arquivo CSV</h3>
                    <div className="mb-4 grid grid-cols-1 gap-3">
                        <label>
                            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Modelo</span>
                            <select
                                value={importMode}
                                onChange={(event) => setImportMode(event.target.value as 'padrao' | 'produto_acabado')}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            >
                                <option value="produto_acabado">Produto acabado</option>
                                <option value="padrao">Padrao com SETOR/ANO/MES</option>
                            </select>
                        </label>
                        {importMode === 'produto_acabado' && (
                            <div className="grid grid-cols-2 gap-3">
                                <label>
                                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Mes da aba</span>
                                    <select
                                        value={importMonth}
                                        onChange={(event) => setImportMonth(Number(event.target.value))}
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    >
                                        {['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((month, index) => (
                                            <option key={month} value={index + 1}>{month}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Ano</span>
                                    <input
                                        type="number"
                                        value={importYear}
                                        onChange={(event) => setImportYear(Number(event.target.value) || new Date().getFullYear())}
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                    <label className="flex h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-center transition hover:border-primary dark:border-slate-700 dark:bg-slate-950">
                        <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                        <span className="material-symbols-outlined mb-2 text-4xl text-slate-300">upload_file</span>
                        <span className="max-w-full truncate px-4 text-xs font-black uppercase tracking-widest text-slate-500">
                            {fileName || 'Selecionar CSV'}
                        </span>
                    </label>

                    <button
                        onClick={handleImport}
                        disabled={preview.length === 0 || isImporting || missingColumns.length > 0}
                        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-primary/90 disabled:opacity-50"
                    >
                        {isImporting ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">database_upload</span>}
                        Importar para Relatórios
                    </button>

                    {missingColumns.length > 0 && (
                        <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-bold text-rose-600">
                            Faltam colunas obrigatórias: {missingColumns.join(', ')}
                        </p>
                    )}

                    {lastResult && (
                        <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
                            Importado: {lastResult.inspections} registros.
                        </p>
                    )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                    <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Modelo padronizado</h3>
                    <p className="mb-3 text-xs font-medium text-slate-500">
                        O importador reconhece estes nomes de coluna. As colunas de defeito podem ficar zeradas ou vazias.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {(importMode === 'produto_acabado' ? PRODUCT_EXAMPLE_COLUMNS : EXAMPLE_COLUMNS).map(column => (
                            <span key={column} className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${(importMode === 'produto_acabado' ? PRODUCT_REQUIRED_COLUMNS : REQUIRED_COLUMNS).includes(column) ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                                {column}
                            </span>
                        ))}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
                        <Metric label="Linhas" value={summary.total} />
                        <Metric label="Aprovadas" value={summary.approved} tone="emerald" />
                        <Metric label="Restrição" value={summary.restricted} tone="amber" />
                        <Metric label="Reprovadas" value={summary.rejected} tone="rose" />
                        <Metric label="Inicial" value={summary.initial} />
                        <Metric label="Acabado" value={summary.final} />
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Prévia antes de importar</h3>
                {preview.length === 0 ? (
                    <div className="py-16 text-center text-sm font-black uppercase tracking-widest text-slate-400">
                        Nenhuma planilha carregada
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left">
                            <thead>
                                <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                                    <th className="py-3">Data</th>
                                    <th className="py-3">OP</th>
                                    <th className="py-3">Laudo</th>
                                    <th className="py-3">Processo</th>
                                    <th className="py-3">Área</th>
                                    <th className="py-3">Status</th>
                                    <th className="py-3 text-right">Amostras</th>
                                    <th className="py-3 text-right">Revisão</th>
                                    <th className="py-3 text-right">Desvios</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.slice(0, 80).map((item, index) => (
                                    <tr key={`${item.op}-${index}`} className="border-b border-slate-50 text-sm font-bold text-slate-700 last:border-0 dark:border-slate-800 dark:text-slate-200">
                                        <td className="py-3">{new Date(item.created_at).toLocaleDateString('pt-BR')}</td>
                                        <td className="py-3">{item.op}</td>
                                        <td className="py-3">{item.laudo || '-'}</td>
                                        <td className="py-3">{item.process_type}</td>
                                        <td className="py-3">{item.process_area === 'producao_inicial' ? 'Inicial' : 'Produto acabado'}</td>
                                        <td className="py-3">{item.status}</td>
                                        <td className="py-3 text-right">{item.samples_count}</td>
                                        <td className="py-3 text-right">{item.rework_count}</td>
                                        <td className="py-3 text-right text-rose-600">{item.totalDefects}</td>
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
    const color = {
        slate: 'text-slate-900 dark:text-white',
        emerald: 'text-emerald-600',
        amber: 'text-amber-600',
        rose: 'text-rose-600',
    }[tone];

    return (
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className={`mt-1 text-xl font-black ${color}`}>{value}</p>
        </div>
    );
}
