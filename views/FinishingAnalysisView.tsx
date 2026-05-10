import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { ProcessType, InspectionStatus, Order, Machine, Operator, Analyst } from '../types';
import { useUser } from '../contexts/UserContext';
import { getSamplingPlan, getBoxesToOpen, distributeSample, AQL_OPTIONS } from '../utils/nbr5426';

// ─── Defeitos de produto acabado ────────────────────────────────────────────
const DEFECT_COLUMNS = [
    { key: 'manchas',               label: 'Manchas',         icon: 'texture' },
    { key: 'cor',                   label: 'Cor',             icon: 'palette' },
    { key: 'rasgado',               label: 'Rasgado',         icon: 'block' },
    { key: 'amassado',              label: 'Amassado',        icon: 'unfold_less' },
    { key: 'rebarba',               label: 'Rebarba',         icon: 'straighten' },
    { key: 'raspado',               label: 'Raspado',         icon: 'gesture' },
    { key: 'corte',                 label: 'Corte',           icon: 'content_cut' },
    { key: 'decalque',              label: 'Decalque',        icon: 'layers' },
    { key: 'impressao_desc',        label: 'Impressão Desc.', icon: 'print_disabled' },
    { key: 'sujo',                  label: 'Sujo',            icon: 'cleaning_services' },
    { key: 'atrito',                label: 'Atrito',          icon: 'scuba_diving' },
    { key: 'pinta',                 label: 'Pinta',           icon: 'blur_on' },
    { key: 'quebra_tinta',          label: 'Quebra Tinta',    icon: 'format_paint' },
    { key: 'vinco',                 label: 'Vinco',           icon: 'unfold_more' },
    { key: 'risco',                 label: 'Risco',           icon: 'edit_off' },
    { key: 'falha_plastificacao',   label: 'Falha Plast.',    icon: 'layers_clear' },
    { key: 'relevo_desc',           label: 'Relevo Desc.',    icon: 'vitals' },
    { key: 'hs_desc_falha',         label: 'HS Desc.',        icon: 'stars' },
    { key: 'verniz',                label: 'Verniz',          icon: 'brush' },
    { key: 'codagem',               label: 'Codagem',         icon: 'qr_code_2' },
    { key: 'destacadeira',          label: 'Destacadeira',    icon: 'grid_on' },
    { key: 'gramatura',             label: 'Gramatura',       icon: 'monitor_weight' },
    { key: 'fundo_amassado_aberto', label: 'Fundo Amass.',    icon: 'inventory_2' },
    { key: 'buraco_cartao',         label: 'Buraco Cartão',   icon: 'adjust' },
    { key: 'texto_fechado',         label: 'Texto Fechado',   icon: 'format_color_text' },
    { key: 'outros',                label: 'Outros',          icon: 'more_horiz' },
];

const EMPTY_DEFECTS = DEFECT_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {} as Record<string, number>);

// ─── Tipos ───────────────────────────────────────────────────────────────────
type OrderOption = Order & { fromInitialInspection?: boolean };

type RodadaSummary = {
    id: string;
    numero: number;
    date: string;
    status: 'APPROVED' | 'RESTRICTED' | 'REJECTED';
    qty_produzida: number;
    aprovadas: number;
    em_escolha: number;
    reprovadas: number;
};

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ─── Chip de pessoa (operador/analista) ──────────────────────────────────────
const PersonChip = ({ name, onRemove }: { key?: React.Key; name: string; onRemove: () => void }) => (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 text-xs font-bold border border-violet-200 dark:border-violet-800">
        {name}
        <button type="button" onClick={onRemove}
            className="size-4 flex items-center justify-center rounded hover:bg-violet-200 dark:hover:bg-violet-800 text-violet-500 hover:text-violet-700 transition-colors">
            <span className="material-symbols-outlined text-xs">close</span>
        </button>
    </span>
);

