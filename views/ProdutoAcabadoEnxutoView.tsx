import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';
import PageContainer from '../components/PageContainer';
import EscolhaMotivoInput from '../components/EscolhaMotivoInput';
import { escolhaProblemasService } from '../services/escolhaProblemasService';

// ── Types ─────────────────────────────────────────────────────────────────────
type OperatorOption = { id: string; name: string };
type MachineOption = { id: string; name: string; code?: string };
type AnalystOption = { id: string; name: string };
type OrderInfo = { id: string; op: string; qtd_total: number; status: string };

type RecentRecord = {
  id: string;
  op: string;
  created_at: string;
  boas: number;
  pallets_escolha: number;
  status: string;
};

const getShift = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Manha';
  if (hour >= 14 && hour < 22) return 'Tarde';
  return 'Noite';
};

const fmt = (n: number) => n.toLocaleString('pt-BR');

// Problemas típicos do produto acabado (motivo da escolha)
const PA_PROBLEMAS = [
  'Mancha', 'Rasgado', 'Amassado', 'Registro', 'Sujeira',
  'Falha de Colagem', 'Falha de Verniz', 'Vinco Estourado', 'Modelo Misturado', 'Outros',
];

// ── View ──────────────────────────────────────────────────────────────────────
const ProdutoAcabadoEnxutoView: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useUser();

  const [op, setOp] = useState('');
  const [opList, setOpList] = useState<string[]>([]);
  const [opFound, setOpFound] = useState<boolean | null>(null);
  const [opInfo, setOpInfo] = useState<OrderInfo | null>(null);

  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [analysts, setAnalysts] = useState<AnalystOption[]>([]);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedAnalystIds, setSelectedAnalystIds] = useState<string[]>([]);

  const [boas, setBoas] = useState(0);
  const [recebidoColagem, setRecebidoColagem] = useState(0);
  const [palletsReprovados, setPalletsReprovados] = useState(0); // pallets → Revisão Final
  const [palletsRefugo, setPalletsRefugo] = useState(0);         // pallets → refugo (destruído)
  const [unidPorPallet, setUnidPorPallet] = useState(0);
  const [escolhaMotivo, setEscolhaMotivo] = useState('');
  const [escolhaProblemas, setEscolhaProblemas] = useState<string[]>(PA_PROBLEMAS);
  const [notes, setNotes] = useState('');
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState(getShift);

  const [recent, setRecent] = useState<RecentRecord[]>([]);
  const [saving, setSaving] = useState(false);

  // Cadastros
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
    supabase.from('analysts').select('id, name, tipo').eq('active', true)
      .in('tipo', ['acabamento', 'ambos']).order('name')
      .then(({ data }) => { if (data) setAnalysts(data as AnalystOption[]); });
    escolhaProblemasService.listLabels('produto_acabado').then(setEscolhaProblemas);
  }, []);

  // Info da OP + boas recebidas da colagem
  useEffect(() => {
    if (!op.trim()) { setOpFound(null); setOpInfo(null); setRecebidoColagem(0); return; }
    const opUpper = op.trim().toUpperCase();
    supabase.from('orders').select('id, op, qtd_total, status').eq('op', opUpper).maybeSingle()
      .then(({ data }) => {
        setOpFound(!!data);
        setOpInfo((data as OrderInfo | null) ?? null);
      });
    // Boas que chegam ao produto acabado = aprovadas da colagem
    supabase.from('acabamento_registros').select('qty_aprovadas').eq('op', opUpper).eq('modulo', 'colagem')
      .then(({ data }) => {
        const aprov = (data ?? []).reduce((s: number, r: { qty_aprovadas: number }) => s + (r.qty_aprovadas || 0), 0);
        setRecebidoColagem(aprov);
        if (aprov > 0) setBoas(prev => prev === 0 ? aprov : prev);
      });
  }, [op]);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from('inspections')
      .select('id, op, created_at, observations')
      .order('created_at', { ascending: false })
      .limit(40);
    const rows: RecentRecord[] = [];
    for (const r of (data ?? []) as Array<{ id: string; op: string; created_at: string; observations: string }>) {
      try {
        if (typeof r.observations !== 'string' || !r.observations.trim().startsWith('{')) continue;
        const obs = JSON.parse(r.observations);
        if (obs.process_area !== 'produto_acabado' || obs.tipo !== 'produto_acabado_enxuto') continue;
        rows.push({
          id: r.id,
          op: r.op,
          created_at: r.created_at,
          boas: Number(obs.producao?.qty_produzida) || 0,
          pallets_escolha: Number(obs.pallets_escolha) || 0,
          status: obs.status_final || obs.status || '',
        });
      } catch { /* ignora */ }
      if (rows.length >= 8) break;
    }
    setRecent(rows);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const toggleOperator = (id: string) =>
    setSelectedOperatorIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAnalyst = (id: string) =>
    setSelectedAnalystIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Unidades reprovadas (→ Revisão Final) e refugadas (→ destruído)
  const reprovadosUn = palletsReprovados * unidPorPallet;
  const refugoUn     = palletsRefugo     * unidPorPallet;
  const totalRetirado = reprovadosUn + refugoUn;
  // Boas = recebido − reprovados − refugo. Sem recebido da colagem, usa valor digitado.
  const boasEfetiva = recebidoColagem > 0 ? Math.max(0, recebidoColagem - totalRetirado) : boas;
  const escolhaExcede = recebidoColagem > 0 && totalRetirado > recebidoColagem;
  const cobre = opInfo ? boasEfetiva >= opInfo.qtd_total : null;

  const handleClear = () => {
    setOp(''); setSelectedOperatorIds([]); setSelectedMachineId(''); setSelectedAnalystIds([]);
    setBoas(0); setRecebidoColagem(0); setPalletsReprovados(0); setPalletsRefugo(0);
    setUnidPorPallet(0); setEscolhaMotivo(''); setNotes('');
    setRecordDate(new Date().toISOString().slice(0, 10)); setShift(getShift());
    setOpFound(null); setOpInfo(null);
  };

  const handleSave = async () => {
    if (!op.trim()) { showToast('Informe o número da OP', 'error'); return; }
    if (opFound === false) { showToast('OP não encontrada no cadastro', 'error'); return; }
    if (!selectedMachineId) { showToast('Selecione a máquina', 'error'); return; }
    if (selectedOperatorIds.length === 0) { showToast('Selecione ao menos um operador', 'error'); return; }
    if (selectedAnalystIds.length === 0) { showToast('Selecione ao menos um analista', 'error'); return; }
    if (boasEfetiva <= 0 && palletsReprovados <= 0 && palletsRefugo <= 0) {
      showToast('Informe as boas que passaram ou os pallets reprovados/refugo', 'error'); return;
    }
    if ((palletsReprovados > 0 || palletsRefugo > 0) && unidPorPallet <= 0) {
      showToast('Informe "Unid. por pallet" para converter os pallets em unidades', 'error'); return;
    }
    if (palletsReprovados > 0 && !escolhaMotivo.trim()) {
      showToast('Informe o motivo da reprovação antes de salvar.', 'error'); return;
    }
    if (escolhaExcede) {
      showToast(`Pallets reprovados + refugo (${fmt(totalRetirado)} un.) ultrapassam o recebido da colagem (${fmt(recebidoColagem)} un.).`, 'error');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

    const opUpper = op.trim().toUpperCase();

    // laudo_numero = nº de laudos enxutos já existentes para a OP + 1
    const { data: existentes } = await supabase
      .from('inspections').select('observations').eq('op', opUpper);
    let laudoNumero = 1;
    for (const e of (existentes ?? []) as Array<{ observations: string }>) {
      try {
        if (typeof e.observations === 'string' && e.observations.trim().startsWith('{')) {
          const o = JSON.parse(e.observations);
          if (o.process_area === 'produto_acabado') laudoNumero++;
        }
      } catch { /* ignora */ }
    }

    const statusFinal = palletsReprovados > 0 ? 'RESTRICTED' : 'APPROVED';

    const observations = JSON.stringify({
      process_area: 'produto_acabado',
      process_type: 'ACABAMENTO',
      tipo: 'produto_acabado_enxuto',
      laudo_numero: laudoNumero,
      all_operator_ids: selectedOperatorIds,
      all_analyst_ids: selectedAnalystIds,
      // qty_produzida = bruto que entrou (recebido da colagem)
      // boas efetivas = bruto − reprovados − refugo
      producao: {
        qty_produzida: recebidoColagem > 0 ? recebidoColagem : boasEfetiva + totalRetirado,
        qty_escolha: reprovadosUn,   // → Revisão Final
        qty_refugo: refugoUn,        // → destruído
      },
      recebido_colagem: recebidoColagem,
      pallets_reprovados: palletsReprovados,
      pallets_refugo: palletsRefugo,
      unidades_por_pallet: unidPorPallet,
      unidades_reprovadas: reprovadosUn,
      unidades_refugo: refugoUn,
      reprovacao_motivo: escolhaMotivo.trim(),
      qtd_pedido: opInfo?.qtd_total ?? 0,
      cobre_pedido: cobre,
      status_final: statusFinal,
      data_registro: recordDate,
      turno: shift,
      observacoes: notes.trim(),
    });

    setSaving(true);
    const { error } = await supabase.from('inspections').insert([{
      op: opUpper,
      order_id: opInfo?.id ?? null,
      machine_id: selectedMachineId,
      operator_id: selectedOperatorIds[0],
      analyst_id: selectedAnalystIds[0],
      status: statusFinal,
      samples_count: 0,
      created_at: new Date().toISOString(),
      created_by_user_id: profile?.user_id ?? null,
      observations,
    }]);
    setSaving(false);

    if (error) { showToast(`Erro ao salvar: ${error.message}`, 'error'); return; }
    showToast(`Produto Acabado registrado — OP ${opUpper}`, 'success');
    handleClear();
    loadRecent();
  };


  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-16">
      <div className="mx-auto max-w-5xl p-3 md:p-4 space-y-3">

        {/* ── Cabeçalho compacto ── */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-teal-500">inventory_2</span>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-teal-500 leading-none">Processo</p>
              <h1 className="text-lg font-black uppercase text-slate-900 dark:text-white leading-tight">Produto Acabado</h1>
            </div>
            {escolhaExcede && (
              <span className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 text-[9px] font-black uppercase tracking-widest">
                ⚠ Escolha excede recebido
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="md:col-span-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nº da OP</label>
              <input
                list="pa-op-list"
                value={op}
                onChange={e => setOp(e.target.value)}
                placeholder="Digite ou selecione..."
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-black outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-800"
              />
              <datalist id="pa-op-list">{opList.map(o => <option key={o} value={o} />)}</datalist>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Qtd. pedido</label>
              <p className="mt-0.5 flex h-9 items-center rounded-lg bg-slate-50 px-2.5 text-sm font-black text-slate-700 dark:bg-slate-800 dark:text-slate-100">{fmt(opInfo?.qtd_total ?? 0)}</p>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status</label>
              <p className={`mt-0.5 flex h-9 items-center rounded-lg px-2.5 text-xs font-black uppercase truncate ${opFound === false ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/20' : opInfo ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-slate-50 text-slate-400 dark:bg-slate-800'}`}>
                {opFound === false ? 'não encontrada' : opInfo?.status ?? '—'}
              </p>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Data</label>
              <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)}
                className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800" />
            </div>
          </div>
          {op.trim() && <div className="mt-3"><OpTraceBanner op={op} /></div>}
        </section>

        {/* ── Grid principal ── */}
        <div className="grid md:grid-cols-[1fr_296px] gap-3 items-start">

          {/* Coluna esquerda: resultado da etapa */}
          <div className="space-y-3">

            {/* Resultado */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-teal-500 text-sm">calculate</span>
                Resultado nesta etapa
              </p>

              {recebidoColagem > 0 && (
                <div className={`rounded-xl border p-3 mb-3 ${escolhaExcede ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Recebido da colagem</span>
                    <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">{fmt(recebidoColagem)}</span>
                  </div>
                  <p className={`text-[9px] font-bold mt-0.5 ${escolhaExcede ? 'text-rose-600' : 'text-slate-400'}`}>
                    Boas {fmt(boasEfetiva)} + reprovados {fmt(reprovadosUn)} + refugo {fmt(refugoUn)} = {fmt(recebidoColagem)}
                    {escolhaExcede ? ' — ultrapassou o recebido!' : ''}
                  </p>
                </div>
              )}

              {/* Grid de pallets: 4 campos em linha */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <NumberField label="Pallets reprovados (→ Revisão Final)" value={palletsReprovados} onChange={setPalletsReprovados} accent="amber" />
                <NumberField label="Pallets refugo (→ destruído)" value={palletsRefugo} onChange={setPalletsRefugo} accent="rose" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {recebidoColagem > 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-2.5 flex flex-col gap-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 leading-tight">Boas aprovadas</p>
                    <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 leading-none">{fmt(boasEfetiva)}</p>
                    <p className="text-[9px] text-slate-400">recebido − reprov. − refugo</p>
                  </div>
                ) : (
                  <NumberField label="Boas que passaram (un.)" value={boas} onChange={setBoas} accent="emerald" />
                )}
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-2.5 flex flex-col gap-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 leading-tight">Reprovados (un.)</p>
                  <p className="text-xl font-black text-amber-700 dark:text-amber-300 leading-none">{fmt(reprovadosUn)}</p>
                  <p className="text-[9px] text-slate-400">→ Revisão Final</p>
                </div>
                <NumberField label="Unid. por pallet" value={unidPorPallet} onChange={setUnidPorPallet} accent="slate" />
              </div>

              {(palletsReprovados > 0 || palletsRefugo > 0) && unidPorPallet <= 0 && (
                <p className="text-[10px] font-bold text-amber-600 mt-2">Informe "Unid. por pallet" para calcular as unidades.</p>
              )}

              {palletsReprovados > 0 && (
                <div className="mt-2.5">
                  <EscolhaMotivoInput
                    etapa="produto_acabado"
                    value={escolhaMotivo}
                    onChange={setEscolhaMotivo}
                    label="Motivo da reprovação (obrigatório)"
                    required
                    problemas={escolhaProblemas}
                  />
                </div>
              )}
            </section>

            {/* Cobertura do pedido */}
            {opInfo && opInfo.qtd_total > 0 && (
              <section className={`rounded-2xl border p-4 shadow-sm ${cobre ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Cobre o pedido?</p>
                    <p className={`text-sm font-black mt-0.5 ${cobre ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {cobre ? 'Sim — boas ≥ pedido' : 'Ainda não — falta escolha/recuperação'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Boas vs pedido</p>
                    <p className="text-lg font-black text-slate-700 dark:text-slate-200">{fmt(boasEfetiva)} / {fmt(opInfo.qtd_total)}</p>
                  </div>
                </div>
                {(palletsReprovados > 0 || palletsRefugo > 0) && unidPorPallet > 0 && (
                  <p className="text-[10px] font-bold text-amber-600 mt-1.5">
                    {palletsReprovados > 0 && <>{palletsReprovados} plt. reprovado(s) ≈ {fmt(reprovadosUn)} un. → Revisão Final</>}
                    {palletsReprovados > 0 && palletsRefugo > 0 && ' · '}
                    {palletsRefugo > 0 && <>{palletsRefugo} plt. refugo ≈ {fmt(refugoUn)} un. → Destruído</>}
                  </p>
                )}
              </section>
            )}
          </div>

          {/* Coluna direita: operadores + analistas + máquina + turno + obs */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-teal-500 text-sm">assignment_ind</span>
              Registro do turno
            </p>
            <div className="space-y-2.5">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Máquina</label>
                <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)}
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="">Selecione...</option>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <ChipPicker label="Operadores" options={operators} selected={selectedOperatorIds} onToggle={toggleOperator} />
              <ChipPicker label="Analistas" options={analysts} selected={selectedAnalystIds} onToggle={toggleAnalyst} />
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Turno</label>
                <select value={shift} onChange={e => setShift(e.target.value)}
                  className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-800">
                  <option value="Manha">Manhã</option>
                  <option value="Tarde">Tarde</option>
                  <option value="Noite">Noite</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Observações</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs outline-none dark:border-slate-700 dark:bg-slate-800 resize-none" />
              </div>
            </div>
          </section>
        </div>

        {/* Recentes */}
        {recent.length > 0 && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Registros recentes</p>
            <div className="grid gap-1.5">
              {recent.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-black text-teal-600 shrink-0">OP {r.op}</span>
                    <span className="text-[9px] text-slate-400 font-bold">{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[9px] font-black shrink-0">
                    <span className="text-emerald-600">{fmt(r.boas)} boas</span>
                    {r.pallets_escolha > 0 && <span className="text-amber-500">{r.pallets_escolha} plt esc.</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-5xl gap-3">
          <button type="button" onClick={handleClear} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-black text-slate-500 dark:border-slate-700">Limpar</button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="h-11 flex-[2] rounded-xl bg-teal-600 text-sm font-black text-white hover:bg-teal-700 transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Registrar Produto Acabado'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Sub-componentes ─────────────────────────────────────────────────────────────
const ChipPicker: React.FC<{
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}> = ({ label, options, selected, onToggle }) => (
  <div>
    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
    <div className="mt-1 flex flex-wrap gap-1">
      {options.length === 0 && <span className="text-xs text-slate-400">Nenhum cadastrado</span>}
      {options.map(o => {
        const active = selected.includes(o.id);
        return (
          <button key={o.id} type="button" onClick={() => onToggle(o.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${active
              ? 'bg-teal-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
            {o.name}
          </button>
        );
      })}
    </div>
  </div>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  accent: 'emerald' | 'rose' | 'slate' | 'amber';
}> = ({ label, value, onChange, accent }) => {
  const ring =
    accent === 'emerald' ? 'focus:ring-emerald-500/20 text-emerald-700 dark:text-emerald-300' :
    accent === 'rose' ? 'focus:ring-rose-500/20 text-rose-700 dark:text-rose-300' :
    accent === 'amber' ? 'focus:ring-amber-500/20 text-amber-700 dark:text-amber-300' :
    'focus:ring-slate-500/20 text-slate-700 dark:text-slate-200';
  return (
    <div>
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      <input type="number" min={0} value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={`mt-0.5 w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none font-black text-lg focus:ring-2 ${ring}`} />
    </div>
  );
};

export default ProdutoAcabadoEnxutoView;
