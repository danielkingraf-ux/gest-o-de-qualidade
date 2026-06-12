import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';
import DefectPhotoUpload from '../components/DefectPhotoUpload';
import EscolhaMotivoInput from '../components/EscolhaMotivoInput';
import { defectPhotoService, type PendingPhoto } from '../services/defectPhotoService';
import { escolhaProblemasService } from '../services/escolhaProblemasService';
import { dedupInspections, parseObsSafe } from '../utils/inspectionDedup';

// ── Types ─────────────────────────────────────────────────────────────────────
type OperatorOption = { id: string; name: string };
type MachineOption  = { id: string; name: string; code: string };
type OrderInfo = { op: string; qtd_total: number; status: string };

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFECTS = [
  { key: 'fundo_virado',     label: 'Fundo Virado',     icon: 'rotate_90_degrees_cw'  },
  { key: 'falta_cola',       label: 'Falta de Cola',    icon: 'water_drop'            },
  { key: 'cola_fraca',       label: 'Cola Fraca',       icon: 'opacity'               },
  { key: 'queimado_correia', label: 'Queimado Correia', icon: 'local_fire_department' },
  { key: 'rasgado',          label: 'Rasgado',          icon: 'block'                 },
  { key: 'modelo_misturado', label: 'Modelo Misturado', icon: 'shuffle'               },
  { key: 'outros',           label: 'Outros',           icon: 'more_horiz'            },
];

const getShift = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Manha';
  if (hour >= 14 && hour < 22) return 'Tarde';
  return 'Noite';
};

// ── Qty stepper ───────────────────────────────────────────────────────────────
const QtyCard: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  colorClass: string;
}> = ({ label, value, onChange, colorClass }) => (
  <div className={`flex flex-col gap-1 p-3 rounded-xl border ${colorClass}`}>
    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</span>
    <div className="flex items-center gap-1.5 mt-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="size-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs"
      >-</button>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="flex-1 h-8 bg-transparent text-center font-black text-sm outline-none min-w-0"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="size-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 text-xs"
      >+</button>
    </div>
  </div>
);

