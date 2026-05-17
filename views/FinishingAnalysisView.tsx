import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { ProcessType, InspectionStatus, Order, Machine, Operator, Analyst } from '../types';
import { useUser } from '../contexts/UserContext';
import { getSamplingPlan, getBoxesToOpen, distributeSample, AQL_OPTIONS } from '../utils/nbr5426';

// ─── Defeitos de produto acabado ─────────────────────────────────────────────
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

type SavedPallet = {
    id: string;
    pallet_number: number;
    result: 'APPROVED' | 'RESTRICTED' | 'REJECTED';
    defects_critical: number;
    defects_major: number;
    defects_minor: number;
    created_at: string;
    analyst_name: string | null;
};

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const FINISHING_STEPS = [
    { id: 1, label: 'Identificação',     short: 'Identificação' },
    { id: 2, label: 'Inspeção de Pallets', short: 'Pallets'      },
    { id: 3, label: 'Conclusão',         short: 'Conclusão'     },
];


// ─── Chip de pessoa ───────────────────────────────────────────────────────────
const PersonChip = ({ name, onRemove }: { key?: React.Key; name: string; onRemove: () => void }) => (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
        {name}
        <button type="button" onClick={onRemove}
            className="size-4 flex items-center justify-center rounded hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-500 hover:text-indigo-700 transition-colors">
            <span className="material-symbols-outlined text-xs">close</span>
        </button>
    </span>
);

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinishingAnalysisView() {
    const { showToast } = useToast();
    const { profile } = useUser();

    const [isLoading, setIsLoading]     = useState(true);
    const [isSaving, setIsSaving]       = useState(false);
    const [machines, setMachines]       = useState<Machine[]>([]);
    const [operators, setOperators]     = useState<Operator[]>([]);
    const [analysts, setAnalysts]       = useState<Analyst[]>([]);
    const [orders, setOrders]           = useState<OrderOption[]>([]);
    const [nqaProfiles, setNqaProfiles] = useState<Array<{id:string;name:string;aql_critical:string;aql_major:string;aql_minor:string;inspection_level:string}>>([]);

    // OP
    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [orderFilter, setOrderFilter]         = useState('');
    const [rodadas, setRodadas]                 = useState<RodadaSummary[]>([]);
    const [showRodadas, setShowRodadas]         = useState(false);

    // Pallets salvos
    const [savedPallets, setSavedPallets]               = useState<SavedPallet[]>([]);
    const [loadingSavedPallets, setLoadingSavedPallets] = useState(false);

    // Step 1 — Identificação
    const [selectedMachineId, setSelectedMachineId]     = useState('');
    const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
    const [selectedAnalystIds, setSelectedAnalystIds]   = useState<string[]>([]);
    const [laudoNumero, setLaudoNumero]                 = useState('');
    const [selectedMonth, setSelectedMonth]             = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear]               = useState(new Date().getFullYear());
    const [nqaProfileId, setNqaProfileId]               = useState('');
    const [nqaConfig, setNqaConfig] = useState({
        aql_critical: '0.065', aql_major: '1.0', aql_minor: '4.0',
        inspection_level: 'II', unidades_por_caixa: 0, caixas_por_pallet: 0,
    });

    // Step 2 — Inspeção por pallet
    const [palletDefects, setPalletDefects]             = useState({ critical: 0, major: 0, minor: 0 });
    const [palletDefectsDetail, setPalletDefectsDetail] = useState<Record<string, number>>({ ...EMPTY_DEFECTS });
    const [palletResult, setPalletResult]               = useState<'APPROVED'|'REJECTED'|'RESTRICTED'>('APPROVED');
    const [palletObs, setPalletObs]                     = useState('');
    const [isSavingPallet, setIsSavingPallet]           = useState(false);
    const [completedPalletId, setCompletedPalletId]     = useState<string | null>(null);

    // Step 3 — Conclusão
    const [qtyProduzida, setQtyProduzida] = useState(0);
    const [qtyEscolha, setQtyEscolha]     = useState(0);
    const [qtyRefugo, setQtyRefugo]       = useState(0);
    const [observacoes, setObservacoes]   = useState('');
    const [destinoFinal, setDestinoFinal] = useState<'expedicao'|'revisao_final'|''>('');
    const [status, setStatus]             = useState<InspectionStatus>(InspectionStatus.APPROVED);

    const [activeStep, setActiveStep] = useState(1);

    // ─── Persistência de sessão em localStorage ───────────────────────────
    const SESSION_KEY = 'kg_produto_acabado_session';

    // Restaura sessão ao montar (antes do fetchData completar)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return;
            const s = JSON.parse(raw);
            if (s.selectedOrderId) { setSelectedOrderId(s.selectedOrderId); setOrderFilter(s.selectedOrderId); }
            if (s.selectedMachineId) setSelectedMachineId(s.selectedMachineId);
            if (Array.isArray(s.selectedOperatorIds) && s.selectedOperatorIds.length) setSelectedOperatorIds(s.selectedOperatorIds);
            if (Array.isArray(s.selectedAnalystIds) && s.selectedAnalystIds.length) setSelectedAnalystIds(s.selectedAnalystIds);
            if (s.laudoNumero) setLaudoNumero(s.laudoNumero);
            if (s.selectedMonth !== undefined) setSelectedMonth(s.selectedMonth);
            if (s.selectedYear !== undefined) setSelectedYear(s.selectedYear);
            if (s.nqaProfileId) setNqaProfileId(s.nqaProfileId);
            if (s.nqaConfig) setNqaConfig(s.nqaConfig);
            if (s.activeStep && s.activeStep > 1) setActiveStep(s.activeStep);
        } catch { /* ignora sessão corrompida */ }
    }, []); // executa apenas na montagem

    // Salva sessão sempre que estado relevante muda
    useEffect(() => {
        if (!selectedOrderId) { localStorage.removeItem(SESSION_KEY); return; }
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            selectedOrderId, selectedMachineId, selectedOperatorIds, selectedAnalystIds,
            laudoNumero, selectedMonth, selectedYear, nqaProfileId, nqaConfig,
            activeStep,
        }));
    }, [selectedOrderId, selectedMachineId, selectedOperatorIds, selectedAnalystIds,
        laudoNumero, selectedMonth, selectedYear, nqaProfileId, nqaConfig, activeStep]);

    // ─── Carga inicial ────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [mRes, oRes, aRes, ordRes, nqaRes] = await Promise.all([
                supabase.from('machines').select('*').eq('active', true).in('area', ['produto_acabado','ambos']).order('name'),
                supabase.from('operators').select('*').eq('active', true).in('area', ['produto_acabado','ambos']).order('name'),
                supabase.from('analysts').select('*').eq('active', true).in('tipo', ['acabamento','ambos']).order('name'),
                supabase.from('orders').select('*').gt('qtd_total', 0).order('created_at', { ascending: false }),
                supabase.from('nqa_profiles').select('*').eq('active', true).order('name'),
            ]);
            if (mRes.data) { setMachines(mRes.data); if (!selectedMachineId && mRes.data.length > 0) setSelectedMachineId(mRes.data[0].id); }
            if (oRes.data) setOperators(oRes.data);
            if (aRes.data) setAnalysts(aRes.data);
            if (nqaRes.data) setNqaProfiles(nqaRes.data);
            if (ordRes.data) setOrders((ordRes.data as Order[]).map(o => ({ ...o, op: String(o.op || '').trim().toUpperCase() })));
        } catch { showToast('Erro ao carregar dados', 'error'); }
        finally { setIsLoading(false); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchData(); }, [fetchData]);

    // ─── Rodadas de impressão da OP ───────────────────────────────────────
    useEffect(() => {
        if (!selectedOrderId) { setRodadas([]); setQtyProduzida(0); return; }
        const order = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase());
        if (!order) { setRodadas([]); setQtyProduzida(0); return; }
        const load = async () => {
            const { data } = await supabase.from('inspections').select('id, created_at, observations').eq('order_id', order.id).order('created_at', { ascending: true });
            const summaries: RodadaSummary[] = [];
            for (const row of data || []) {
                let obs: any = {};
                try { obs = JSON.parse(row.observations || '{}'); } catch { /* */ }
                if (obs.process_area !== 'producao_inicial') continue;
                summaries.push({ id: row.id, numero: obs.numero_rodada ?? summaries.length + 1, date: row.created_at, status: obs.status_final ?? 'APPROVED', qty_produzida: obs.producao?.quantidade_rodada_unidades ?? 0, aprovadas: obs.saldo_unidades?.aprovadas ?? 0, em_escolha: obs.saldo_unidades?.em_escolha ?? 0, reprovadas: obs.saldo_unidades?.reprovadas ?? 0 });
            }
            setRodadas(summaries);
            const totalEmEscolha = summaries.reduce((s, r) => s + r.em_escolha, 0);
            if (totalEmEscolha > 0) setQtyProduzida(totalEmEscolha);
        };
        load();
    }, [selectedOrderId, orders]);

    // ─── Pallets salvos da OP ─────────────────────────────────────────────
    useEffect(() => {
        if (!selectedOrderId) { setSavedPallets([]); return; }
        const order = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase());
        if (!order) { setSavedPallets([]); return; }
        const load = async () => {
            setLoadingSavedPallets(true);
            const { data } = await supabase.from('pallet_inspections')
                .select('id,pallet_number,result,defects_critical,defects_major,defects_minor,created_at,analyst_name')
                .eq('op', order.op.toUpperCase()).order('pallet_number');
            setSavedPallets(data || []);
            setLoadingSavedPallets(false);
        };
        load();
    }, [selectedOrderId, orders]);

    // ─── Auto-status e destino baseado em pallets ─────────────────────────
    const autoStatus = useMemo((): InspectionStatus => {
        if (savedPallets.some(p => p.result === 'REJECTED')) return InspectionStatus.REJECTED;
        if (savedPallets.some(p => p.result === 'RESTRICTED')) return InspectionStatus.RESTRICTED;
        return InspectionStatus.APPROVED;
    }, [savedPallets]);

    const autoDestino = useMemo(() => {
        if (savedPallets.length === 0) return '';
        return savedPallets.some(p => p.result === 'REJECTED') ? 'revisao_final' : 'expedicao';
    }, [savedPallets]);

    useEffect(() => {
        if (activeStep === 3) {
            setStatus(autoStatus);
            if (!destinoFinal && autoDestino) setDestinoFinal(autoDestino as 'expedicao' | 'revisao_final');
        }
    }, [activeStep]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Helpers ─────────────────────────────────────────────────────────
    const addOperator = (id: string) => { if (id && !selectedOperatorIds.includes(id)) setSelectedOperatorIds(p => [...p, id]); };
    const removeOperator = (id: string) => setSelectedOperatorIds(p => p.filter(x => x !== id));
    const addAnalyst = (id: string) => { if (id && !selectedAnalystIds.includes(id)) setSelectedAnalystIds(p => [...p, id]); };
    const removeAnalyst = (id: string) => setSelectedAnalystIds(p => p.filter(x => x !== id));

    // ─── NQA por pallet ───────────────────────────────────────────────────
    const palletLotSize = nqaConfig.unidades_por_caixa * nqaConfig.caixas_por_pallet;

    const palletSamplingPlan = useMemo(() => {
        if (palletLotSize <= 0) return null;
        return getSamplingPlan(palletLotSize, nqaConfig.aql_critical, nqaConfig.aql_major, nqaConfig.aql_minor, nqaConfig.inspection_level as any);
    }, [palletLotSize, nqaConfig.aql_critical, nqaConfig.aql_major, nqaConfig.aql_minor, nqaConfig.inspection_level]);

    const palletBoxData = useMemo(() => {
        if (!palletSamplingPlan || nqaConfig.unidades_por_caixa <= 0 || nqaConfig.caixas_por_pallet <= 0)
            return { totalBoxes: 0, boxesToInspect: 0, boxesList: [], sampleSize: 0, unitsPerBox: 0 };
        const totalBoxes = nqaConfig.caixas_por_pallet;
        const boxesToInspect = getBoxesToOpen(totalBoxes);
        const sampleSize = palletSamplingPlan.requiredSampleSize;
        return { totalBoxes, boxesToInspect, boxesList: distributeSample(boxesToInspect, totalBoxes), sampleSize, unitsPerBox: boxesToInspect > 0 ? Math.ceil(sampleSize / boxesToInspect) : 0 };
    }, [palletSamplingPlan, nqaConfig.unidades_por_caixa, nqaConfig.caixas_por_pallet]);

    const palletNqaResult = useMemo(() => {
        if (!palletSamplingPlan) return null;
        const critOk = palletDefects.critical <= palletSamplingPlan.critical.ac;
        const majOk  = palletDefects.major   <= palletSamplingPlan.major.ac;
        const minOk  = palletDefects.minor   <= palletSamplingPlan.minor.ac;
        return { critOk, majOk, minOk, overall: critOk && majOk && minOk };
    }, [palletSamplingPlan, palletDefects]);

    // ─── Salvar pallet ────────────────────────────────────────────────────
    const handleSavePallet = async () => {
        const selectedOrder = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase());
        if (!selectedOrderId || !selectedOrder || nqaConfig.unidades_por_caixa <= 0 || !palletSamplingPlan) {
            showToast('Configure unidades por caixa e caixas por pallet antes de registrar', 'warning'); return;
        }
        setIsSavingPallet(true);
        try {
            const { count } = await supabase.from('pallet_inspections').select('id', { count: 'exact', head: true }).eq('op', selectedOrder.op.toUpperCase());
            const nextNum = (count ?? 0) + 1;
            const analystObj = analysts.find(a => a.id === selectedAnalystIds[0]);
            const machineObj = machines.find(m => m.id === selectedMachineId);
            const profileObj = nqaProfiles.find(p => p.id === nqaProfileId);
            const { data: saved, error } = await supabase.from('pallet_inspections').insert([{
                op: selectedOrder.op.toUpperCase(), order_id: selectedOrder.id, pallet_number: nextNum,
                analyst_id: selectedAnalystIds[0] || null, machine_id: selectedMachineId || null,
                analyst_name: analystObj?.name ?? null, machine_name: machineObj?.name ?? null,
                units_per_box: nqaConfig.unidades_por_caixa, boxes_per_pallet: nqaConfig.caixas_por_pallet,
                total_boxes_sublote: palletBoxData.totalBoxes, boxes_to_inspect: palletBoxData.boxesToInspect,
                boxes_list: palletBoxData.boxesList, sample_size: palletBoxData.sampleSize,
                nqa_profile_id: nqaProfileId || null, nqa_profile_name: profileObj?.name ?? null,
                aql_critical: nqaConfig.aql_critical, aql_major: nqaConfig.aql_major, aql_minor: nqaConfig.aql_minor,
                inspection_level: nqaConfig.inspection_level, defects_critical: palletDefects.critical,
                defects_major: palletDefects.major, defects_minor: palletDefects.minor, defects_detail: palletDefectsDetail,
                result: palletResult, observations: palletObs.trim() || null, created_by_user_id: profile?.user_id ?? null,
            }]).select('id').single();
            if (error) throw error;
            await supabase.from('shift_logs').insert([{ type: 'alert', content: `🏷️ Pallet #${nextNum} — OP ${selectedOrder.op} ${palletResult === 'APPROVED' ? 'APROVADO ✅' : palletResult === 'REJECTED' ? 'REPROVADO ❌' : 'com RESTRIÇÃO ⚠️'}. Analista: ${analystObj?.name ?? '—'}.`, created_by_user_id: profile?.user_id ?? null }]);
            setCompletedPalletId(saved.id);
            showToast(`Pallet #${nextNum} registrado!`, 'success');
            setPalletDefects({ critical: 0, major: 0, minor: 0 });
            setPalletDefectsDetail({ ...EMPTY_DEFECTS });
            setPalletObs(''); setPalletResult('APPROVED');
            // Recarrega lista
            const { data: fresh } = await supabase.from('pallet_inspections')
                .select('id,pallet_number,result,defects_critical,defects_major,defects_minor,created_at,analyst_name')
                .eq('op', selectedOrder.op.toUpperCase()).order('pallet_number');
            setSavedPallets(fresh || []);
        } catch (err: any) { showToast(`Erro ao salvar pallet: ${err.message}`, 'error'); }
        finally { setIsSavingPallet(false); }
    };

    // ─── Salvar análise final ──────────────────────────────────────────────
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrderId) { showToast('Selecione uma OP cadastrada', 'warning'); return; }
        if (!selectedMachineId) { showToast('Selecione a máquina', 'warning'); return; }
        if (selectedOperatorIds.length === 0) { showToast('Adicione ao menos um operador', 'warning'); return; }
        if (selectedAnalystIds.length === 0)  { showToast('Adicione ao menos um analista', 'warning'); return; }
        if (!laudoNumero) { showToast('Informe o Nº do Laudo', 'warning'); return; }
        const selectedOrder = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase()) || null;
        if (!selectedOrder?.id || Number(selectedOrder.qtd_total) <= 0) { showToast('OP inválida ou sem quantidade total', 'error'); return; }
        setIsSaving(true);
        try {
            const operatorNames = selectedOperatorIds.map(id => operators.find(o => o.id === id)?.name ?? id).join(', ');
            const analystNames  = selectedAnalystIds.map(id => analysts.find(a => a.id === id)?.name ?? id).join(', ');
            const effectiveDestino = destinoFinal || autoDestino;
            const effectiveStatus  = status;
            await supabase.from('inspections').insert([{
                op: selectedOrder.op, order_id: selectedOrder.id,
                machine_id: selectedMachineId, operator_id: selectedOperatorIds[0], analyst_id: selectedAnalystIds[0],
                status: effectiveStatus, samples_count: 0,
                created_at: new Date().toISOString(), created_by_user_id: profile?.user_id ?? null,
                observations: JSON.stringify({
                    is_spreadsheet_analysis: true,
                    process_type: ProcessType.ACABAMENTO,
                    process_area: 'produto_acabado',
                    laudo_numero: laudoNumero,
                    status: effectiveStatus,
                    observacoes: observacoes.trim(),
                    defects: { ...EMPTY_DEFECTS },
                    producao: { qty_produzida: qtyProduzida, qty_escolha: qtyEscolha, qty_refugo: qtyRefugo },
                    all_operator_ids: selectedOperatorIds,
                    all_analyst_ids:  selectedAnalystIds,
                    operator_names: operatorNames,
                    analyst_names:  analystNames,
                    month: MONTHS[selectedMonth],
                    year: selectedYear,
                    nqa_config: nqaConfig,
                    nqa_profile_id: nqaProfileId || null,
                    destino_final: effectiveDestino,
                    total_pallets: savedPallets.length,
                    pallets_aprovados:  savedPallets.filter(p => p.result === 'APPROVED').length,
                    pallets_restritos:  savedPallets.filter(p => p.result === 'RESTRICTED').length,
                    pallets_reprovados: savedPallets.filter(p => p.result === 'REJECTED').length,
                }),
            }]);
            showToast('Análise salva com sucesso!', 'success');
            clearForm(); fetchData();
        } catch (err: any) { showToast(`Erro ao salvar: ${err.message}`, 'error'); }
        finally { setIsSaving(false); }
    };

    // ─── Validação por etapa ──────────────────────────────────────────────
    const validateStep = (step: number) => {
        if (step === 1 && !selectedOrderId)              return 'Selecione uma OP cadastrada.';
        if (step === 1 && selectedOperatorIds.length === 0) return 'Adicione ao menos um operador.';
        if (step === 1 && selectedAnalystIds.length === 0)  return 'Adicione ao menos um analista.';
        if (step === 1 && !selectedMachineId)            return 'Selecione a máquina.';
        if (step === 1 && !laudoNumero.trim())           return 'Informe o número do laudo.';
        if (step === 1 && nqaConfig.unidades_por_caixa <= 0) return 'Informe unidades por caixa.';
        if (step === 1 && nqaConfig.caixas_por_pallet <= 0)  return 'Informe caixas por pallet.';
        return null;
    };

    const goToStep = (target: number) => {
        if (target <= activeStep) { setActiveStep(target); return; }
        for (let step = 1; step < target; step++) {
            const msg = validateStep(step);
            if (msg) { showToast(msg, 'warning'); setActiveStep(step); return; }
        }
        setActiveStep(target);
    };

    const clearForm = () => {
        localStorage.removeItem(SESSION_KEY);
        setSelectedOrderId(''); setOrderFilter('');
        setSelectedOperatorIds([]); setSelectedAnalystIds([]); setLaudoNumero('');
        setObservacoes(''); setQtyProduzida(0); setQtyEscolha(0); setQtyRefugo(0);
        setPalletDefects({ critical: 0, major: 0, minor: 0 }); setPalletDefectsDetail({ ...EMPTY_DEFECTS });
        setPalletObs(''); setPalletResult('APPROVED'); setSavedPallets([]); setDestinoFinal('');
        setActiveStep(1);
    };

    // ─── Helpers visuais ─────────────────────────────────────────────────
    const fmt = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
    const filteredOrders = orders.filter(o => {
        const term = orderFilter.trim().toLowerCase();
        if (!term) return o.status === 'em_producao' || o.fromInitialInspection;
        return String(o.op || '').toLowerCase().includes(term);
    });
    const selectedOrder  = orders.find(o => o.op.toUpperCase() === selectedOrderId.toUpperCase()) || null;
    const selectedMachine = machines.find(m => m.id === selectedMachineId);
    const operatorNamesDisplay = selectedOperatorIds.map(id => operators.find(o => o.id === id)?.name ?? id).join(', ');
    const analystNamesDisplay  = selectedAnalystIds.map(id => analysts.find(a => a.id === id)?.name ?? id).join(', ');

    const RESULT_META = {
        APPROVED:   { label: 'Aprovado',   icon: 'check_circle', color: 'emerald', dot: 'bg-emerald-500' },
        RESTRICTED: { label: 'Restrição',  icon: 'warning',      color: 'amber',   dot: 'bg-amber-500'  },
        REJECTED:   { label: 'Reprovado',  icon: 'cancel',       color: 'rose',    dot: 'bg-rose-500'   },
    } as const;

    if (isLoading) return (
        <div className="flex items-center justify-center h-64">
            <span className="material-symbols-outlined animate-spin text-3xl text-slate-400">progress_activity</span>
        </div>
    );

    // ─── Render ───────────────────────────────────────────────────────────
    return (
        <div className="h-screen overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950">

            {/* Header */}
            <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 md:px-6 py-4 z-30">
                <div className="max-w-5xl mx-auto space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Produto Acabado</p>
                            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">{FINISHING_STEPS[activeStep - 1]?.label}</h1>
                        </div>
                        <div className="hidden sm:flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {selectedOrderId && <span className="text-indigo-600">OP: {selectedOrderId}</span>}
                            {savedPallets.length > 0 && <span className="text-slate-500">{savedPallets.length} pallet{savedPallets.length > 1 ? 's' : ''}</span>}
                            {savedPallets.some(p => p.result === 'REJECTED') && <span className="text-rose-500">Pallets reprovados</span>}
                        </div>
                    </div>
                    <nav className="flex gap-2 overflow-x-auto pb-1">
                        {FINISHING_STEPS.map(step => {
                            const done = step.id < activeStep && !validateStep(step.id);
                            const active = step.id === activeStep;
                            return (
                                <button key={step.id} type="button" onClick={() => goToStep(step.id)}
                                    className={`shrink-0 h-10 px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                                        active ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                        : done  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300'
                                        : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                    }`}>
                                    <span className={`size-5 rounded-full flex items-center justify-center text-xs font-black ${active ? 'bg-white/20' : done ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-white dark:bg-slate-900'}`}>
                                        {done ? <span className="material-symbols-outlined text-xs">check</span> : step.id}
                                    </span>
                                    {step.short}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </header>

            <form onSubmit={handleSave} id="finishing-form" className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-5xl mx-auto w-full pb-28">

                {/* ══════════════════════════════════════════════════════════
                    ETAPA 1 — Identificação
                ══════════════════════════════════════════════════════════ */}
                {activeStep === 1 && <>

                    {/* OP */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <span className="flex items-center justify-center size-7 rounded-full bg-indigo-600 text-white text-xs font-black">OP</span>
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Ordem de Produção</h2>
                                <p className="text-[10px] text-slate-400 font-bold">Selecione a OP a ser analisada</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-3">
                            <input value={orderFilter} onChange={e => setOrderFilter(e.target.value)}
                                className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs"
                                placeholder="Filtrar OP..." />
                            <select value={selectedOrderId} onChange={e => { setSelectedOrderId(e.target.value); }}
                                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-sm">
                                <option value="">Selecionar OP...</option>
                                {filteredOrders.map(o => <option key={`${o.id}:${o.op}`} value={o.op}>{o.op}{o.qtd_total ? ` — ${fmt(Number(o.qtd_total))} un.` : ''}</option>)}
                            </select>
                            {rodadas.length > 0 && (
                                <button type="button" onClick={() => setShowRodadas(v => !v)}
                                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 transition-colors">
                                    <span className="material-symbols-outlined text-sm">history</span>
                                    {rodadas.length} rodada{rodadas.length > 1 ? 's' : ''} de impressão nesta OP
                                    <span className="material-symbols-outlined text-xs">{showRodadas ? 'expand_less' : 'expand_more'}</span>
                                </button>
                            )}
                            {showRodadas && rodadas.length > 0 && (
                                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                                    <table className="w-full min-w-[480px] text-xs">
                                        <thead><tr className="border-b border-slate-100 dark:border-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                                            <th className="px-4 py-2">Rod.</th><th className="px-4 py-2">Data</th><th className="px-4 py-2">Status</th>
                                            <th className="px-4 py-2 text-right text-emerald-600">Aprov.</th><th className="px-4 py-2 text-right text-amber-600">Escolha</th><th className="px-4 py-2 text-right text-rose-600">Reprov.</th>
                                        </tr></thead>
                                        <tbody>
                                            {rodadas.map(r => { const m = RESULT_META[r.status] ?? RESULT_META.APPROVED; return (
                                                <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800 last:border-0 font-bold text-slate-700 dark:text-slate-200">
                                                    <td className="px-4 py-2 font-black">{r.numero}ª</td>
                                                    <td className="px-4 py-2 text-slate-500">{new Date(r.date).toLocaleDateString('pt-BR')}</td>
                                                    <td className="px-4 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase bg-${m.color}-100 text-${m.color}-700`}><span className={`size-1.5 rounded-full ${m.dot}`}/>{m.label}</span></td>
                                                    <td className="px-4 py-2 text-right text-emerald-600">{fmt(r.aprovadas)}</td>
                                                    <td className="px-4 py-2 text-right text-amber-600">{fmt(r.em_escolha)}</td>
                                                    <td className="px-4 py-2 text-right text-rose-600">{fmt(r.reprovadas)}</td>
                                                </tr>
                                            ); })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Equipe */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <span className="material-symbols-outlined text-indigo-500">group</span>
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Equipe</h2>
                        </div>
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Operadores */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs text-indigo-500">engineering</span>
                                    Operadores <span className="text-rose-400">*</span>
                                </label>
                                {selectedOperatorIds.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                        {selectedOperatorIds.map(id => { const op = operators.find(o => o.id === id); return <PersonChip key={id} name={op?.name ?? id} onRemove={() => removeOperator(id)} />; })}
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
                                    <span className="material-symbols-outlined text-xs text-indigo-500">person_search</span>
                                    Analistas <span className="text-rose-400">*</span>
                                </label>
                                {selectedAnalystIds.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                        {selectedAnalystIds.map(id => { const an = analysts.find(a => a.id === id); return <PersonChip key={id} name={an?.name ?? id} onRemove={() => removeAnalyst(id)} />; })}
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

                    {/* Dados do Laudo */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <span className="material-symbols-outlined text-indigo-500">assignment</span>
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Dados do Laudo</h2>
                        </div>
                        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
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
                                    className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-black text-indigo-600 text-sm"
                                    placeholder="00000/25" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Mês</label>
                                <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
                                    className="w-full h-11 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs">
                                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Ano</label>
                                <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
                                    className="w-full h-11 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-bold text-xs">
                                    {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Config NQA + Embalagem */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <span className="material-symbols-outlined text-indigo-500">rule</span>
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Configuração NQA — NBR 5426</h2>
                                <p className="text-[10px] text-slate-400 font-bold">Embalagem + Plano de amostragem por pallet</p>
                            </div>
                        </div>
                        <div className="p-5 space-y-4">
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
                                {([
                                    { label: 'AQL Crítico', key: 'aql_critical' as const, cls: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-700' },
                                    { label: 'AQL Maior',   key: 'aql_major'    as const, cls: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700' },
                                    { label: 'AQL Menor',   key: 'aql_minor'    as const, cls: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700' },
                                ] as const).map(f => (
                                    <div key={f.key} className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">{f.label}</label>
                                        <select value={nqaConfig[f.key]} onChange={e => { setNqaProfileId(''); setNqaConfig(p => ({ ...p, [f.key]: e.target.value })); }}
                                            className={`w-full h-9 px-3 rounded-xl border outline-none text-sm font-black ${f.cls}`}>
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
                            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Unid. por Caixa <span className="text-rose-400">*</span></label>
                                    <input type="number" min={1} value={nqaConfig.unidades_por_caixa || ''} onChange={e => setNqaConfig(p => ({ ...p, unidades_por_caixa: Math.max(1, Number(e.target.value) || 0) }))}
                                        className="w-full h-11 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none font-black text-sm text-center" placeholder="ex: 100" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Caixas por Pallet <span className="text-rose-400">*</span></label>
                                    <input type="number" min={1} value={nqaConfig.caixas_por_pallet || ''} onChange={e => setNqaConfig(p => ({ ...p, caixas_por_pallet: Math.max(1, Number(e.target.value) || 0) }))}
                                        className="w-full h-11 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none font-black text-sm text-center" placeholder="ex: 40" />
                                </div>
                            </div>
                            {/* Resumo calculado */}
                            {palletLotSize > 0 && palletSamplingPlan && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Unid. / Pallet',   value: fmt(palletLotSize),                              icon: 'view_in_ar', color: 'indigo' },
                                        { label: 'Caixas a abrir',   value: `${palletBoxData.boxesToInspect} cx.`,           icon: 'open_in_new', color: 'amber' },
                                        { label: 'Amostra',          value: `${palletBoxData.sampleSize} un.`,               icon: 'rule',       color: 'slate' },
                                        { label: 'Unid./caixa insp.',value: `${palletBoxData.unitsPerBox} un.`,              icon: 'search',     color: 'emerald' },
                                    ].map(({ label, value, icon, color }) => (
                                        <div key={label} className={`flex items-center gap-3 p-3 rounded-2xl border ${
                                            color === 'indigo'  ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                                            : color === 'amber' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                                            : color === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                        }`}>
                                            <span className={`material-symbols-outlined text-sm ${color === 'indigo' ? 'text-indigo-500' : color === 'amber' ? 'text-amber-500' : color === 'emerald' ? 'text-emerald-500' : 'text-slate-400'}`}>{icon}</span>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                                <p className={`text-sm font-black ${color === 'indigo' ? 'text-indigo-700 dark:text-indigo-300' : color === 'amber' ? 'text-amber-700 dark:text-amber-300' : color === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>{value}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>}

                {/* ══════════════════════════════════════════════════════════
                    ETAPA 2 — Inspeção de Pallets
                ══════════════════════════════════════════════════════════ */}
                {activeStep === 2 && <>

                    {/* ── Tracker visual de andamento dos pallets ── */}
                    {(() => {
                        const totalEsperado = palletLotSize > 0 && qtyProduzida > 0
                            ? Math.ceil(qtyProduzida / palletLotSize) : null;
                        const currentNum = savedPallets.length + 1;
                        const total = Math.max(totalEsperado ?? currentNum, currentNum);
                        const nums = Array.from({ length: total }, (_, i) => i + 1);
                        return (
                            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-indigo-500 text-base">grid_view</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                                            Pallet {savedPallets.length} de {totalEsperado ?? '?'} concluído{savedPallets.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    {totalEsperado && palletLotSize > 0 && (
                                        <span className="text-[10px] font-bold text-slate-400">
                                            {fmt(qtyProduzida)} un. ÷ {fmt(palletLotSize)} un/pallet = {totalEsperado} pallets estimados
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {nums.map(num => {
                                        const saved = savedPallets.find(p => p.pallet_number === num);
                                        const isCurrent = num === currentNum;
                                        let cls = '';
                                        let icon = '';
                                        let label = '';
                                        if (saved) {
                                            if (saved.result === 'APPROVED')   { cls = 'bg-emerald-500 border-emerald-500 text-white'; icon = 'check'; }
                                            else if (saved.result === 'RESTRICTED') { cls = 'bg-amber-400 border-amber-400 text-white'; icon = 'warning'; }
                                            else                               { cls = 'bg-rose-500 border-rose-500 text-white'; icon = 'close'; }
                                        } else if (isCurrent) {
                                            cls = 'bg-indigo-600 border-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-700 ring-offset-1';
                                            label = 'atual';
                                        } else {
                                            cls = 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400';
                                        }
                                        return (
                                            <div key={num} title={saved ? `Pallet ${num}: ${saved.result === 'APPROVED' ? 'Aprovado' : saved.result === 'RESTRICTED' ? 'Restrição' : 'Reprovado'}` : isCurrent ? `Pallet ${num}: em andamento` : `Pallet ${num}: pendente`}
                                                className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl border-2 transition-all select-none ${cls}`}
                                            >
                                                <span className="text-[10px] font-black leading-none">#{num}</span>
                                                {icon  && <span className="material-symbols-outlined text-[13px] leading-none mt-0.5">{icon}</span>}
                                                {label && <span className="text-[7px] font-black leading-none mt-0.5 opacity-80">{label}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex flex-wrap items-center gap-4 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                                    {[
                                        { color: 'bg-emerald-500', label: 'Aprovado' },
                                        { color: 'bg-amber-400',   label: 'Restrição' },
                                        { color: 'bg-rose-500',    label: 'Reprovado' },
                                        { color: 'bg-indigo-600',  label: 'Em andamento' },
                                        { color: 'bg-slate-200 dark:bg-slate-700', label: 'Pendente' },
                                    ].map(({ color, label }) => (
                                        <div key={label} className="flex items-center gap-1.5">
                                            <div className={`size-2.5 rounded-sm ${color}`} />
                                            <span className="text-[9px] font-bold text-slate-400">{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Lista de pallets concluídos */}
                    {(loadingSavedPallets || savedPallets.length > 0) && (
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-indigo-500">stacks</span>
                                    <div>
                                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Pallets Registrados</h2>
                                        <p className="text-[10px] text-slate-400 font-bold">OP {selectedOrderId}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase">
                                    <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{savedPallets.filter(p => p.result === 'APPROVED').length} ✓</span>
                                    {savedPallets.filter(p => p.result === 'RESTRICTED').length > 0 && <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{savedPallets.filter(p => p.result === 'RESTRICTED').length} ⚠</span>}
                                    {savedPallets.filter(p => p.result === 'REJECTED').length > 0 && <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{savedPallets.filter(p => p.result === 'REJECTED').length} ✗</span>}
                                </div>
                            </div>
                            <div className="p-4">
                                {loadingSavedPallets ? (
                                    <div className="flex items-center justify-center py-6"><span className="material-symbols-outlined animate-spin text-slate-400">progress_activity</span></div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                                        {savedPallets.map(p => {
                                            const m = RESULT_META[p.result] ?? RESULT_META.APPROVED;
                                            return (
                                                <Link key={p.id} to={`/pallet/${p.id}`}
                                                    className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all hover:shadow-md ${
                                                        p.result === 'APPROVED'   ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
                                                        : p.result === 'REJECTED' ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20'
                                                        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
                                                    }`}>
                                                    <span className={`material-symbols-outlined text-xl ${p.result === 'APPROVED' ? 'text-emerald-500' : p.result === 'REJECTED' ? 'text-rose-500' : 'text-amber-500'}`}>{m.icon}</span>
                                                    <span className="text-xs font-black text-slate-700 dark:text-slate-200">#{p.pallet_number}</span>
                                                    <span className={`text-[9px] font-black uppercase ${p.result === 'APPROVED' ? 'text-emerald-600' : p.result === 'REJECTED' ? 'text-rose-600' : 'text-amber-600'}`}>{m.label}</span>
                                                    {(p.defects_critical > 0 || p.defects_major > 0) && (
                                                        <span className="text-[9px] text-rose-500 font-bold">C:{p.defects_critical} M:{p.defects_major}</span>
                                                    )}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Formulário do próximo pallet */}
                    {nqaConfig.unidades_por_caixa <= 0 || nqaConfig.caixas_por_pallet <= 0 ? (
                        <div className="flex items-center gap-3 p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                            <span className="material-symbols-outlined text-amber-500 text-2xl">info</span>
                            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Volte à etapa 1 e configure <strong>unidades por caixa</strong> e <strong>caixas por pallet</strong>.</p>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-indigo-50 dark:bg-indigo-950/20">
                                <span className="flex items-center justify-center size-8 rounded-full bg-indigo-600 text-white text-sm font-black">#{savedPallets.length + 1}</span>
                                <div>
                                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Pallet {savedPallets.length + 1}</h2>
                                    <p className="text-[10px] text-slate-400 font-bold">Inspeção NQA — {fmt(palletLotSize)} unidades</p>
                                </div>
                                {palletNqaResult && (
                                    <span className={`ml-auto text-[10px] font-black uppercase px-3 py-1 rounded-full ${palletNqaResult.overall ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                        {palletNqaResult.overall ? 'NQA OK' : 'NQA NOK'}
                                    </span>
                                )}
                            </div>

                            <div className="p-5 space-y-5">
                                {/* Card instrução */}
                                {palletBoxData.unitsPerBox > 0 && (
                                    <div className="flex items-center gap-5 p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700">
                                        <span className="material-symbols-outlined text-5xl text-amber-500 shrink-0">search</span>
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">Inspecionar em cada caixa aberta</p>
                                            <p className="text-4xl font-black text-amber-800 dark:text-amber-200 leading-none">
                                                {palletBoxData.unitsPerBox} <span className="text-xl font-bold text-amber-600">unid./caixa</span>
                                            </p>
                                            <p className="text-xs font-bold text-amber-600 mt-0.5">
                                                Abrir {palletBoxData.boxesToInspect} cx. · {palletBoxData.sampleSize} amostras total
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Caixas a abrir */}
                                {palletBoxData.boxesList.length > 0 && (
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Caixas para abrir (sugestão)</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {palletBoxData.boxesList.map(n => <span key={n} className="px-2.5 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-lg">Cx {n}</span>)}
                                        </div>
                                    </div>
                                )}

                                {/* NQA defects */}
                                {palletSamplingPlan && (
                                    <div className="grid grid-cols-3 gap-3">
                                        {(['critical','major','minor'] as const).map(key => {
                                            const labels = { critical: 'Crítico', major: 'Maior', minor: 'Menor' };
                                            const plan = palletSamplingPlan[key];
                                            const found = palletDefects[key];
                                            const ok = found <= plan.ac;
                                            return (
                                                <div key={key} className={`p-4 rounded-2xl border-2 space-y-2 ${ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30'}`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${key === 'critical' ? 'text-rose-600' : key === 'major' ? 'text-amber-600' : 'text-slate-500'}`}>{labels[key]}</span>
                                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{ok ? 'OK' : 'NOK'}</span>
                                                    </div>
                                                    <p className="text-center text-[9px] text-slate-400">Ac≤{plan.ac} Re≥{plan.re}</p>
                                                    <div className="flex items-center gap-1.5">
                                                        <button type="button" onClick={() => setPalletDefects(p => ({ ...p, [key]: Math.max(0, p[key]-1) }))} className="size-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500"><span className="material-symbols-outlined text-sm">remove</span></button>
                                                        <input type="number" min={0} value={found} onChange={e => setPalletDefects(p => ({ ...p, [key]: Math.max(0, Number(e.target.value)||0) }))} className={`flex-1 h-8 text-center font-black text-sm rounded-lg border outline-none ${ok ? 'border-emerald-200 bg-white dark:bg-slate-900' : 'border-rose-300 bg-rose-50 dark:bg-rose-950/30'}`} />
                                                        <button type="button" onClick={() => setPalletDefects(p => ({ ...p, [key]: p[key]+1 }))} className="size-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-500"><span className="material-symbols-outlined text-sm">add</span></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Defeitos por tipo */}
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">emergency_home</span>Defeitos por tipo
                                    </p>
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

                                {/* Resultado + observações */}
                                <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Resultado do Pallet</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['APPROVED','RESTRICTED','REJECTED'] as const).map(id => {
                                                const m = RESULT_META[id];
                                                return (
                                                    <button key={id} type="button" onClick={() => setPalletResult(id)}
                                                        className={`h-14 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 text-[9px] font-black uppercase tracking-widest transition-all ${palletResult === id
                                                            ? `border-${m.color}-500 bg-${m.color}-50 text-${m.color}-700 dark:bg-${m.color}-500/10`
                                                            : 'border-slate-200 text-slate-400 dark:border-slate-700 hover:border-slate-300'}`}>
                                                        <span className="material-symbols-outlined text-base">{m.icon}</span>{m.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Observações</p>
                                        <textarea value={palletObs} onChange={e => setPalletObs(e.target.value)} rows={3}
                                            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-indigo-500/20"
                                            placeholder="Deformações, problemas de embalagem, etc." />
                                    </div>
                                </div>

                                {/* Botão registrar pallet */}
                                <button type="button" onClick={handleSavePallet} disabled={isSavingPallet || !selectedOrderId}
                                    className="w-full h-12 rounded-2xl bg-indigo-600 text-white font-black text-[11px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50">
                                    {isSavingPallet
                                        ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                        : <span className="material-symbols-outlined text-sm">add_task</span>}
                                    Registrar Pallet #{savedPallets.length + 1} e Gerar QR
                                </button>
                            </div>
                        </div>
                    )}
                </>}

                {/* ══════════════════════════════════════════════════════════
                    ETAPA 3 — Conclusão
                ══════════════════════════════════════════════════════════ */}
                {activeStep === 3 && <>

                    {/* Resumo dos pallets */}
                    {savedPallets.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                <span className="material-symbols-outlined text-indigo-500">stacks</span>
                                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Resultado dos Pallets</h2>
                            </div>
                            <div className="p-5 grid grid-cols-3 gap-3">
                                {[
                                    { label: 'Aprovados',   count: savedPallets.filter(p => p.result === 'APPROVED').length,   color: 'emerald', icon: 'check_circle' },
                                    { label: 'Com Restrição', count: savedPallets.filter(p => p.result === 'RESTRICTED').length, color: 'amber',   icon: 'warning' },
                                    { label: 'Reprovados',  count: savedPallets.filter(p => p.result === 'REJECTED').length,   color: 'rose',    icon: 'cancel' },
                                ].map(({ label, count, color, icon }) => (
                                    <div key={label} className={`flex flex-col items-center gap-1 p-4 rounded-2xl border ${
                                        count > 0
                                            ? `border-${color}-200 bg-${color}-50 dark:border-${color}-800 dark:bg-${color}-950/20`
                                            : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                                    }`}>
                                        <span className={`material-symbols-outlined text-2xl ${count > 0 ? `text-${color}-500` : 'text-slate-300'}`}>{icon}</span>
                                        <span className={`text-3xl font-black ${count > 0 ? `text-${color}-700 dark:text-${color}-300` : 'text-slate-300'}`}>{count}</span>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Quantidades */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <span className="material-symbols-outlined text-indigo-500">inventory_2</span>
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Quantidades do Lote</h2>
                        </div>
                        <div className="p-5 grid grid-cols-3 gap-4">
                            {[
                                { label: 'Qtd. Produzida', value: qtyProduzida, set: setQtyProduzida, color: 'slate',  icon: 'inventory_2' },
                                { label: 'Em Escolha',     value: qtyEscolha,   set: setQtyEscolha,   color: 'amber',  icon: 'rule' },
                                { label: 'Refugo',         value: qtyRefugo,    set: setQtyRefugo,    color: 'rose',   icon: 'delete_sweep' },
                            ].map(({ label, value, set, color, icon }) => (
                                <div key={label} className={`space-y-1 p-3 rounded-2xl border ${color === 'rose' ? 'border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900' : color === 'amber' ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900' : 'border-slate-200 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700'}`}>
                                    <label className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${color === 'rose' ? 'text-rose-500' : color === 'amber' ? 'text-amber-500' : 'text-slate-400'}`}>
                                        <span className="material-symbols-outlined text-xs">{icon}</span>{label}
                                    </label>
                                    <input type="number" min={0} value={value || ''} onChange={e => set(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0"
                                        className={`w-full h-10 px-3 rounded-xl border outline-none font-black text-lg text-center ${color === 'rose' ? 'border-rose-200 bg-white dark:bg-slate-900 text-rose-700' : color === 'amber' ? 'border-amber-200 bg-white dark:bg-slate-900 text-amber-700' : 'border-slate-200 bg-white dark:bg-slate-900 text-slate-700'}`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Destino final */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <span className="material-symbols-outlined text-indigo-500">fork_right</span>
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Destino Final</h2>
                                <p className="text-[10px] text-slate-400 font-bold">Encaminhamento do lote após análise</p>
                            </div>
                            {autoDestino && <span className="ml-auto text-[9px] font-black uppercase px-2 py-1 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">Sugestão automática</span>}
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-4">
                            {[
                                { id: 'expedicao',     label: 'Expedição',      icon: 'local_shipping', desc: 'Lote aprovado — enviar ao cliente', color: 'emerald' },
                                { id: 'revisao_final', label: 'Revisão Final',  icon: 'manage_search',  desc: 'Pallets reprovados — separar defeituosos', color: 'rose'    },
                            ].map(({ id, label, icon, desc, color }) => (
                                <button key={id} type="button" onClick={() => setDestinoFinal(id as any)}
                                    className={`flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all text-center ${destinoFinal === id
                                        ? `border-${color}-400 bg-${color}-50 dark:border-${color}-700 dark:bg-${color}-950/20`
                                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                                    <span className={`material-symbols-outlined text-3xl ${destinoFinal === id ? `text-${color}-500` : 'text-slate-400'}`}>{icon}</span>
                                    <span className={`text-sm font-black uppercase tracking-widest ${destinoFinal === id ? `text-${color}-700 dark:text-${color}-300` : 'text-slate-500'}`}>{label}</span>
                                    <span className="text-[10px] text-slate-400 font-medium">{desc}</span>
                                </button>
                            ))}
                        </div>
                        {/* Status geral */}
                        <div className="px-5 pb-5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Status geral do lote</p>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    [InspectionStatus.APPROVED,   'Aprovado',  'check_circle', 'emerald'],
                                    [InspectionStatus.RESTRICTED, 'Restrição', 'warning',      'amber'  ],
                                    [InspectionStatus.REJECTED,   'Reprovado', 'cancel',       'rose'   ],
                                ] as const).map(([id, label, icon, color]) => (
                                    <button key={id} type="button" onClick={() => setStatus(id)}
                                        className={`h-12 rounded-xl border-2 flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${status === id
                                            ? `border-${color}-400 bg-${color}-50 text-${color}-700 dark:bg-${color}-500/10 dark:border-${color}-700`
                                            : 'border-slate-200 text-slate-400 dark:border-slate-700'}`}>
                                        <span className="material-symbols-outlined text-sm">{icon}</span>{label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Observações + Resumo */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <span className="material-symbols-outlined text-indigo-500">summarize</span>
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Resumo Final</h2>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {[
                                    ['OP', selectedOrderId || '-'],
                                    ['Laudo', laudoNumero || '-'],
                                    ['Máquina', selectedMachine?.name || '-'],
                                    ['Operadores', operatorNamesDisplay || '-'],
                                    ['Analistas', analystNamesDisplay || '-'],
                                    ['Total Pallets', String(savedPallets.length)],
                                ].map(([label, value]) => (
                                    <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                        <p className="mt-0.5 text-sm font-black text-slate-800 dark:text-slate-100 truncate">{value}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Observações gerais</label>
                                <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3}
                                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-indigo-500/20"
                                    placeholder="Observações gerais sobre o lote..." />
                            </div>
                        </div>
                    </div>
                </>}

                {/* ── Modal QR pallet ──────────────────────────────────── */}
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
                                <button onClick={() => window.print()} className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 font-black text-[10px] uppercase tracking-widest text-slate-500 flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-all">
                                    <span className="material-symbols-outlined text-sm">print</span>Imprimir
                                </button>
                                <Link to={`/pallet/${completedPalletId}`} onClick={() => setCompletedPalletId(null)}
                                    className="h-10 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-indigo-700 transition-all">
                                    <span className="material-symbols-outlined text-sm">open_in_new</span>Ver Auditoria
                                </Link>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </form>

            {/* Footer */}
            <footer className="shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 px-4 md:px-8 py-3 z-40">
                <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest flex-wrap">
                    {selectedOrderId && <span className="text-indigo-600">OP: {selectedOrderId}</span>}
                    {savedPallets.length > 0 && <span>{savedPallets.length} pallet{savedPallets.length > 1 ? 's' : ''}</span>}
                    {savedPallets.some(p => p.result === 'REJECTED') && <span className="text-rose-500">Pallets reprovados</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <button type="button" onClick={clearForm}
                        className="h-10 px-5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                        Limpar
                    </button>
                    {activeStep > 1 && (
                        <button type="button" onClick={() => setActiveStep(s => Math.max(1, s - 1))}
                            className="h-10 px-5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                            Voltar
                        </button>
                    )}
                    {activeStep < 3 ? (
                        <button type="button" onClick={() => goToStep(activeStep + 1)}
                            className="h-10 px-8 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2">
                            Próximo
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                    ) : (
                        <button type="submit" form="finishing-form" disabled={isSaving}
                            className="h-10 px-8 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50">
                            {isSaving ? <span className="material-symbols-outlined animate-spin text-sm">refresh</span> : <span className="material-symbols-outlined text-sm">add_task</span>}
                            Salvar Análise
                        </button>
                    )}
                </div>
            </footer>
        </div>
    );
}