// ─── Contador de defeito ─────────────────────────────────────────────────────
const DefectCounter = ({ label, icon, count, onUpdate, onSet }: {
    key?: React.Key;
    label: string; icon: string; count: number;
    onUpdate: (d: number) => void; onSet: (v: number) => void;
}) => (
    <div className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
        count > 0
            ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/20'
            : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50'
    }`}>
        <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
            <span className="material-symbols-outlined text-sm text-primary shrink-0">{icon}</span>
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{label}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" onClick={() => onUpdate(-1)}
                className="size-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors">
                <span className="material-symbols-outlined text-xs">remove</span>
            </button>
            <input type="number" value={count || ''} onChange={e => onSet(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-10 h-6 text-center font-black text-[11px] bg-slate-50 dark:bg-slate-800 rounded border-none outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="0" />
            <button type="button" onClick={() => onUpdate(1)}
                className="size-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 transition-colors">
                <span className="material-symbols-outlined text-xs">add</span>
            </button>
        </div>
    </div>
);

// ─── Componente principal ────────────────────────────────────────────────────
export default function FinishingAnalysisView() {
    const { showToast } = useToast();
    const { profile } = useUser();

    // Dados carregados
    const [isLoading, setIsLoading]     = useState(true);
    const [isSaving, setIsSaving]       = useState(false);
    const [machines, setMachines]       = useState<Machine[]>([]);
    const [operators, setOperators]     = useState<Operator[]>([]);
    const [analysts, setAnalysts]       = useState<Analyst[]>([]);
    const [orders, setOrders]           = useState<OrderOption[]>([]);
    const [nqaProfiles, setNqaProfiles] = useState<Array<{id:string;name:string;aql_critical:string;aql_major:string;aql_minor:string;inspection_level:string}>>([]);

    // Seleção de OP
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [orderFilter, setOrderFilter]         = useState('');
    const [newOrder, setNewOrder]               = useState({ op: '', qtd_total: '' });

    // Histórico de rodadas
    const [rodadas, setRodadas]           = useState<RodadaSummary[]>([]);
    const [loadingRodadas, setLoadingRodadas] = useState(false);
    const [showRodadas, setShowRodadas]   = useState(false);

    // ── SEÇÃO 1: Identificação ────────────────────────────────────────────
    const [selectedMachineId, setSelectedMachineId]     = useState('');
    const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);   // MÚLTIPLOS
    const [selectedAnalystIds, setSelectedAnalystIds]   = useState<string[]>([]);   // MÚLTIPLOS

    // ── SEÇÃO 2: Laudo / período / quantidades ────────────────────────────
    const [laudoNumero, setLaudoNumero]     = useState('');
    const [amostragem, setAmostragem]       = useState(500);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear]   = useState(new Date().getFullYear());
    const [qtyProduzida, setQtyProduzida]   = useState(0);
    const [qtyEscolha, setQtyEscolha]       = useState(0);
    const [qtyRefugo, setQtyRefugo]         = useState(0);

    // ── SEÇÃO 3: Resultado e observações ─────────────────────────────────
    const [status, setStatus]       = useState<InspectionStatus>(InspectionStatus.APPROVED);
    const [observacoes, setObservacoes] = useState('');

    // ── SEÇÃO 4: Defeitos ─────────────────────────────────────────────────
    const [defects, setDefects] = useState<Record<string, number>>({ ...EMPTY_DEFECTS });

    // ── NQA ───────────────────────────────────────────────────────────────
    const [nqaProfileId, setNqaProfileId] = useState('');
    const [nqaConfig, setNqaConfig] = useState({
        aql_critical: '0.065', aql_major: '1.0', aql_minor: '4.0',
        inspection_level: 'II', unidades_por_caixa: 0, caixas_por_pallet: 0,
    });
    const [nqaDefects, setNqaDefects] = useState({ critical: 0, major: 0, minor: 0 });
    const [showNqa, setShowNqa] = useState(false);

    // ── Pallet ────────────────────────────────────────────────────────────
    const [showPallet, setShowPallet]             = useState(false);
    const [palletDefects, setPalletDefects]       = useState({ critical: 0, major: 0, minor: 0 });
    const [palletDefectsDetail, setPalletDefectsDetail] = useState<Record<string, number>>({ ...EMPTY_DEFECTS });
    const [palletResult, setPalletResult]         = useState<'APPROVED'|'REJECTED'|'RESTRICTED'>('APPROVED');
    const [palletObs, setPalletObs]               = useState('');
    const [isSavingPallet, setIsSavingPallet]     = useState(false);
    const [completedPalletId, setCompletedPalletId] = useState<string | null>(null);

    // ─── Carga inicial ────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [mRes, oRes, aRes, ordRes, initialRes, nqaRes] = await Promise.all([
                supabase.from('machines').select('*').eq('active', true).in('area', ['produto_acabado','ambos']).order('name'),
                supabase.from('operators').select('*').eq('active', true).in('area', ['produto_acabado','ambos']).order('name'),
                supabase.from('analysts').select('*').eq('active', true).in('tipo', ['acabamento','ambos']).order('name'),
                supabase.from('orders').select('*').order('created_at', { ascending: false }),
                supabase.from('inspections').select('op, order_id, created_at, observations').order('created_at', { ascending: false }).limit(500),
                supabase.from('nqa_profiles').select('*').eq('active', true).order('name'),
            ]);
            if (mRes.data) { setMachines(mRes.data); if (!selectedMachineId && mRes.data.length > 0) setSelectedMachineId(mRes.data[0].id); }
            if (oRes.data) setOperators(oRes.data);
            if (aRes.data) setAnalysts(aRes.data);
            if (nqaRes.data) setNqaProfiles(nqaRes.data);
            if (ordRes.data) {
                const merged = new Map<string, OrderOption>();
                ordRes.data.forEach((o: Order) => merged.set(o.op.toUpperCase(), { ...o }));
                (initialRes.data || []).forEach((insp: any) => {
                    const op = String(insp.op || '').trim().toUpperCase();
                    if (!op) return;
                    let obs: any = {};
                    try { obs = JSON.parse(insp.observations || '{}'); } catch { /* */ }
                    const isInitial = obs.process_area === 'producao_inicial' || ['OFFSET','UV','HOT_STAMPING'].includes(obs.process_type);
                    if (!isInitial) return;
                    const existing = merged.get(op);
                    if (existing) { merged.set(op, { ...existing, fromInitialInspection: true }); return; }
                    merged.set(op, {
                        id: `inspection:${op}`,
                        op,
                        cliente: '',
                        produto: '',
                        descricao: '',
                        qtd_total: 0,
                        status: 'em_producao',
                        unidades_por_folha: 0,
                        folhas_por_pilha: 0,
                        rodadas_realizadas: 0,
                        created_at: insp.created_at,
                        updated_at: insp.created_at,
                        fromInitialInspection: true
                    });
                });
                setOrders(Array.from(merged.values()));
            }
        } catch { showToast('Erro ao carregar dados', 'error'); }
        finally { setIsLoading(false); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchData(); }, [fetchData]);

    // ─── Histórico de rodadas ─────────────────────────────────────────────
    useEffect(() => {
        if (!selectedOrderId) { setRodadas([]); return; }
        const order = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase());
        if (!order || order.id.startsWith('inspection:')) { setRodadas([]); return; }
        const load = async () => {
            setLoadingRodadas(true);
            const { data } = await supabase.from('inspections').select('id, created_at, observations').eq('order_id', order.id).order('created_at', { ascending: true });
            const summaries: RodadaSummary[] = [];
            for (const row of data || []) {
                let obs: any = {};
                try { obs = JSON.parse(row.observations || '{}'); } catch { /* */ }
                if (obs.process_area !== 'producao_inicial') continue;
                summaries.push({ id: row.id, numero: obs.numero_rodada ?? summaries.length + 1, date: row.created_at, status: obs.status_final ?? 'APPROVED', qty_produzida: obs.producao?.quantidade_rodada_unidades ?? 0, aprovadas: obs.saldo_unidades?.aprovadas ?? 0, em_escolha: obs.saldo_unidades?.em_escolha ?? 0, reprovadas: obs.saldo_unidades?.reprovadas ?? 0 });
            }
            setRodadas(summaries);
            setLoadingRodadas(false);
        };
        load();
    }, [selectedOrderId, orders]);

    // ─── Helpers de multi-seleção ─────────────────────────────────────────
    const addOperator = (id: string) => { if (id && !selectedOperatorIds.includes(id)) setSelectedOperatorIds(p => [...p, id]); };
    const removeOperator = (id: string) => setSelectedOperatorIds(p => p.filter(x => x !== id));
    const addAnalyst = (id: string) => { if (id && !selectedAnalystIds.includes(id)) setSelectedAnalystIds(p => [...p, id]); };
    const removeAnalyst = (id: string) => setSelectedAnalystIds(p => p.filter(x => x !== id));

    // ─── Plano NQA (lote = qtd_total da OP) ──────────────────────────────
    const samplingPlan = useMemo(() => {
        const ord = orders.find(o => o.op === selectedOrderId || o.id === selectedOrderId);
        const lotSize = ord?.qtd_total || 0;
        if (lotSize <= 0 || nqaConfig.unidades_por_caixa <= 0) return null;
        return getSamplingPlan(lotSize, nqaConfig.aql_critical, nqaConfig.aql_major, nqaConfig.aql_minor, nqaConfig.inspection_level as any);
    }, [orders, selectedOrderId, nqaConfig]);

    const samplingBoxes = useMemo(() => {
        const ord = orders.find(o => o.op === selectedOrderId || o.id === selectedOrderId);
        const lotSize = ord?.qtd_total || 0;
        if (!samplingPlan || nqaConfig.unidades_por_caixa <= 0) return { totalBoxes: 0, totalPallets: 0, boxesToOpen: 0, boxList: [] };
        const totalBoxes = Math.ceil(lotSize / nqaConfig.unidades_por_caixa);
        const totalPallets = nqaConfig.caixas_por_pallet > 0 ? Math.ceil(totalBoxes / nqaConfig.caixas_por_pallet) : 0;
        const boxesToOpen = Math.ceil(samplingPlan.requiredSampleSize / nqaConfig.unidades_por_caixa);
        return { totalBoxes, totalPallets, boxesToOpen, boxList: distributeSample(boxesToOpen, totalBoxes) };
    }, [samplingPlan, orders, selectedOrderId, nqaConfig]);

    const nqaResult = useMemo(() => {
        if (!samplingPlan) return null;
        const critOk = nqaDefects.critical <= samplingPlan.critical.ac;
        const majOk  = nqaDefects.major   <= samplingPlan.major.ac;
        const minOk  = nqaDefects.minor   <= samplingPlan.minor.ac;
        return { critOk, majOk, minOk, overall: critOk && majOk && minOk };
    }, [samplingPlan, nqaDefects]);

    // ─── Plano NQA para pallet (sub-lote fixo 50.000) ────────────────────
    const SUBLOTE_FIXO = 50000;
    const palletSamplingPlan = useMemo(() => {
        if (nqaConfig.unidades_por_caixa <= 0) return null;
        return getSamplingPlan(SUBLOTE_FIXO, nqaConfig.aql_critical, nqaConfig.aql_major, nqaConfig.aql_minor, nqaConfig.inspection_level as any);
    }, [nqaConfig]);

    const palletBoxData = useMemo(() => {
        if (!palletSamplingPlan || nqaConfig.unidades_por_caixa <= 0)
            return { totalBoxesSublote: 0, boxesToInspect: 0, boxesList: [], sampleSize: 0, unitsPerBoxToInspect: 0 };
        const totalBoxesSublote = Math.ceil(SUBLOTE_FIXO / nqaConfig.unidades_por_caixa);
        const boxesToInspect = getBoxesToOpen(totalBoxesSublote);
        const sampleSize = palletSamplingPlan.requiredSampleSize;
        return { totalBoxesSublote, boxesToInspect, boxesList: distributeSample(boxesToInspect, totalBoxesSublote), sampleSize, unitsPerBoxToInspect: Math.ceil(sampleSize / boxesToInspect) };
    }, [palletSamplingPlan, nqaConfig.unidades_por_caixa]);

    const palletNqaResult = useMemo(() => {
        if (!palletSamplingPlan) return null;
        const critOk = palletDefects.critical <= palletSamplingPlan.critical.ac;
        const majOk  = palletDefects.major   <= palletSamplingPlan.major.ac;
        const minOk  = palletDefects.minor   <= palletSamplingPlan.minor.ac;
        return { critOk, majOk, minOk, overall: critOk && majOk && minOk };
    }, [palletSamplingPlan, palletDefects]);

    // ─── Salvar análise ───────────────────────────────────────────────────
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const typedOp = newOrder.op.trim().toUpperCase();
        if (!selectedOrderId && !typedOp) { showToast('Informe a OP', 'warning'); return; }
        if (!selectedMachineId)           { showToast('Selecione a máquina', 'warning'); return; }
        if (selectedOperatorIds.length === 0) { showToast('Adicione ao menos um operador', 'warning'); return; }
        if (selectedAnalystIds.length === 0)  { showToast('Adicione ao menos um analista', 'warning'); return; }
        if (!laudoNumero)                 { showToast('Informe o Nº do Laudo', 'warning'); return; }

        let selectedOrder = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase()) || null;
        let orderId = selectedOrder && !selectedOrder.id.startsWith('inspection:') ? selectedOrder.id : '';
        const selectedOp = selectedOrder?.op.trim().toUpperCase() || typedOp;

        setIsSaving(true);
        try {
            if (!orderId && selectedOp) {
                selectedOrder = orders.find(o => !o.id.startsWith('inspection:') && o.op.toUpperCase() === selectedOp) || null;
                if (!selectedOrder) {
                    const { data: created, error: createError } = await supabase.from('orders').insert([{ op: selectedOp, qtd_total: Math.max(0, Number(newOrder.qtd_total) || 0), status: 'em_producao', created_by_user_id: profile?.user_id ?? null }]).select().single();
                    if (createError) {
                        const { data: existing } = await supabase.from('orders').select('*').eq('op', selectedOp).single();
                        if (!existing) throw createError;
                        selectedOrder = existing;
                    } else { selectedOrder = created; }
                }
                orderId = selectedOrder && !selectedOrder.id.startsWith('inspection:') ? selectedOrder.id : '';
            }
            if (!selectedOrder || !orderId) { showToast('Não foi possível identificar a OP', 'error'); return; }

            const operatorNames = selectedOperatorIds.map(id => operators.find(o => o.id === id)?.name ?? id).join(', ');
            const analystNames  = selectedAnalystIds.map(id => analysts.find(a => a.id === id)?.name ?? id).join(', ');

            await supabase.from('inspections').insert([{
                op: selectedOrder.op,
                order_id: orderId,
                machine_id: selectedMachineId,
                operator_id: selectedOperatorIds[0],    // coluna principal = 1º da lista
                analyst_id: selectedAnalystIds[0],      // coluna principal = 1º da lista
                status,
                samples_count: amostragem,
                created_at: new Date().toISOString(),
                created_by_user_id: profile?.user_id ?? null,
                observations: JSON.stringify({
                    is_spreadsheet_analysis: true,
                    process_type: ProcessType.ACABAMENTO,
                    process_area: 'produto_acabado',
                    laudo_numero: laudoNumero,
                    status,
                    observacoes: observacoes.trim(),
                    defects,
                    producao: { qty_produzida: qtyProduzida, qty_escolha: qtyEscolha, qty_refugo: qtyRefugo },
                    all_operator_ids: selectedOperatorIds,
                    all_analyst_ids:  selectedAnalystIds,
                    operator_names: operatorNames,
                    analyst_names:  analystNames,
                    month: MONTHS[selectedMonth],
                    year: selectedYear,
                    nqa: samplingPlan ? { config: nqaConfig, profile_id: nqaProfileId || null, plan: samplingPlan, boxes: samplingBoxes, defects_found: nqaDefects, result: nqaResult } : null,
                }),
            }]);

            showToast('Análise salva com sucesso!', 'success');
            // Reset
            setSelectedOrderId(''); setOrderFilter(''); setNewOrder({ op: '', qtd_total: '' });
            setSelectedOperatorIds([]); setSelectedAnalystIds([]);
            setLaudoNumero(''); setAmostragem(500); setStatus(InspectionStatus.APPROVED); setObservacoes('');
            setDefects({ ...EMPTY_DEFECTS }); setNqaDefects({ critical: 0, major: 0, minor: 0 });
            setQtyProduzida(0); setQtyEscolha(0); setQtyRefugo(0);
            fetchData();
        } catch (err: any) { showToast(`Erro ao salvar: ${err.message}`, 'error'); }
        finally { setIsSaving(false); }
    };

    // ─── Salvar pallet ────────────────────────────────────────────────────
    const handleSavePallet = async () => {
        const selectedOrder = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase());
        if (!selectedOrderId || !selectedOrder || nqaConfig.unidades_por_caixa <= 0 || !palletSamplingPlan) {
            showToast('Selecione uma OP e configure as unidades por caixa', 'warning'); return;
        }
        setIsSavingPallet(true);
        try {
            const { count } = await supabase.from('pallet_inspections').select('id', { count: 'exact', head: true }).eq('op', selectedOrder.op.toUpperCase());
            const nextPalletNumber = (count ?? 0) + 1;
            const analystObj  = analysts.find(a => a.id === selectedAnalystIds[0]);
            const machineObj  = machines.find(m => m.id === selectedMachineId);
            const orderId = selectedOrder && !selectedOrder.id.startsWith('inspection:') ? selectedOrder.id : null;
            const profileObj = nqaProfiles.find(p => p.id === nqaProfileId);
            const { data: saved, error } = await supabase.from('pallet_inspections').insert([{
                op: selectedOrder.op.toUpperCase(), order_id: orderId, pallet_number: nextPalletNumber,
                analyst_id: selectedAnalystIds[0] || null, machine_id: selectedMachineId || null,
                analyst_name: analystObj?.name ?? null, machine_name: machineObj?.name ?? null,
                units_per_box: nqaConfig.unidades_por_caixa, boxes_per_pallet: nqaConfig.caixas_por_pallet || 0,
                total_boxes_sublote: palletBoxData.totalBoxesSublote, boxes_to_inspect: palletBoxData.boxesToInspect,
                boxes_list: palletBoxData.boxesList, sample_size: palletBoxData.sampleSize,
                nqa_profile_id: nqaProfileId || null, nqa_profile_name: profileObj?.name ?? null,
                aql_critical: nqaConfig.aql_critical, aql_major: nqaConfig.aql_major, aql_minor: nqaConfig.aql_minor,
                inspection_level: nqaConfig.inspection_level, defects_critical: palletDefects.critical,
                defects_major: palletDefects.major, defects_minor: palletDefects.minor, defects_detail: palletDefectsDetail,
                result: palletResult, observations: palletObs.trim() || null, created_by_user_id: profile?.user_id ?? null,
            }]).select('id').single();
            if (error) throw error;
            await supabase.from('shift_logs').insert([{ type: 'alert', content: `🏷️ Pallet #${nextPalletNumber} — OP ${selectedOrder.op.toUpperCase()} ${palletResult === 'APPROVED' ? 'APROVADO ✅' : palletResult === 'REJECTED' ? 'REPROVADO ❌' : 'com RESTRIÇÃO ⚠️'}. Analista: ${analystObj?.name ?? '—'}. Escaneie o QR para auditoria.`, created_by_user_id: profile?.user_id ?? null }]);
            setCompletedPalletId(saved.id);
            showToast(`Pallet #${nextPalletNumber} registrado!`, 'success');
            setPalletDefects({ critical: 0, major: 0, minor: 0 }); setPalletDefectsDetail({ ...EMPTY_DEFECTS }); setPalletObs(''); setPalletResult('APPROVED');
        } catch (err: any) { showToast(`Erro ao salvar pallet: ${err.message}`, 'error'); }
        finally { setIsSavingPallet(false); }
    };

    const filteredOrders = orders.filter(o => {
        const term = orderFilter.trim().toLowerCase();
        if (!term) return o.status === 'em_producao' || o.fromInitialInspection;
        return String(o.op || '').toLowerCase().includes(term);
    });

    const totalDefects = Object.values(defects).reduce<number>((s, v) => s + Number(v), 0);

    // ─── Render ───────────────────────────────────────────────────────────
    if (isLoading) return (
        <div className="flex items-center justify-center h-64">
            <span className="material-symbols-outlined animate-spin text-3xl text-slate-400">progress_activity</span>
        </div>
    );

    return (
        <div>
        <form onSubmit={handleSave} id="finishing-form" className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto w-full pb-24">

            {/* ══════════════════════════════════════════════════════════
                SEÇÃO 1 — OP + Operadores + Analistas (RASTREABILIDADE)
            ══════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Título da seção */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <span className="flex items-center justify-center size-7 rounded-full bg-violet-600 text-white text-xs font-black">1</span>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Identificação</h2>
                        <p className="text-[10px] text-slate-400 font-bold">OP · Operadores · Analistas · Rastreabilidade</p>
                    </div>
                </div>

                <div className="p-6 space-y-5">
                    {/* OP */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Selecionar OP existente</label>
                            <input value={orderFilter} onChange={e => setOrderFilter(e.target.value)}
                                className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs"
                                placeholder="Filtrar OP..." />
                            <select value={selectedOrderId} onChange={e => { setSelectedOrderId(e.target.value); if (e.target.value) setNewOrder({ op: '', qtd_total: '' }); }}
                                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm">
                                <option value="">Selecionar OP...</option>
                                {filteredOrders.map(o => <option key={`${o.id}:${o.op}`} value={o.op}>{o.op}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Ou cadastrar nova OP</label>
                            <div className="flex gap-2">
                                <input value={newOrder.op} onChange={e => { setSelectedOrderId(''); setNewOrder(p => ({ ...p, op: e.target.value.toUpperCase() })); }}
                                    className="flex-1 h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-black text-sm"
                                    placeholder="Ex: 12345" />
                                <input type="number" min={0} value={newOrder.qtd_total} onChange={e => setNewOrder(p => ({ ...p, qtd_total: e.target.value }))}
                                    className="w-32 h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm"
                                    placeholder="Qtd. total" />
                            </div>
                            {/* Histórico de rodadas */}
                            {rodadas.length > 0 && (
                                <button type="button" onClick={() => setShowRodadas(v => !v)}
                                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-violet-500 hover:text-violet-700 transition-colors">
                                    <span className="material-symbols-outlined text-sm">history</span>
                                    {rodadas.length} rodada{rodadas.length > 1 ? 's' : ''} nesta OP
                                    <span className="material-symbols-outlined text-xs">{showRodadas ? 'expand_less' : 'expand_more'}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Histórico colapsável */}
                    {showRodadas && rodadas.length > 0 && (() => {
                        const fmt = new Intl.NumberFormat('pt-BR');
                        const SM = { APPROVED: { label: 'Aprovado', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' }, RESTRICTED: { label: 'Restrição', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500' }, REJECTED: { label: 'Reprovado', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', dot: 'bg-rose-500' } } as const;
                        return (
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[520px] text-left text-xs">
                                        <thead><tr className="border-b border-slate-100 dark:border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                                            <th className="px-4 py-2">Rod.</th><th className="px-4 py-2">Data</th><th className="px-4 py-2">Status</th>
                                            <th className="px-4 py-2 text-right text-emerald-600">Aprov.</th><th className="px-4 py-2 text-right text-amber-600">Escolha</th><th className="px-4 py-2 text-right text-rose-600">Reprov.</th>
                                        </tr></thead>
                                        <tbody>
                                            {rodadas.map(r => { const m = SM[r.status] ?? SM.APPROVED; return (
                                                <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800 last:border-0 font-bold text-slate-700 dark:text-slate-200">
                                                    <td className="px-4 py-2 font-black">{r.numero}ª</td>
                                                    <td className="px-4 py-2 text-slate-500">{new Date(r.date).toLocaleDateString('pt-BR')}</td>
                                                    <td className="px-4 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${m.badge}`}><span className={`size-1.5 rounded-full ${m.dot}`}/>{m.label}</span></td>
                                                    <td className="px-4 py-2 text-right text-emerald-600">{fmt.format(r.aprovadas)}</td>
                                                    <td className="px-4 py-2 text-right text-amber-600">{fmt.format(r.em_escolha)}</td>
                                                    <td className="px-4 py-2 text-right text-rose-600">{fmt.format(r.reprovadas)}</td>
                                                </tr>
                                            ); })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 border-t border-slate-100 dark:border-slate-800">
                        {/* Operadores */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs text-violet-500">engineering</span>
                                Operadores <span className="text-rose-400">*</span>
                                <span className="text-slate-300 font-medium normal-case">— múltiplos turnos</span>
                            </label>
                            {selectedOperatorIds.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-h-[38px]">
                                    {selectedOperatorIds.map(id => {
                                        const op = operators.find(o => o.id === id);
                                        return <PersonChip key={id} name={op?.name ?? id} onRemove={() => removeOperator(id)} />;
                                    })}
                                </div>
                            )}
                            <select value="" onChange={e => addOperator(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 outline-none font-bold text-sm text-slate-500">
                                <option value="">+ Adicionar operador...</option>
                                {operators.filter(o => !selectedOperatorIds.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>

                        {/* Analistas */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs text-violet-500">person_search</span>
                                Analistas Responsáveis <span className="text-rose-400">*</span>
                                <span className="text-slate-300 font-medium normal-case">— múltiplos</span>
                            </label>
                            {selectedAnalystIds.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-h-[38px]">
                                    {selectedAnalystIds.map(id => {
                                        const an = analysts.find(a => a.id === id);
                                        return <PersonChip key={id} name={an?.name ?? id} onRemove={() => removeAnalyst(id)} />;
                                    })}
                                </div>
                            )}
                            <select value="" onChange={e => addAnalyst(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 outline-none font-bold text-sm text-slate-500">
                                <option value="">+ Adicionar analista...</option>
                                {analysts.filter(a => !selectedAnalystIds.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                SEÇÃO 2 — Máquina · Laudo · Amostragem · Período
            ══════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <span className="flex items-center justify-center size-7 rounded-full bg-violet-600 text-white text-xs font-black">2</span>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Dados da Análise</h2>
                        <p className="text-[10px] text-slate-400 font-bold">Máquina · Laudo · Amostragem · Período</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1 col-span-2 md:col-span-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Máquina <span className="text-rose-400">*</span></label>
                        <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)}
                            className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm">
                            <option value="">Selecionar...</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Nº do Laudo <span className="text-rose-400">*</span></label>
                        <input value={laudoNumero} onChange={e => setLaudoNumero(e.target.value)}
                            className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-black text-violet-600 text-sm"
                            placeholder="00000/25" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Amostragem</label>
                        <input type="number" value={amostragem} onChange={e => setAmostragem(parseInt(e.target.value) || 0)}
                            className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm text-center" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Período</label>
                        <div className="flex gap-1">
                            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
                                className="flex-1 h-11 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs">
                                {MONTHS.map((m, i) => <option key={m} value={i}>{m.slice(0,3)}</option>)}
                            </select>
                            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
                                className="w-20 h-11 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs">
                                {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Quantidades de produção */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-4">
                    {[
                        { label: 'Qtd. Produzida', value: qtyProduzida, set: setQtyProduzida, color: 'slate',   icon: 'inventory_2' },
                        { label: 'Em Escolha',      value: qtyEscolha,   set: setQtyEscolha,   color: 'amber',   icon: 'rule' },
                        { label: 'Refugo',          value: qtyRefugo,    set: setQtyRefugo,    color: 'rose',    icon: 'delete_sweep' },
                    ].map(({ label, value, set, color, icon }) => (
                        <div key={label} className={`space-y-1 p-3 rounded-2xl border ${color === 'rose' ? 'border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900' : color === 'amber' ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900' : 'border-slate-200 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700'}`}>
                            <label className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${color === 'rose' ? 'text-rose-500' : color === 'amber' ? 'text-amber-500' : 'text-slate-400'}`}>
                                <span className="material-symbols-outlined text-xs">{icon}</span>
                                {label}
                            </label>
                            <input
                                type="number" min={0} value={value || ''}
                                onChange={e => set(Math.max(0, parseInt(e.target.value) || 0))}
                                placeholder="0"
                                className={`w-full h-10 px-3 rounded-xl border outline-none font-black text-lg text-center ${color === 'rose' ? 'border-rose-200 bg-white dark:bg-slate-900 text-rose-700' : color === 'amber' ? 'border-amber-200 bg-white dark:bg-slate-900 text-amber-700' : 'border-slate-200 bg-white dark:bg-slate-900 text-slate-700'}`}
                            />
                        </div>
                    ))}
                </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                SEÇÃO 3 — Resultado e Observações
            ══════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <span className="flex items-center justify-center size-7 rounded-full bg-violet-600 text-white text-xs font-black">3</span>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Resultado</h2>
                        <p className="text-[10px] text-slate-400 font-bold">Veredicto da análise · Observações</p>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
                    <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Veredicto</p>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: InspectionStatus.APPROVED, label: 'Aprovado',  icon: 'check_circle', active: 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10', idle: 'border-slate-200 text-slate-400 dark:border-slate-700 hover:text-emerald-600' },
                                { id: InspectionStatus.REJECTED, label: 'Reprovado', icon: 'cancel',       active: 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/10',         idle: 'border-slate-200 text-slate-400 dark:border-slate-700 hover:text-rose-600' },
                            ].map(opt => (
                                <button key={opt.id} type="button" onClick={() => setStatus(opt.id)}
                                    className={`h-14 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all font-black text-[10px] uppercase tracking-widest ${status === opt.id ? opt.active : opt.idle}`}>
                                    <span className="material-symbols-outlined text-xl">{opt.icon}</span>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Observações</label>
                        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={4}
                            className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-violet-500/20"
                            placeholder="Restrições, motivo de reprovação, observações gerais sobre o laudo..." />
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                SEÇÃO 4 — Não Conformidades (defeitos → relatórios)
            ══════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center size-7 rounded-full bg-violet-600 text-white text-xs font-black">4</span>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Não Conformidades</h2>
                            <p className="text-[10px] text-slate-400 font-bold">Contagem por tipo de defeito — aparece nos relatórios</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {totalDefects > 0 && (
                            <span className="px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest">
                                {totalDefects} defeito{totalDefects !== 1 ? 's' : ''}
                            </span>
                        )}
                        <span className="text-[9px] font-bold text-slate-400">Amostra: {amostragem} un.</span>
                    </div>
                </div>
                <div className="p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {DEFECT_COLUMNS.map(col => (
                        <DefectCounter key={col.key} label={col.label} icon={col.icon}
                            count={defects[col.key] || 0}
                            onUpdate={d => setDefects(p => ({ ...p, [col.key]: Math.max(0, (p[col.key] || 0) + d) }))}
                            onSet={v => setDefects(p => ({ ...p, [col.key]: v }))} />
                    ))}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                SEÇÃO 5 — NQA (colapsável)
            ══════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <button type="button" onClick={() => setShowNqa(v => !v)}
                    className="w-full flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center size-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black">5</span>
                        <div className="text-left">
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Controle NQA — NBR 5426</h2>
                            <p className="text-[10px] text-slate-400 font-bold">Plano de amostragem para o lote inteiro (opcional)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {nqaResult && <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${nqaResult.overall ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{nqaResult.overall ? 'LOTE OK' : 'REPROVADO'}</span>}
                        <span className="material-symbols-outlined text-slate-400">{showNqa ? 'expand_less' : 'expand_more'}</span>
                    </div>
                </button>

                {showNqa && (
                    <div className="px-6 pb-6 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                        {/* Perfil + AQLs */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div className="col-span-2 space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Perfil NQA</label>
                                <select value={nqaProfileId} onChange={e => { setNqaProfileId(e.target.value); const p = nqaProfiles.find(p => p.id === e.target.value); if (p) setNqaConfig(prev => ({ ...prev, aql_critical: p.aql_critical, aql_major: p.aql_major, aql_minor: p.aql_minor, inspection_level: p.inspection_level })); }}
                                    className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm">
                                    <option value="">Personalizado</option>
                                    {nqaProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            {[
                                { label: 'AQL Crítico', key: 'aql_critical' as const, cls: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-700 font-black' },
                                { label: 'AQL Maior',   key: 'aql_major'    as const, cls: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 font-black' },
                                { label: 'AQL Menor',   key: 'aql_minor'    as const, cls: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold' },
                            ].map(f => (
                                <div key={f.key} className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">{f.label}</label>
                                    <select value={nqaConfig[f.key]} onChange={e => { setNqaProfileId(''); setNqaConfig(p => ({ ...p, [f.key]: e.target.value })); }}
                                        className={`w-full h-9 px-3 rounded-xl border outline-none text-sm ${f.cls}`}>
                                        {AQL_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>
                            ))}
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Nível</label>
                                <select value={nqaConfig.inspection_level} onChange={e => setNqaConfig(p => ({ ...p, inspection_level: e.target.value }))}
                                    className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm">
                                    <option value="I">Nível I</option><option value="II">Nível II</option><option value="III">Nível III</option>
                                </select>
                            </div>
                        </div>

                        {/* Embalagem */}
                        <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Unid. por Caixa</label>
                                <input type="number" min={1} value={nqaConfig.unidades_por_caixa || ''} onChange={e => setNqaConfig(p => ({ ...p, unidades_por_caixa: Math.max(1, Number(e.target.value) || 0) }))}
                                    className="w-full h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none font-black text-sm" placeholder="ex: 100" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Caixas por Pallet</label>
                                <input type="number" min={0} value={nqaConfig.caixas_por_pallet || ''} onChange={e => setNqaConfig(p => ({ ...p, caixas_por_pallet: Math.max(0, Number(e.target.value) || 0) }))}
                                    className="w-full h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none font-black text-sm" placeholder="ex: 40" />
                            </div>
                        </div>

                        {/* Resultado calculado */}
                        {samplingPlan && samplingBoxes.totalBoxes > 0 && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Total de caixas', value: `${samplingBoxes.totalBoxes} cx.`, icon: 'deployed_code' },
                                        { label: 'Total de pallets', value: samplingBoxes.totalPallets > 0 ? `${samplingBoxes.totalPallets} plt.` : '—', icon: 'stacks' },
                                        { label: 'Letra / Amostra',  value: `${samplingPlan.critical.codeLetter} → ${samplingPlan.requiredSampleSize} un.`, icon: 'rule' },
                                        { label: 'Caixas a abrir',  value: `${samplingBoxes.boxesToOpen} cx.`, icon: 'open_in_new' },
                                    ].map(item => (
                                        <div key={item.label} className="flex items-center gap-2 p-3 bg-violet-50 dark:bg-violet-950/20 rounded-xl border border-violet-100 dark:border-violet-800">
                                            <span className="material-symbols-outlined text-violet-500">{item.icon}</span>
                                            <div><p className="text-[9px] font-black uppercase tracking-widest text-violet-400">{item.label}</p><p className="text-sm font-black text-violet-800 dark:text-violet-200">{item.value}</p></div>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {([['Crítico','critical','rose'],['Maior','major','amber'],['Menor','minor','slate']] as const).map(([label, key, color]) => {
                                        const plan = samplingPlan[key]; const found = nqaDefects[key]; const ok = found <= plan.ac;
                                        return (
                                            <div key={key} className={`p-4 rounded-2xl border-2 space-y-2 ${ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30'}`}>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest text-${color}-600`}>{label}</span>
                                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{ok ? 'OK' : 'NOK'}</span>
                                                </div>
                                                <p className="text-center text-[9px] text-slate-400">n={plan.sampleSize} · Ac≤{plan.ac}</p>
                                                <div className="flex items-center gap-1.5">
                                                    <button type="button" onClick={() => setNqaDefects(p => ({ ...p, [key]: Math.max(0, p[key]-1) }))} className="size-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500"><span className="material-symbols-outlined text-sm">remove</span></button>
                                                    <input type="number" min={0} value={found} onChange={e => setNqaDefects(p => ({ ...p, [key]: Math.max(0, Number(e.target.value)||0) }))} className={`flex-1 h-8 text-center font-black text-sm rounded-lg border outline-none ${ok ? 'border-emerald-200 bg-white dark:bg-slate-900' : 'border-rose-300 bg-rose-50'}`} />
                                                    <button type="button" onClick={() => setNqaDefects(p => ({ ...p, [key]: p[key]+1 }))} className="size-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-500"><span className="material-symbols-outlined text-sm">add</span></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {nqaResult && (
                                    <div className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${nqaResult.overall ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : 'border-rose-400 bg-rose-50 dark:bg-rose-950/30'}`}>
                                        <span className={`material-symbols-outlined text-4xl ${nqaResult.overall ? 'text-emerald-500' : 'text-rose-500'}`}>{nqaResult.overall ? 'verified' : 'cancel'}</span>
                                        <div>
                                            <p className={`text-lg font-black uppercase tracking-widest ${nqaResult.overall ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>LOTE {nqaResult.overall ? 'APROVADO' : 'REPROVADO'}</p>
                                            <p className="text-xs font-bold text-slate-500">Crítico: {nqaResult.critOk ? '✓' : '✗'} | Maior: {nqaResult.majOk ? '✓' : '✗'} | Menor: {nqaResult.minOk ? '✓' : '✗'}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════
                SEÇÃO 6 — Pallet (colapsável)
            ══════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <button type="button" onClick={() => setShowPallet(v => !v)}
                    className="w-full flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center size-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black">6</span>
                        <div className="text-left">
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-violet-500">stacks</span>
                                Inspeção por Pallet — Sub-lote 50.000 un.
                            </h2>
                            <p className="text-[10px] text-slate-400 font-bold">√n+1 caixas · Gera QR para auditoria da supervisão</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {palletNqaResult && <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${palletNqaResult.overall ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{palletNqaResult.overall ? 'APROVADO' : 'REPROVADO'}</span>}
                        <span className="material-symbols-outlined text-slate-400">{showPallet ? 'expand_less' : 'expand_more'}</span>
                    </div>
                </button>

                {showPallet && (
                    <div className="px-6 pb-6 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                        {nqaConfig.unidades_por_caixa <= 0 ? (
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                                <span className="material-symbols-outlined text-amber-500">info</span>
                                <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Configure as <strong>unidades por caixa</strong> na seção NQA (seção 5) para ativar.</p>
                            </div>
                        ) : palletSamplingPlan && (
                            <>
                                {/* Card de instrução destacado */}
                                <div className="flex items-center gap-5 p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700">
                                    <span className="material-symbols-outlined text-5xl text-amber-500 shrink-0">search</span>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Olhe em cada caixa aberta</p>
                                        <p className="text-4xl font-black text-amber-800 dark:text-amber-200 leading-none">
                                            {palletBoxData.unitsPerBoxToInspect} <span className="text-xl font-bold text-amber-600">unid./caixa</span>
                                        </p>
                                        <p className="text-xs font-bold text-amber-600 mt-0.5">
                                            {palletSamplingPlan.requiredSampleSize} amostras ÷ {palletBoxData.boxesToInspect} caixas = {palletBoxData.unitsPerBoxToInspect} unid. (arredondado)
                                        </p>
                                    </div>
                                </div>

                                {/* Resumo */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Sub-lote fixo',      value: '50.000 un.',                          icon: 'inventory_2' },
                                        { label: 'Caixas sub-lote',    value: `${palletBoxData.totalBoxesSublote} cx.`, icon: 'deployed_code' },
                                        { label: 'Caixas a abrir √n+1',value: `${palletBoxData.boxesToInspect} cx.`,   icon: 'open_in_new' },
                                        { label: 'Amostra NBR 5426',   value: `${palletBoxData.sampleSize} un.`,       icon: 'rule' },
                                    ].map(item => (
                                        <div key={item.label} className="flex items-center gap-2 p-3 bg-violet-50 dark:bg-violet-950/20 rounded-xl border border-violet-100 dark:border-violet-800">
                                            <span className="material-symbols-outlined text-violet-500">{item.icon}</span>
                                            <div><p className="text-[9px] font-black uppercase tracking-widest text-violet-400">{item.label}</p><p className="text-sm font-black text-violet-800 dark:text-violet-200">{item.value}</p></div>
                                        </div>
                                    ))}
                                </div>

                                {/* Caixas */}
                                {palletBoxData.boxesList.length > 0 && (
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Distribuição sugerida</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {palletBoxData.boxesList.map(n => <span key={n} className="px-2.5 py-1 bg-violet-600 text-white text-[10px] font-black rounded-lg">Cx {n}</span>)}
                                        </div>
                                    </div>
                                )}

                                {/* NQA pallet */}
                                <div className="grid grid-cols-3 gap-3">
                                    {([['Crítico','critical','rose'],['Maior','major','amber'],['Menor','minor','slate']] as const).map(([label, key, color]) => {
                                        const plan = palletSamplingPlan[key]; const found = palletDefects[key]; const ok = found <= plan.ac;
                                        return (
                                            <div key={key} className={`p-4 rounded-2xl border-2 space-y-2 ${ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30'}`}>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest text-${color}-600`}>{label}</span>
                                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{ok ? 'OK' : 'NOK'}</span>
                                                </div>
                                                <p className="text-center text-[9px] text-slate-400">Ac≤{plan.ac} Re≥{plan.re}</p>
                                                <div className="flex items-center gap-1.5">
                                                    <button type="button" onClick={() => setPalletDefects(p => ({ ...p, [key]: Math.max(0, p[key]-1) }))} className="size-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500"><span className="material-symbols-outlined text-sm">remove</span></button>
                                                    <input type="number" min={0} value={found} onChange={e => setPalletDefects(p => ({ ...p, [key]: Math.max(0, Number(e.target.value)||0) }))} className={`flex-1 h-8 text-center font-black text-sm rounded-lg border outline-none ${ok ? 'border-emerald-200 bg-white dark:bg-slate-900' : 'border-rose-300 bg-rose-50'}`} />
                                                    <button type="button" onClick={() => setPalletDefects(p => ({ ...p, [key]: p[key]+1 }))} className="size-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-500"><span className="material-symbols-outlined text-sm">add</span></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Defeitos detalhados por tipo */}
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1"><span className="material-symbols-outlined text-sm">emergency_home</span>Defeitos por tipo</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                        {DEFECT_COLUMNS.map(col => {
                                            const count = palletDefectsDetail[col.key] || 0;
                                            return (
                                                <div key={col.key} className={`flex items-center justify-between p-2 rounded-xl border transition-all ${count > 0 ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/20' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50'}`}>
                                                    <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                                                        <span className="material-symbols-outlined text-sm text-primary shrink-0">{col.icon}</span>
                                                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{col.label}</span>
                                                    </div>
                                                    <div className="flex items-center gap-0.5 shrink-0">
                                                        <button type="button" onClick={() => setPalletDefectsDetail(p => ({ ...p, [col.key]: Math.max(0, (p[col.key]||0)-1) }))} className="size-5 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-rose-500"><span className="material-symbols-outlined text-xs">remove</span></button>
                                                        <input type="number" value={count||''} onChange={e => setPalletDefectsDetail(p => ({ ...p, [col.key]: Math.max(0, parseInt(e.target.value)||0) }))} className="w-9 h-5 text-center font-black text-[11px] bg-slate-50 dark:bg-slate-800 rounded border-none outline-none" placeholder="0" />
                                                        <button type="button" onClick={() => setPalletDefectsDetail(p => ({ ...p, [col.key]: (p[col.key]||0)+1 }))} className="size-5 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-emerald-500"><span className="material-symbols-outlined text-xs">add</span></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Resultado pallet + observações */}
                                <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Resultado do Pallet</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {([['APPROVED','Aprovado','check_circle','emerald'],['RESTRICTED','Restrição','warning','amber'],['REJECTED','Reprovado','cancel','rose']] as const).map(([id,label,icon,color]) => (
                                                <button key={id} type="button" onClick={() => setPalletResult(id)}
                                                    className={`h-12 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 text-[9px] font-black uppercase tracking-widest transition-all ${palletResult === id ? `border-${color}-500 bg-${color}-50 text-${color}-700 dark:bg-${color}-500/10` : 'border-slate-200 text-slate-400 dark:border-slate-700'}`}>
                                                    <span className="material-symbols-outlined text-sm">{icon}</span>{label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Observações do pallet</p>
                                        <textarea value={palletObs} onChange={e => setPalletObs(e.target.value)} rows={3}
                                            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-violet-500/20"
                                            placeholder="Deformações, problemas de embalagem, etc." />
                                    </div>
                                </div>

                                {/* Botão concluir pallet */}
                                <button type="button" onClick={handleSavePallet} disabled={isSavingPallet || !selectedOrderId}
                                    className="w-full h-12 rounded-2xl bg-violet-600 text-white font-black text-[11px] uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2 disabled:opacity-50">
                                    {isSavingPallet ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span> : <span className="material-symbols-outlined text-sm">qr_code_2</span>}
                                    Concluir e Gerar QR do Pallet
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ── Modal QR ─────────────────────────────────────────── */}
            {completedPalletId && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setCompletedPalletId(null)}>
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-8 space-y-5 animate-slide-in" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setCompletedPalletId(null)} className="absolute top-4 right-4 size-9 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><span className="material-symbols-outlined text-sm">close</span></button>
                        <div className="text-center space-y-1">
                            <span className="material-symbols-outlined text-5xl text-emerald-500">verified</span>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase">Pallet Registrado!</h2>
                            <p className="text-xs text-slate-400">Escaneie o QR para auditoria da supervisão</p>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm">
                                <QRCodeSVG value={`${window.location.origin}${window.location.pathname}#/pallet/${completedPalletId}`} size={180} bgColor="#ffffff" fgColor="#0f172a" level="M" />
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cole na caixa ou escaneie</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => window.print()} className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 font-black text-[10px] uppercase tracking-widest text-slate-500 flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                                <span className="material-symbols-outlined text-sm">print</span>Imprimir
                            </button>
                            <Link to={`/pallet/${completedPalletId}`} onClick={() => setCompletedPalletId(null)}
                                className="h-10 rounded-xl bg-violet-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-violet-700 transition-all">
                                <span className="material-symbols-outlined text-sm">open_in_new</span>Ver Auditoria
                            </Link>
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </form>

            {/* ── Footer sticky — cola no fundo da viewport ao rolar ── */}
            <footer className="sticky bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 px-8 py-3 z-40">
                <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest flex-wrap">
                    {selectedOrderId && <span className="text-violet-600">OP: {selectedOrderId}</span>}
                    {selectedOperatorIds.length > 0 && <span>{selectedOperatorIds.length} operador{selectedOperatorIds.length > 1 ? 'es' : ''}</span>}
                    {selectedAnalystIds.length > 0 && <span>{selectedAnalystIds.length} analista{selectedAnalystIds.length > 1 ? 's' : ''}</span>}
                    {totalDefects > 0 && <span className="text-rose-500">{totalDefects} defeito{totalDefects > 1 ? 's' : ''}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <button type="button" onClick={() => { setSelectedOrderId(''); setOrderFilter(''); setNewOrder({ op: '', qtd_total: '' }); setSelectedOperatorIds([]); setSelectedAnalystIds([]); setLaudoNumero(''); setAmostragem(500); setStatus(InspectionStatus.APPROVED); setObservacoes(''); setDefects({ ...EMPTY_DEFECTS }); setNqaDefects({ critical: 0, major: 0, minor: 0 }); setQtyProduzida(0); setQtyEscolha(0); setQtyRefugo(0); }}
                        className="h-10 px-5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                        Limpar
                    </button>
                    <button type="submit" form="finishing-form" disabled={isSaving}
                        className="h-10 px-8 rounded-xl bg-violet-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2 disabled:opacity-50">
                        {isSaving ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span> : <span className="material-symbols-outlined text-sm">add_task</span>}
                        Salvar Análise
                    </button>
                </div>
            </footer>
        </div>
    );
}