// ── Main View ─────────────────────────────────────────────────────────────────
const AcabamentoColagemView: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useUser();

  const [op, setOp]                                 = useState('');
  const [opList, setOpList]                         = useState<string[]>([]);
  const [opFound, setOpFound]                       = useState<boolean | null>(null);
  const [opInfo, setOpInfo]                         = useState<OrderInfo | null>(null);

  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [selectedMachineId, setSelectedMachineId]     = useState('');
  const [operators, setOperators]                     = useState<OperatorOption[]>([]);
  const [machines, setMachines]                       = useState<MachineOption[]>([]);

  const [qtyRodadas, setQtyRodadas]       = useState(0);
  const [qtyEscolha, setQtyEscolha]       = useState(0);
  // Escolha acumulada recebida (impressão + vinco) — informativo, calculado do banco
  const [escolhaAcumulada, setEscolhaAcumulada] = useState(0);
  // Popup: "A escolha acumulada foi revisada antes de colar?"
  const [revisadaAntesColar, setRevisadaAntesColar] = useState<boolean | null>(null);
  const [qtyBoasRevisadas, setQtyBoasRevisadas]   = useState(0); // boas após revisão (entram no rodado)
  const [qtyRefugoRevisao, setQtyRefugoRevisao]   = useState(0); // refugo da revisão
  const [escolhaMotivo, setEscolhaMotivo]         = useState(''); // motivo/problema da escolha COLAGEM
  const [escolhaProblemas, setEscolhaProblemas]   = useState<string[]>([]); // sugestões (cadastro + fallback)
  const [qtyRefugo, setQtyRefugo]         = useState(0);
  const [selectedDefectKey, setSelectedDefectKey] = useState('');
  const [defectQty, setDefectQty]         = useState(0);
  const [notes, setNotes]                 = useState('');
  const [recordDate, setRecordDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift]                 = useState(getShift);

  const [saldoCorteVinco, setSaldoCorteVinco] = useState<number | null>(null);
  const [saving, setSaving]                   = useState(false);
  const [pendingPhotos, setPendingPhotos]     = useState<PendingPhoto[]>([]);

  // Carrega lista de OPs, operadores e máquinas de Colagem (produto_acabado ou ambos)
  useEffect(() => {
    supabase.from('orders').select('op').order('op').then(({ data }) => {
      if (data) setOpList(data.map((r: { op: string }) => r.op));
    });
    supabase.from('operators').select('id, name, area').eq('active', true)
      .in('area', ['produto_acabado', 'ambos']).order('name')
      .then(({ data }) => { if (data) setOperators(data as OperatorOption[]); });
    supabase.from('machines').select('id, name, code, area').eq('active', true)
      .in('area', ['produto_acabado', 'ambos']).order('name')
      .then(({ data }) => { if (data) setMachines(data as MachineOption[]); });
    escolhaProblemasService.listLabels('colagem').then(setEscolhaProblemas);
  }, []);

  // Saldo recebido do Corte e Vinco
  useEffect(() => {
    if (!op.trim()) { setOpFound(null); setOpInfo(null); setSaldoCorteVinco(null); return; }
    const opUpper = op.trim().toUpperCase();

    supabase.from('orders').select('op, qtd_total, status').eq('op', opUpper).maybeSingle()
      .then(({ data }) => {
        setOpFound(!!data);
        setOpInfo((data as OrderInfo | null) ?? null);
      });

    // Boas: as APROVADAS do Corte/Vinco. A ESCOLHA agora percorre as etapas:
    // escolha recebida na colagem = escolha da impressão + escolha gerada no vinco.
    Promise.all([
      supabase.from('acabamento_registros')
        .select('qty_aprovadas, qty_reprovadas')
        .eq('op', opUpper)
        .eq('modulo', 'corte_vinco'),
      supabase.from('acabamento_registros')
        .select('id, qty_revisadas, qty_reprovadas, qty_aprovadas, defects, operator_ids, machine_id, timestamp')
        .eq('op', opUpper)
        .eq('modulo', 'colagem')
        .order('timestamp', { ascending: true }),
      supabase.from('inspections')
        .select('observations, created_at')
        .eq('op', opUpper)
        .order('created_at', { ascending: false }),
    ]).then(([cvRes, colRes, inspRes]) => {
      const aprovadasCv = (cvRes.data ?? [])
        .reduce((s: number, r: { qty_aprovadas: number }) => s + (r.qty_aprovadas || 0), 0);
      const colRows = (colRes.data ?? []) as Array<{ qty_revisadas: number; defects: Record<string, unknown> | null }>;
      const jaProcessadoColagem = colRows.reduce((s, r) => s + (r.qty_revisadas || 0), 0);
      const dInt = (d: Record<string, unknown> | null, k: string) => Number(d?.[k]) || 0;
      // Escolha já resolvida em registros ANTERIORES de colagem desta OP:
      // as boas recuperadas voltaram pro fluxo (entraram no Rodado anterior)
      // e o refugo da revisão saiu definitivamente.
      const boasRevisadasAnt  = colRows.reduce((s, r) => s + dInt(r.defects, 'boas_revisadas'), 0);
      const refugoRevisaoAnt  = colRows.reduce((s, r) => s + dInt(r.defects, 'refugo_revisao'), 0);
      const baseDisponivel = aprovadasCv + boasRevisadasAnt;
      if (baseDisponivel > 0) {
        const liquido = Math.max(0, baseDisponivel - jaProcessadoColagem);
        setSaldoCorteVinco(liquido);
        setQtyRodadas(prev => prev === 0 ? liquido : prev);
      } else {
        setSaldoCorteVinco(null);
      }

      // ── Escolha acumulada (impressão + vinco) — exibição informativa ──
      // Parciais da mesma rodada SOMAM; só duplo-save idêntico é descartado.
      let escolhaImpressao = 0;
      const inspRows = dedupInspections((inspRes.data ?? []) as Array<{ observations: string; created_at: string }>, {
        getObs: row => parseObsSafe(row.observations),
        getCreatedAt: row => row.created_at,
      });
      for (const row of inspRows) {
        const obs = parseObsSafe(row.observations);
        if (obs.process_area === 'producao_inicial' && obs.saldo_unidades) {
          escolhaImpressao += Number(obs.saldo_unidades.em_escolha) || 0;
        }
      }
      const escolhaVinco = (cvRes.data ?? [])
        .reduce((s: number, r: { qty_reprovadas: number }) => s + (r.qty_reprovadas || 0), 0);
      // Escolha acumulada PENDENTE = gerada (impressão + vinco) − já resolvida
      // em registros anteriores de colagem (boas recuperadas + refugo da revisão).
      setEscolhaAcumulada(Math.max(0, escolhaImpressao + escolhaVinco - boasRevisadasAnt - refugoRevisaoAnt));

    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op]);

  const handleClear = () => {
    setOp('');
    setSelectedOperatorIds([]);
    setSelectedMachineId('');
    setQtyRodadas(0);
    setQtyEscolha(0);
    setEscolhaAcumulada(0);
    setRevisadaAntesColar(null);
    setQtyBoasRevisadas(0);
    setQtyRefugoRevisao(0);
    setEscolhaMotivo('');
    setQtyRefugo(0);
    setSelectedDefectKey('');
    setDefectQty(0);
    setNotes('');
    setRecordDate(new Date().toISOString().slice(0, 10));
    setShift(getShift());
    setOpFound(null);
    setOpInfo(null);
    setSaldoCorteVinco(null);
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setPendingPhotos([]);
  };

  const handleSave = async () => {
    if (!op.trim()) { showToast('Informe o número da OP', 'error'); return; }
    if (!selectedMachineId) { showToast('Selecione a máquina antes de registrar', 'error'); return; }
    if (selectedOperatorIds.length === 0) { showToast('Selecione ao menos um operador', 'error'); return; }
    if (qtyRodadas === 0) { showToast('Informe a quantidade rodada', 'error'); return; }
    if (!recordDate || !shift) { showToast('Informe data e turno', 'error'); return; }
    if (!selectedDefectKey && defectQty > 0) { showToast('Selecione o defeito encontrado', 'error'); return; }
    const disponivelParaRodar = (saldoCorteVinco ?? 0) + (revisadaAntesColar === true ? qtyBoasRevisadas : 0);
    if (saldoCorteVinco !== null && qtyRodadas > disponivelParaRodar) {
      showToast(`Quantidade rodada maior que o disponivel (saldo C/V + boas recuperadas). Disponivel: ${fmt(disponivelParaRodar)} un.`, 'error');
      return;
    }
    if (qtyEscolha + qtyRefugo > qtyRodadas) {
      showToast('Escolha + refugo nao pode ser maior que o rodado nesta etapa.', 'error');
      return;
    }
    if (qtyEscolha > 0 && !escolhaMotivo.trim()) {
      showToast('Informe o motivo da escolha gerada na colagem antes de salvar.', 'error');
      return;
    }
    if (escolhaAcumulada > 0 && revisadaAntesColar === null) {
      showToast('Informe se a escolha acumulada foi revisada antes de colar.', 'error');
      return;
    }
    if (revisadaAntesColar === true && (qtyBoasRevisadas + qtyRefugoRevisao) > escolhaAcumulada) {
      showToast('Boas revisadas + refugo da revisão não pode superar a escolha acumulada.', 'error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

    const defectsPayload: Record<string, number | string> = {};
    if (selectedDefectKey && defectQty > 0) defectsPayload[selectedDefectKey] = defectQty;
    // Refugo e motivo da escolha COLAGEM
    if (qtyRefugo > 0) defectsPayload['qty_refugo'] = qtyRefugo;
    if (escolhaMotivo.trim()) defectsPayload['escolha_motivo'] = escolhaMotivo.trim();
    // Revisão da escolha acumulada (impressão + vinco) antes de colar
    if (escolhaAcumulada > 0) {
      defectsPayload['escolha_acumulada_recebida'] = escolhaAcumulada;
      defectsPayload['escolha_revisada_antes_colar'] = revisadaAntesColar ? 1 : 0;
      if (revisadaAntesColar) {
        defectsPayload['boas_revisadas'] = qtyBoasRevisadas;
        defectsPayload['refugo_revisao'] = qtyRefugoRevisao;
        // A escolha não revisada segue à Revisão Final
        defectsPayload['escolha_para_revisao_final'] = Math.max(0, escolhaAcumulada - qtyBoasRevisadas - qtyRefugoRevisao);
      } else {
        // Toda a escolha acumulada vai à Revisão Final
        defectsPayload['escolha_para_revisao_final'] = escolhaAcumulada;
      }
    }

    setSaving(true);
    const { data: inserted, error } = await supabase.from('acabamento_registros').insert({
      op: op.trim().toUpperCase(),
      modulo: 'colagem',
      auxiliar_user_id: user.id,
      operator_ids: selectedOperatorIds,
      machine_id: selectedMachineId,
      qty_revisadas: qtyRodadas,
      qty_aprovadas: Math.max(0, qtyRodadas - qtyEscolha - qtyRefugo),
      qty_reprovadas: qtyEscolha,
      defects: Object.keys(defectsPayload).length > 0 ? defectsPayload : {},
      notes: [
        `Data: ${recordDate}`,
        `Turno: ${shift}`,
        notes.trim(),
      ].filter(Boolean).join('\n') || null,
    }).select('id').single();

    if (error) {
      setSaving(false);
      console.error('Erro ao salvar colagem:', error);
      showToast(error.message || 'Erro ao salvar registro', 'error');
      return;
    }

    // Upload de fotos de defeito (se houver)
    if (inserted && pendingPhotos.length > 0) {
      try {
        await defectPhotoService.uploadMany({
          recordId: inserted.id,
          recordTable: 'acabamento_registros',
          photos: pendingPhotos,
          userId: user.id,
        });
        pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview));
        setPendingPhotos([]);
      } catch (photoErr) {
        console.error('Erro ao enviar fotos:', photoErr);
        showToast('Registro salvo, mas houve erro ao enviar algumas fotos.', 'warning');
      }
    }

    setSaving(false);
    showToast('Registro de colagem salvo!', 'success');
    handleClear();
  };

  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const qtyAprovadas = Math.max(0, qtyRodadas - qtyEscolha - qtyRefugo);
  const saldoRecebido = saldoCorteVinco ?? 0;
  // Boas recuperadas AGORA (formulário atual) entram no disponível — elas são
  // material físico que volta pro fluxo e pode ser colado nesta rodada.
  const recuperadasAtuais = revisadaAntesColar === true ? qtyBoasRevisadas : 0;
  const disponivelTotal = saldoRecebido + recuperadasAtuais;
  const saldoExcedido = saldoCorteVinco !== null && qtyRodadas > disponivelTotal;
  const composicaoInvalida = qtyEscolha + qtyRefugo > qtyRodadas;
  const statusLabel = opInfo?.status ? opInfo.status.replace(/_/g, ' ') : opFound === false ? 'OP nao encontrada' : 'Em preenchimento';

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-16">
      <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-4">

        {/* ── Cabeçalho compacto ── */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-indigo-500">precision_manufacturing</span>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 leading-none">Processo</p>
              <h1 className="text-xl md:text-2xl font-black uppercase text-slate-900 dark:text-white leading-tight">Colagem</h1>
            </div>
            {(saldoExcedido || composicaoInvalida) && (
              <span className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 text-[9px] font-black uppercase tracking-widest">
                ⚠ {saldoExcedido ? 'Saldo excedido' : 'Composição inválida'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="md:col-span-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nº da OP</label>
              <input list="col-op-list-simple" value={op} onChange={e => setOp(e.target.value)} placeholder="OP"
                className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800" />
              <datalist id="col-op-list-simple">{opList.map(o => <option key={o} value={o} />)}</datalist>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Qtd. pedido</label>
              <p className="mt-0.5 flex h-10 items-center rounded-lg bg-slate-50 px-2.5 text-sm font-black text-slate-700 dark:bg-slate-800 dark:text-slate-100">{fmt(opInfo?.qtd_total ?? 0)}</p>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status</label>
              <p className={`mt-0.5 flex h-10 items-center rounded-lg px-2.5 text-xs font-black uppercase truncate ${opFound === false ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/20' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20'}`}>{statusLabel}</p>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Data</label>
              <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)}
                className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>
        </section>

        {/* ── Grid principal ── */}
        <div className="grid md:grid-cols-[1fr_296px] gap-4 items-start">

          {/* Coluna esquerda: saldo + escolha + fotos */}
          <div className="space-y-3">

            {/* Saldo da etapa */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-indigo-500 text-sm">calculate</span>
                Saldo da etapa
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/20 p-2.5 flex flex-col gap-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 leading-tight">Boas C/V</p>
                  <p className="text-xl font-black text-indigo-800 dark:text-indigo-200 leading-none">{fmt(saldoRecebido)}</p>
                </div>
                <QtyCard label="Rodado" value={qtyRodadas} onChange={setQtyRodadas} colorClass="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50" />
                <QtyCard label="Escolha" value={qtyEscolha} onChange={setQtyEscolha} colorClass="border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20" />
                <QtyCard label="Refugo" value={qtyRefugo} onChange={setQtyRefugo} colorClass="border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20" />
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 p-2.5 flex flex-col gap-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 leading-tight">Saldo bom</p>
                  <p className="text-xl font-black text-emerald-800 dark:text-emerald-200 leading-none">{fmt(qtyAprovadas)}</p>
                </div>
              </div>
              {recuperadasAtuais > 0 && (
                <p className="mt-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Disponível p/ rodar: {fmt(disponivelTotal)} un. ({fmt(saldoRecebido)} do C/V + {fmt(recuperadasAtuais)} recuperadas da escolha)
                </p>
              )}
              {/* Motivo da escolha gerada na colagem */}
              {qtyEscolha > 0 && (
                <div className="mt-2.5">
                  <EscolhaMotivoInput
                    etapa="colagem"
                    value={escolhaMotivo}
                    onChange={setEscolhaMotivo}
                    label="Motivo da escolha (obrigatório)"
                    required
                    problemas={escolhaProblemas}
                  />
                </div>
              )}
            </section>

            {/* Escolha acumulada — revisão antes de colar */}
            {escolhaAcumulada > 0 && (
              <section className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10 p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-amber-500 text-sm">rule</span>
                  Escolha acumulada (impressão + vinco): <span className="text-amber-800 dark:text-amber-300 ml-1">{fmt(escolhaAcumulada)} un.</span>
                </p>

                {/* Toggle: foi revisada? */}
                <p className="text-xs font-black text-slate-700 dark:text-slate-200 mb-2">
                  A escolha foi revisada antes de colar?
                </p>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setRevisadaAntesColar(true)}
                    className={`flex-1 h-9 rounded-xl text-xs font-black transition-colors border ${
                      revisadaAntesColar === true
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    ✓ Sim, foi revisada
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRevisadaAntesColar(false); setQtyBoasRevisadas(0); setQtyRefugoRevisao(0); }}
                    className={`flex-1 h-9 rounded-xl text-xs font-black transition-colors border ${
                      revisadaAntesColar === false
                        ? 'bg-rose-500 text-white border-rose-500'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-rose-300'
                    }`}
                  >
                    ✗ Não, vai à Revisão Final
                  </button>
                </div>

                {/* Campos condicionais — revisada = SIM */}
                {revisadaAntesColar === true && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      <div className="rounded-xl border border-amber-200 bg-white dark:border-amber-900/40 dark:bg-slate-900 p-2.5 flex flex-col gap-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 leading-tight">Total recebido</p>
                        <p className="text-xl font-black text-amber-700 dark:text-amber-300 leading-none">{fmt(escolhaAcumulada)}</p>
                      </div>
                      <QtyCard label="Boas (incluir no Rodado)" value={qtyBoasRevisadas} onChange={setQtyBoasRevisadas} colorClass="border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20" />
                      <QtyCard label="Refugo da revisão" value={qtyRefugoRevisao} onChange={setQtyRefugoRevisao} colorClass="border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20" />
                    </div>
                    {/* Saldo que vai à Revisão Final */}
                    {(() => {
                      const paraRevisao = Math.max(0, escolhaAcumulada - qtyBoasRevisadas - qtyRefugoRevisao);
                      return paraRevisao > 0 ? (
                        <p className="text-[9px] text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{fmt(paraRevisao)} un.</span> seguem à Revisão Final.
                        </p>
                      ) : null;
                    })()}
                    {(qtyBoasRevisadas + qtyRefugoRevisao) > escolhaAcumulada && (
                      <p className="text-[9px] text-rose-500 font-bold">⚠ Boas + refugo superam a escolha recebida.</p>
                    )}
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">
                      💡 As <strong>boas revisadas</strong> devem ser somadas ao campo <strong>Rodado</strong> acima.
                    </p>
                  </div>
                )}

                {/* Info — revisada = NÃO */}
                {revisadaAntesColar === false && (
                  <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-900/40 dark:bg-indigo-950/10">
                    <span className="material-symbols-outlined text-indigo-500 text-sm">arrow_forward</span>
                    <p className="text-[9px] text-indigo-700 dark:text-indigo-300 font-semibold">
                      {fmt(escolhaAcumulada)} un. seguem integralmente à <strong>Revisão Final</strong>.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Fotos de defeito */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <DefectPhotoUpload pendingPhotos={pendingPhotos} onPendingChange={setPendingPhotos} disabled={saving} />
            </section>
          </div>

          {/* Coluna direita: turno */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-indigo-500 text-sm">assignment_ind</span>
              Registro do turno
            </p>
            <div className="space-y-2.5">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Operador</label>
                <select value={selectedOperatorIds[0] ?? ''} onChange={e => setSelectedOperatorIds(e.target.value ? [e.target.value] : [])}
                  className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Selecione o operador</option>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Máquina</label>
                <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)}
                  className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Selecione a máquina</option>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.name}{m.code ? ` (${m.code})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Turno</label>
                <select value={shift} onChange={e => setShift(e.target.value)}
                  className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="Manha">Manhã</option>
                  <option value="Tarde">Tarde</option>
                  <option value="Noite">Noite</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Defeito encontrado</label>
                <select value={selectedDefectKey} onChange={e => setSelectedDefectKey(e.target.value)}
                  className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Sem defeito</option>
                  {DEFECTS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </div>
              {selectedDefectKey && (
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Qtd. do defeito</label>
                  <input type="number" min={0} value={defectQty}
                    onChange={e => setDefectQty(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-black outline-none dark:border-slate-700 dark:bg-slate-800" />
                </div>
              )}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Observação</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                  placeholder="Observações do processo..."
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs outline-none dark:border-slate-700 dark:bg-slate-800 resize-none" />
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        {(saldoExcedido || composicaoInvalida) && (
          <p className="mx-auto max-w-5xl mb-2 text-[11px] font-bold text-rose-600 dark:text-rose-400">
            ⚠ {saldoExcedido
              ? `Rodado maior que o disponível (${fmt(disponivelTotal)} un. = saldo C/V + recuperadas) — ajuste para salvar.`
              : 'Escolha + refugo maior que o rodado — ajuste para salvar.'}
          </p>
        )}
        <div className="mx-auto flex max-w-5xl gap-3">
          <button type="button" onClick={handleClear} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-black text-slate-500 dark:border-slate-700">Limpar</button>
          <button type="button" onClick={handleSave} disabled={saving || !op.trim() || !selectedMachineId || selectedOperatorIds.length === 0 || saldoExcedido || composicaoInvalida} className="h-11 flex-[2] rounded-xl bg-indigo-600 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar Colagem'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AcabamentoColagemView;
