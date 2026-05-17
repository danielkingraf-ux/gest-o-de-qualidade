import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';

// ── Constants ──────────────────────────────────────────────────────────────────
const SETORES_ORIGEM = [
  'Impressão', 'Corte/Vinco', 'Colagem', 'Hot Stamping', 'UV', 'Produto Acabado', 'Outro',
] as const;

const DEFEITOS_LISTA = [
  'Cor fora do padrão', 'Mancha', 'Pinta', 'Fiapo', 'Registro desalinhado',
  'Falha de verniz', 'Falha de texto', 'Texto fechado', 'Corte incorreto',
  'Vinco incorreto', 'Colagem com falha', 'Hot stamping com falha', 'Hot stamping ausente',
  'UV com falha', 'UV irregular', 'Amassado', 'Riscado', 'Dobrado', 'Rasgado',
  'Dimensão incorreta', 'Impressão dupla', 'Falta de impressão', 'Outro',
];

const STATUS_OPCOES = [
  { value: 'deu_pedido'           as const, label: 'Deu o pedido',          icon: 'check_circle',  on: 'bg-emerald-600 border-emerald-600 text-white', off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400' },
  { value: 'faltou_quantidade'    as const, label: 'Faltou quantidade',      icon: 'cancel',        on: 'bg-rose-600 border-rose-600 text-white',     off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-400' },
  { value: 'aguardando_complemento' as const, label: 'Aguardando compl.',    icon: 'schedule',      on: 'bg-amber-500 border-amber-500 text-white',   off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400' },
  { value: 'reprovado'            as const, label: 'Reprovado',              icon: 'block',         on: 'bg-slate-700 border-slate-700 text-white',   off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-500' },
] as const;
type StatusFinal = typeof STATUS_OPCOES[number]['value'] | '';

// ── Types ──────────────────────────────────────────────────────────────────────
type Operador = { id: string; name: string };

type ProblemaSetor = { setor: string; qty: string };

type Problema = {
  id: string;
  setores: ProblemaSetor[];
  operador_id: string;
  problema: string;
  observacao: string;
};

type Periodo = {
  id: string;
  inicio: string;
  fim: string;
  pessoas: string;
  qty_pessoas: number;
  observacao: string;
};

type ResultadoEtapa = {
  etapa: string;
  label: string;
  qty_revisada: string;
  qty_boa: string;
  qty_refugada: string;
};

type Resultado = {
  qty_solicitada: string;
  etapas: ResultadoEtapa[];
};

type DbRecord = {
  id: string;
  op: string;
  qty_revisadas: number;
  qty_aprovadas: number;
  qty_reprovadas: number;
  timestamp: string;
  defects: Record<string, unknown>;
  notes: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
let _seq = 0;
const newId = () => `r${++_seq}${Math.random().toString(36).slice(2, 5)}`;

function localNow(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`;
}

const mkProblema = (): Problema => ({ id: newId(), setores: [], operador_id: '', problema: '', observacao: '' });
const mkPeriodo  = (): Periodo  => ({ id: newId(), inicio: localNow(), fim: localNow(), pessoas: '', qty_pessoas: 1, observacao: '' });
const mkResultado = (): Resultado => ({ qty_solicitada: '', etapas: [] });

function migrateProblema(p: any): Problema {
  if (p.setores) return { id: newId(), setores: p.setores, operador_id: p.operador_id || '', problema: p.problema || '', observacao: p.observacao || '' };
  // Formato antigo: { setor, qty_afetada }
  return { id: newId(), setores: p.setor ? [{ setor: p.setor, qty: p.qty_afetada || '' }] : [], operador_id: p.operador_id || '', problema: p.problema || '', observacao: p.observacao || '' };
}

function migrateResultado(r: any): Resultado {
  if (!r) return mkResultado();
  if (r.etapas) return r as Resultado;
  // Formato antigo: { qty_solicitada, qty_revisada, qty_boa, qty_refugada }
  const etapas: ResultadoEtapa[] = [];
  if (r.qty_revisada) etapas.push({ etapa: 'geral', label: 'Geral', qty_revisada: r.qty_revisada || '', qty_boa: r.qty_boa || '', qty_refugada: r.qty_refugada || '' });
  return { qty_solicitada: r.qty_solicitada || '', etapas };
}

function periodoMinutos(p: Periodo): number {
  if (!p.inicio || !p.fim) return 0;
  return Math.max(0, Math.floor((new Date(p.fim).getTime() - new Date(p.inicio).getTime()) / 60_000));
}

function fmtDuracao(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h ${m}min`;
}

const toInt = (s: string) => parseInt(s, 10) || 0;
const fmt   = (n: number) => n.toLocaleString('pt-BR');

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h === 0) return `${Math.floor(ms / 60_000)}min atrás`;
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? 's' : ''} atrás`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const inputCls = 'w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:font-normal placeholder:text-slate-400';

const ProblemaCard: React.FC<{
  problema: Problema; operadores: Operador[]; index: number;
  onChange: (p: Problema) => void; onRemove: () => void;
}> = ({ problema, operadores, index, onChange, onRemove }) => {
  const set = <K extends keyof Problema>(k: K, v: Problema[K]) => onChange({ ...problema, [k]: v });
  const selectedSetores = problema.setores.map(s => s.setor);

  const toggleSetor = (s: string) => {
    if (selectedSetores.includes(s)) {
      set('setores', problema.setores.filter(x => x.setor !== s));
    } else {
      set('setores', [...problema.setores, { setor: s, qty: '' }]);
    }
  };

  const updateSetorQty = (setor: string, qty: string) => {
    set('setores', problema.setores.map(x => x.setor === setor ? { ...x, qty } : x));
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Problema {index + 1}</span>
        <button type="button" onClick={onRemove}
          className="size-6 rounded-lg flex items-center justify-center text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {/* Setores — multi-setor com qty por setor */}
      <div className="mb-2.5">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
          Setores Afetados <span className="text-rose-400">*</span>
        </p>

        {/* Setores selecionados com qty */}
        {problema.setores.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {problema.setores.map(ps => (
              <div key={ps.setor} className="flex items-center gap-2">
                <span className="flex-1 px-2 py-1 rounded-lg text-[10px] font-black bg-indigo-600 text-white truncate">{ps.setor}</span>
                <input
                  type="number" min="0" placeholder="Qtd" value={ps.qty}
                  onChange={e => updateSetorQty(ps.setor, e.target.value)}
                  className="w-24 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button type="button" onClick={() => toggleSetor(ps.setor)}
                  className="size-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pills para adicionar setores */}
        <div className="flex flex-wrap gap-1">
          {SETORES_ORIGEM.filter(s => !selectedSetores.includes(s)).map(s => (
            <button key={s} type="button" onClick={() => toggleSetor(s)}
              className="px-2 py-1 rounded-lg text-[10px] font-black border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[10px]">add</span>{s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Operador</p>
          <select value={problema.operador_id} onChange={e => set('operador_id', e.target.value)} className={inputCls}>
            <option value="">— sem operador —</option>
            {operadores.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Problema</p>
          <input list={`def-${problema.id}`} placeholder="Selecione ou descreva..." value={problema.problema}
            onChange={e => set('problema', e.target.value)} className={inputCls} />
          <datalist id={`def-${problema.id}`}>{DEFEITOS_LISTA.map(d => <option key={d} value={d} />)}</datalist>
        </div>
      </div>

      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Observação</p>
        <input type="text" placeholder="opcional..." value={problema.observacao}
          onChange={e => set('observacao', e.target.value)} className={inputCls} />
      </div>
    </div>
  );
};

const PeriodoCard: React.FC<{
  periodo: Periodo; index: number;
  onChange: (p: Periodo) => void; onRemove: () => void;
}> = ({ periodo, index, onChange, onRemove }) => {
  const set = <K extends keyof Periodo>(k: K, v: Periodo[K]) => onChange({ ...periodo, [k]: v });
  const min = periodoMinutos(periodo);
  const hh  = ((min / 60) * periodo.qty_pessoas).toFixed(1).replace('.', ',');

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Período {index + 1}</span>
          {min > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 font-black">
              {fmtDuracao(min)} · {hh} HH
            </span>
          )}
        </div>
        <button type="button" onClick={onRemove}
          className="size-6 rounded-lg flex items-center justify-center text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Início</p>
          <input type="datetime-local" value={periodo.inicio} onChange={e => set('inicio', e.target.value)} className={inputCls} />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Término</p>
          <input type="datetime-local" value={periodo.fim} onChange={e => set('fim', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Pessoas Envolvidas</p>
          <input type="text" placeholder="Ex: Ana, João" value={periodo.pessoas}
            onChange={e => set('pessoas', e.target.value)} className={inputCls} />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Qtd de Pessoas</p>
          <input type="number" min="1" value={periodo.qty_pessoas}
            onChange={e => set('qty_pessoas', Math.max(1, parseInt(e.target.value) || 1))} className={inputCls} />
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const AcabamentoRevisaoFinalView: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useUser();

  const [op, setOp]                       = useState('');
  const [opList, setOpList]               = useState<string[]>([]);
  const [operadores, setOperadores]       = useState<Operador[]>([]);
  const [problemas, setProblemas]         = useState<Problema[]>([]);
  const [resultado, setResultado]         = useState<Resultado>(mkResultado());
  const [periodos, setPeriodos]           = useState<Periodo[]>([]);
  const [statusFinal, setStatusFinal]     = useState<StatusFinal>('');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [dataInicio, setDataInicio]       = useState<string | null>(null);
  const [openSessions, setOpenSessions]   = useState<DbRecord[]>([]);
  const [recentRecords, setRecentRecords] = useState<DbRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);

  type SaldoConsolidado = {
    qtdSolicitada: number;
    rodadasImpressao: number; escolhaImpressao: number;
    rodadasCorteVinco: number; escolhaCorteVinco: number;
    rodadasProdutoAcabado: number; escolhaProdutoAcabado: number;
    rodadasColagem: number; escolhaColagem: number; refugoColagem: number;
    totalEscolha: number;
    loteProdutoAcabadoReprovado: boolean;
    operadoresNomes: string[];
    maquinasNomes: string[];
    colagemOperadoresNomes: string[];
    colagemMaquinaNome: string;
  };
  const [saldoOp, setSaldoOp] = useState<SaldoConsolidado | null>(null);

  useEffect(() => {
    supabase.from('orders').select('op').order('op').then(({ data }) => {
      if (data) setOpList(data.map((r: { op: string }) => r.op));
    });
    supabase.from('operators').select('id, name').order('name').then(({ data }) => {
      if (data) setOperadores(data as Operador[]);
    });
  }, []);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('acabamento_registros')
      .select('id, op, qty_revisadas, qty_aprovadas, qty_reprovadas, timestamp, defects, notes')
      .eq('modulo', 'revisao_final')
      .order('timestamp', { ascending: false })
      .limit(25);
    const records = (data as DbRecord[]) ?? [];
    setOpenSessions(records.filter(r => (r.defects as Record<string, unknown>)?.session_status === 'em_andamento'));
    setRecentRecords(records.filter(r => (r.defects as Record<string, unknown>)?.session_status !== 'em_andamento'));
    setLoadingRecent(false);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  useEffect(() => {
    const trimmed = op.trim().toUpperCase();
    if (trimmed.length < 3) { setSaldoOp(null); return; }

    const timer = setTimeout(async () => {
      const [orderRes, inspRes, cvRes] = await Promise.all([
        supabase.from('orders').select('qtd_total').eq('op', trimmed).maybeSingle(),
        supabase.from('inspections').select('observations, machine_id').eq('op', trimmed),
        supabase.from('acabamento_registros').select('qty_revisadas, qty_reprovadas').eq('op', trimmed).eq('modulo', 'corte_vinco'),
      ]);

      let rodadasImpressao = 0, escolhaImpressao = 0;
      let rodadasProdutoAcabado = 0, escolhaProdutoAcabado = 0;
      let rodadasColagem = 0, escolhaColagem = 0, refugoColagem = 0;
      const opIds = new Set<string>();
      const machineIds = new Set<string>();
      const colagemOpIds = new Set<string>();
      let colagemMachineId = '';

      for (const row of (inspRes.data ?? []) as Array<{ observations: string; machine_id: string | null }>) {
        try {
          const obs = typeof row.observations === 'string' ? JSON.parse(row.observations) : (row.observations ?? {});
          if (obs.process_area === 'producao_inicial' && obs.saldo_unidades) {
            rodadasImpressao  += Number(obs.saldo_unidades.rodadas)    || 0;
            escolhaImpressao  += Number(obs.saldo_unidades.em_escolha) || 0;
          }
          if (obs.process_area === 'produto_acabado' && obs.producao) {
            rodadasProdutoAcabado += Number(obs.producao.qty_produzida) || 0;
            escolhaProdutoAcabado += Number(obs.producao.qty_escolha)   || 0;
          }
          if (obs.process_area === 'produto_acabado' && obs.colagem) {
            rodadasColagem += Number(obs.colagem.qty_rodadas)    || 0;
            escolhaColagem += Number(obs.colagem.qty_escolha)    || 0;
            refugoColagem  += Number(obs.colagem.qty_reprovadas) || 0;
            if (Array.isArray(obs.colagem.operator_ids)) {
              (obs.colagem.operator_ids as string[]).forEach((id: string) => id && colagemOpIds.add(id));
            }
            if (obs.colagem.machine_id && !colagemMachineId) colagemMachineId = obs.colagem.machine_id;
          }
          if (Array.isArray(obs.all_operator_ids)) {
            (obs.all_operator_ids as string[]).forEach((id: string) => id && opIds.add(id));
          }
        } catch { /* ignora */ }
        if (row.machine_id) machineIds.add(row.machine_id);
      }

      if (colagemMachineId) machineIds.add(colagemMachineId);
      colagemOpIds.forEach(id => opIds.add(id));

      const rodadasCorteVinco = (cvRes.data ?? []).reduce((s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0);
      const escolhaCorteVinco = (cvRes.data ?? []).reduce((s: number, r: { qty_reprovadas: number }) => s + (r.qty_reprovadas || 0), 0);
      const totalEscolha = escolhaImpressao + escolhaCorteVinco + escolhaProdutoAcabado + escolhaColagem;
      const loteProdutoAcabadoReprovado = rodadasProdutoAcabado > 0 && escolhaProdutoAcabado >= rodadasProdutoAcabado;

      const [maqRes, opRes] = await Promise.all([
        machineIds.size > 0 ? supabase.from('machines').select('id, name').in('id', [...machineIds]) : Promise.resolve({ data: [] }),
        opIds.size > 0      ? supabase.from('operators').select('id, name').in('id', [...opIds])     : Promise.resolve({ data: [] }),
      ]);

      const allMachData = (maqRes.data ?? []) as Array<{ id: string; name: string }>;
      const allOpData   = (opRes.data  ?? []) as Array<{ id: string; name: string }>;
      const maquinasNomes    = allMachData.filter(m => m.id !== colagemMachineId).map(m => m.name);
      const operadoresNomes  = allOpData.filter(o => !colagemOpIds.has(o.id)).map(o => o.name);
      const colagemOperadoresNomes = allOpData.filter(o => colagemOpIds.has(o.id)).map(o => o.name);
      const colagemMaquinaNome     = allMachData.find(m => m.id === colagemMachineId)?.name ?? '';
      const qtdSolicitada = orderRes.data?.qtd_total ?? 0;

      setSaldoOp({ qtdSolicitada, rodadasImpressao, escolhaImpressao, rodadasCorteVinco, escolhaCorteVinco, rodadasProdutoAcabado, escolhaProdutoAcabado, rodadasColagem, escolhaColagem, refugoColagem, totalEscolha, loteProdutoAcabadoReprovado, operadoresNomes, maquinasNomes, colagemOperadoresNomes, colagemMaquinaNome });

      // Inicializa etapas do resultado se ainda vazio
      setResultado(prev => {
        const next = { ...prev };
        if (qtdSolicitada > 0 && !next.qty_solicitada) next.qty_solicitada = String(qtdSolicitada);
        if (next.etapas.length === 0) {
          const etapas: ResultadoEtapa[] = [];
          if (escolhaImpressao > 0)       etapas.push({ etapa: 'impressao',       label: 'Impressão',      qty_revisada: String(escolhaImpressao),       qty_boa: '', qty_refugada: '' });
          if (escolhaCorteVinco > 0)      etapas.push({ etapa: 'corte_vinco',     label: 'Corte e Vinco',  qty_revisada: String(escolhaCorteVinco),      qty_boa: '', qty_refugada: '' });
          if (escolhaProdutoAcabado > 0)  etapas.push({ etapa: 'produto_acabado', label: 'Prod. Acabado',  qty_revisada: String(escolhaProdutoAcabado),  qty_boa: '', qty_refugada: '' });
          if (escolhaColagem > 0)         etapas.push({ etapa: 'colagem',         label: 'Colagem',        qty_revisada: String(escolhaColagem),         qty_boa: '', qty_refugada: '' });
          if (etapas.length > 0) next.etapas = etapas;
        }
        return next;
      });
    }, 600);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const qtySolicitada  = toInt(resultado.qty_solicitada);
  const qtyBoa         = resultado.etapas.reduce((s, e) => s + toInt(e.qty_boa), 0);
  const qtyRefugada    = resultado.etapas.reduce((s, e) => s + toInt(e.qty_refugada), 0);
  const qtyRevisada    = resultado.etapas.reduce((s, e) => s + toInt(e.qty_revisada), 0);
  const saldo          = qtyBoa - qtySolicitada;
  const hasSaldoCalc   = qtySolicitada > 0 && qtyBoa > 0;
  const totalMinutos   = periodos.reduce((s, p) => s + periodoMinutos(p), 0);
  const totalHomemHora = periodos.reduce((s, p) => s + (periodoMinutos(p) / 60) * p.qty_pessoas, 0);
  const totalPessoas   = periodos.reduce((s, p) => s + p.qty_pessoas, 0);
  const hasData        = problemas.length > 0 || qtyRevisada > 0 || periodos.length > 0;
  const isEditing      = !!editingId;

  // ── Session ─────────────────────────────────────────────────────────────────
  const handleClear = () => {
    setOp(''); setProblemas([]); setResultado(mkResultado());
    setPeriodos([]); setStatusFinal(''); setNotes('');
    setEditingId(null); setDataInicio(null); setSaldoOp(null);
  };

  const restoreFromDefects = (def: Record<string, unknown>, record: DbRecord) => {
    setOp(record.op);
    setProblemas(((def.problemas as unknown[]) ?? []).map((p: unknown) => migrateProblema(p)));
    setResultado(migrateResultado(def.resultado));
    setPeriodos(((def.periodos as unknown[]) ?? []).map((p: unknown) => ({ ...(p as Periodo), id: newId() })));
    setStatusFinal((def.status_final as StatusFinal) ?? '');
    setNotes(record.notes ?? '');
    setEditingId(record.id);
    setDataInicio((def.data_inicio as string) ?? record.timestamp);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Sessão OP ${record.op} carregada`, 'success');
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async (status: 'em_andamento' | 'finalizado') => {
    if (!op.trim()) { showToast('Informe o número da OP', 'error'); return; }
    if (!hasData)   { showToast('Adicione ao menos um problema ou informe a quantidade revisada', 'error'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

    const opName = op.trim().toUpperCase();
    const setoresEnvolvidos  = [...new Set(problemas.flatMap(p => p.setores.map(s => s.setor)).filter(Boolean))];
    const operadoresEnvolvidos = [...new Set(
      problemas.filter(p => p.operador_id)
        .map(p => ({ id: p.operador_id as string, name: operadores.find(o => o.id === p.operador_id)?.name ?? p.operador_id as string }))
        .map(o => JSON.stringify(o))
    )].map((s: string) => JSON.parse(s) as { id: string; name: string });

    const defectsPayload = {
      tipo: 'revisao_final_v2', session_status: status,
      data_inicio: dataInicio ?? new Date().toISOString(),
      data_atualizacao: new Date().toISOString(),
      problemas: problemas.map(p => ({ ...p, operador_nome: operadores.find(o => o.id === p.operador_id)?.name ?? '' })),
      setores_envolvidos: setoresEnvolvidos, operadores_envolvidos: operadoresEnvolvidos,
      resultado: { ...resultado },
      qty_solicitada: qtySolicitada, saldo,
      periodos, total_minutos: totalMinutos,
      total_horas: parseFloat((totalMinutos / 60).toFixed(2)),
      total_pessoas: totalPessoas, homem_hora_total: parseFloat(totalHomemHora.toFixed(2)),
      status_final: statusFinal, data_revisao: new Date().toISOString().slice(0, 10),
    };

    const row = {
      op: opName, modulo: 'revisao_final', auxiliar_user_id: user.id,
      qty_revisadas: qtyRevisada, qty_aprovadas: qtyBoa,
      qty_reprovadas: qtyRefugada, defects: defectsPayload, notes: notes.trim() || null,
    };

    setSaving(true);
    let error;
    if (editingId) {
      ({ error } = await supabase.from('acabamento_registros').update(row).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('acabamento_registros').insert(row));
    }
    setSaving(false);

    if (error) { showToast('Erro ao salvar registro', 'error'); return; }

    if (status === 'em_andamento') {
      showToast('Sessão salva — continue quando quiser', 'success');
      if (!editingId) {
        const { data } = await supabase.from('acabamento_registros').select('id, timestamp')
          .eq('modulo', 'revisao_final').eq('op', opName).order('timestamp', { ascending: false }).limit(1);
        if (data?.[0]) { setEditingId(data[0].id); setDataInicio(data[0].timestamp); }
      }
      loadRecent();
    } else {
      showToast('Revisão finalizada com sucesso!', 'success');
      handleClear(); loadRecent();
    }
  };

  const setResultadoSolicitada = (v: string) => setResultado(prev => ({ ...prev, qty_solicitada: v }));
  const setEtapaField = (etapa: string, k: keyof ResultadoEtapa, v: string) =>
    setResultado(prev => ({ ...prev, etapas: prev.etapas.map(e => e.etapa === etapa ? { ...e, [k]: v } : e) }));
  const addEtapaManual = () => {
    const existingLabels = resultado.etapas.map(e => e.etapa);
    const next = (['impressao','corte_vinco','produto_acabado','colagem'] as const)
      .find(e => !existingLabels.includes(e));
    const labelMap: Record<string, string> = { impressao: 'Impressão', corte_vinco: 'Corte e Vinco', produto_acabado: 'Prod. Acabado', colagem: 'Colagem' };
    if (next) setResultado(prev => ({ ...prev, etapas: [...prev.etapas, { etapa: next, label: labelMap[next], qty_revisada: '', qty_boa: '', qty_refugada: '' }] }));
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-teal-600">verified</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Revisão Final</h1>
              <p className="text-xs text-slate-500">Fechamento da OP — perdas, origem e resultado final</p>
            </div>
          </div>
          {profile?.name && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 self-start">
              <span className="material-symbols-outlined text-teal-500 text-sm">person</span>
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300">{profile.name}</span>
              <span className="text-[10px] text-slate-400 ml-2">{new Date().toLocaleDateString('pt-BR')}</span>
            </div>
          )}
        </div>

        {/* ── Sessões abertas (largura total) ─────────────────────────────── */}
        {openSessions.length > 0 && !isEditing && (
          <div className="mb-5 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-amber-500 text-base">schedule</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Sessões em Andamento</span>
            </div>
            <div className="flex flex-col gap-2">
              {openSessions.map(r => {
                const def = r.defects as Record<string, unknown>;
                const numProblemas = ((def.problemas as unknown[]) ?? []).length;
                const inicio = (def.data_inicio as string) ?? r.timestamp;
                return (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900/40">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800 dark:text-white">OP {r.op}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-black uppercase">Em andamento</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{elapsed(inicio)} · {numProblemas} problema{numProblemas !== 1 ? 's' : ''}</p>
                    </div>
                    <button type="button" onClick={() => restoreFromDefects(def, r)}
                      className="h-8 px-3 rounded-lg bg-amber-500 text-white text-xs font-black hover:bg-amber-600 transition-colors flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">play_arrow</span>Continuar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isEditing && (
          <div className="mb-5 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <span className="material-symbols-outlined text-amber-500 text-sm">edit_note</span>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
              Continuando OP {op}{dataInicio && <span className="font-normal"> · iniciada {elapsed(dataInicio)}</span>}
            </span>
            <button type="button" onClick={handleClear} className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 underline font-bold">Cancelar</button>
          </div>
        )}

        {/* ── Layout duas colunas ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* ══ COLUNA ESQUERDA: OP + Saldo + Resultado + Status ══════════ */}
          <div className="space-y-4 lg:sticky lg:top-4">

            {/* OP */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-teal-400">tag</span>Identificação da OP
              </h2>
              <input list="rf-op-list" value={op} onChange={e => setOp(e.target.value)} placeholder="Ex: 12345"
                className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 placeholder:font-normal placeholder:text-slate-400" />
              <datalist id="rf-op-list">{opList.map(o => <option key={o} value={o} />)}</datalist>

              {/* Rastreio inline */}
              <div className="mt-3">
                <OpTraceBanner op={op} moduloAtual="revisao_final" />
              </div>
            </section>

            {/* Saldo consolidado */}
            {saldoOp && (saldoOp.rodadasImpressao > 0 || saldoOp.rodadasCorteVinco > 0 || saldoOp.rodadasProdutoAcabado > 0) && (
              <section className="rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">summarize</span>Escolhas por Etapa
                  </h2>
                  {saldoOp.qtdSolicitada > 0 && (
                    <span className="text-[10px] font-black text-teal-600 dark:text-teal-300">Pedido: {fmt(saldoOp.qtdSolicitada)} un.</span>
                  )}
                </div>

                {/* Tabela compacta */}
                <div className="rounded-xl overflow-hidden border border-teal-100 dark:border-teal-900/50 mb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-teal-100/60 dark:bg-teal-900/30 text-[9px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-400">
                        <th className="px-3 py-1.5 text-left">Etapa</th>
                        <th className="px-3 py-1.5 text-right">Rodadas</th>
                        <th className="px-3 py-1.5 text-right text-amber-600">Escolha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-teal-100 dark:divide-teal-900/30">
                      {saldoOp.rodadasImpressao > 0 && (
                        <tr className="bg-white dark:bg-slate-900/50">
                          <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-indigo-400">print</span>Impressão
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-500">{fmt(saldoOp.rodadasImpressao)}</td>
                          <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaImpressao)}</td>
                        </tr>
                      )}
                      {saldoOp.rodadasCorteVinco > 0 && (
                        <tr className="bg-white dark:bg-slate-900/50">
                          <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-indigo-400">content_cut</span>Corte e Vinco
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-500">{fmt(saldoOp.rodadasCorteVinco)}</td>
                          <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaCorteVinco)}</td>
                        </tr>
                      )}
                      {saldoOp.rodadasProdutoAcabado > 0 && (
                        <tr className="bg-white dark:bg-slate-900/50">
                          <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-indigo-400">inventory_2</span>Prod. Acabado
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-500">{fmt(saldoOp.rodadasProdutoAcabado)}</td>
                          <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaProdutoAcabado)}</td>
                        </tr>
                      )}
                      {saldoOp.rodadasColagem > 0 && (
                        <tr className="bg-white dark:bg-slate-900/50">
                          <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-teal-400">glue</span>Colagem
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-500">{fmt(saldoOp.rodadasColagem)}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="font-black text-amber-600">{fmt(saldoOp.escolhaColagem)}</span>
                            {saldoOp.refugoColagem > 0 && <span className="ml-2 text-[10px] font-bold text-rose-500">Refugo: {fmt(saldoOp.refugoColagem)}</span>}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-amber-50 dark:bg-amber-950/20">
                        <td className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Total para revisão</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right text-base font-black text-amber-700 dark:text-amber-300">{fmt(saldoOp.totalEscolha)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {saldoOp.loteProdutoAcabadoReprovado && (
                  <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-700">
                    <span className="material-symbols-outlined text-rose-500 text-sm mt-0.5 shrink-0">error</span>
                    <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">
                      Lote completo reprovado no Produto Acabado — separe defeituosos e determine o refugo.
                    </p>
                  </div>
                )}

                {/* Máquinas e operadores */}
                {(saldoOp.maquinasNomes.length > 0 || saldoOp.operadoresNomes.length > 0 || saldoOp.colagemOperadoresNomes.length > 0 || saldoOp.colagemMaquinaNome) && (
                  <div className="pt-3 border-t border-teal-100 dark:border-teal-900/40 space-y-1.5">
                    {(saldoOp.maquinasNomes.length > 0 || saldoOp.operadoresNomes.length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {saldoOp.maquinasNomes.map(m => (
                          <span key={m} className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 text-[10px] font-black flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">precision_manufacturing</span>{m}
                          </span>
                        ))}
                        {saldoOp.operadoresNomes.map(o => (
                          <span key={o} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold">{o}</span>
                        ))}
                      </div>
                    )}
                    {(saldoOp.colagemOperadoresNomes.length > 0 || saldoOp.colagemMaquinaNome) && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">Colagem:</span>
                        {saldoOp.colagemMaquinaNome && (
                          <span className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 text-[10px] font-black flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">precision_manufacturing</span>{saldoOp.colagemMaquinaNome}
                          </span>
                        )}
                        {saldoOp.colagemOperadoresNomes.map(o => (
                          <span key={o} className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[10px] font-bold">{o}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Resultado Final */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-teal-400">summarize</span>Resultado Final da Revisão
              </h2>

              {/* Pedido */}
              <div className="mb-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Qtd Pedido</p>
                <input type="number" min="0" placeholder="0" value={resultado.qty_solicitada}
                  onChange={e => setResultadoSolicitada(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center text-sm font-black text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500/20" />
              </div>

              {/* Tabela por etapa */}
              {resultado.etapas.length > 0 && (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 mb-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <th className="px-2 py-1.5 text-left">Etapa</th>
                        <th className="px-2 py-1.5 text-center text-blue-500">Revisada</th>
                        <th className="px-2 py-1.5 text-center text-emerald-600">Boa</th>
                        <th className="px-2 py-1.5 text-center text-rose-500">Refugo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {resultado.etapas.map(e => (
                        <tr key={e.etapa}>
                          <td className="px-2 py-1.5 font-black text-slate-600 dark:text-slate-300 text-[10px] whitespace-nowrap">{e.label}</td>
                          {(['qty_revisada','qty_boa','qty_refugada'] as const).map(k => (
                            <td key={k} className="px-1 py-1">
                              <input type="number" min="0" placeholder="0" value={e[k]}
                                onChange={ev => setEtapaField(e.etapa, k, ev.target.value)}
                                className={`w-full h-7 rounded-lg border text-center text-[11px] font-black outline-none focus:ring-1 ${
                                  k === 'qty_revisada' ? 'border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 focus:ring-blue-400/30'
                                  : k === 'qty_boa'    ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 focus:ring-emerald-400/30'
                                  : 'border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 focus:ring-rose-400/30'
                                }`} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {resultado.etapas.length > 1 && (
                      <tfoot>
                        <tr className="bg-slate-50 dark:bg-slate-800/40 text-[10px] font-black">
                          <td className="px-2 py-1.5 text-slate-500 uppercase tracking-widest">Total</td>
                          <td className="px-2 py-1.5 text-center text-blue-700 dark:text-blue-300">{fmt(qtyRevisada)}</td>
                          <td className="px-2 py-1.5 text-center text-emerald-700 dark:text-emerald-300">{fmt(qtyBoa)}</td>
                          <td className="px-2 py-1.5 text-center text-rose-600">{fmt(qtyRefugada)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Botão para adicionar etapa manualmente */}
              {resultado.etapas.length < 4 && (
                <button type="button" onClick={addEtapaManual}
                  className="mb-3 w-full h-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-400 hover:border-teal-300 hover:text-teal-500 transition-colors flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-sm">add</span>Adicionar etapa
                </button>
              )}

              {hasSaldoCalc && (
                <div className={`rounded-xl p-3 border-2 ${saldo >= 0 ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20' : 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/20'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-lg ${saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {saldo >= 0 ? 'check_circle' : 'cancel'}
                      </span>
                      <span className={`text-sm font-black ${saldo >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                        {saldo >= 0 ? 'Deu o pedido' : 'Faltou quantidade'}
                      </span>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${saldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {saldo >= 0 ? `Sobrou ${fmt(saldo)}` : `Faltou ${fmt(Math.abs(saldo))}`}
                    </span>
                  </div>
                  {saldo < 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-rose-200 dark:border-rose-800 flex items-start gap-2">
                      <span className="material-symbols-outlined text-rose-500 text-base mt-0.5 shrink-0">print</span>
                      <div>
                        <p className="text-xs font-black text-rose-700 dark:text-rose-300 uppercase">Reimprimir {fmt(Math.abs(saldo))} unidades</p>
                        <p className="text-[11px] text-rose-500 mt-0.5">
                          Pedido: {fmt(qtySolicitada)} · Entregue: {fmt(qtyBoa)} · Faltam: {fmt(Math.abs(saldo))}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Status Final */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-slate-400">flag</span>Status Final da OP
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPCOES.map(s => (
                  <button key={s.value} type="button"
                    onClick={() => setStatusFinal(statusFinal === s.value ? '' : s.value)}
                    className={`h-10 rounded-xl border-2 text-xs font-black transition-colors flex items-center justify-center gap-1.5 ${statusFinal === s.value ? s.on : s.off}`}>
                    <span className="material-symbols-outlined text-sm">{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* ══ COLUNA DIREITA: Problemas + Períodos + Observações ══════════ */}
          <div className="space-y-4">

            {/* Problemas */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-rose-400">report_problem</span>
                    Problemas Identificados
                    {problemas.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/30 text-rose-600 text-[9px]">{problemas.length}</span>}
                  </h2>
                  <p className="text-[10px] text-slate-400 mt-0.5 ml-5">Adicione um registro por setor envolvido</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {problemas.map((p, i) => (
                  <ProblemaCard key={p.id} problema={p} operadores={operadores} index={i}
                    onChange={updated => setProblemas(prev => prev.map(x => x.id === updated.id ? updated : x))}
                    onRemove={() => setProblemas(prev => prev.filter(x => x.id !== p.id))} />
                ))}
              </div>

              <button type="button" onClick={() => setProblemas(prev => [...prev, mkProblema()])}
                className="mt-3 w-full h-10 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs font-black text-slate-400 hover:border-rose-300 hover:text-rose-500 transition-colors flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-sm">add</span>Adicionar Problema
              </button>
            </section>

            {/* Períodos de revisão */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-violet-400">schedule</span>
                    Períodos de Revisão
                    {periodos.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/30 text-violet-600 text-[9px]">{periodos.length}</span>}
                  </h2>
                  <p className="text-[10px] text-slate-400 mt-0.5 ml-5">A revisão pode ser pausada e retomada</p>
                </div>
                {periodos.length > 0 && totalMinutos > 0 && (
                  <div className="text-right">
                    <p className="text-xs font-black text-violet-700 dark:text-violet-300">{fmtDuracao(totalMinutos)}</p>
                    <p className="text-[9px] text-slate-400">{totalHomemHora.toFixed(1).replace('.', ',')} HH · {totalPessoas} pess.</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {periodos.map((p, i) => (
                  <PeriodoCard key={p.id} periodo={p} index={i}
                    onChange={updated => setPeriodos(prev => prev.map(x => x.id === updated.id ? updated : x))}
                    onRemove={() => setPeriodos(prev => prev.filter(x => x.id !== p.id))} />
                ))}
              </div>

              <button type="button" onClick={() => setPeriodos(prev => [...prev, mkPeriodo()])}
                className="mt-3 w-full h-10 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs font-black text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-colors flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-sm">add</span>Adicionar Período
              </button>
            </section>

            {/* Observações */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-slate-400">notes</span>Observações Gerais
              </h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Anotações finais, destino do material, decisões tomadas..."
                rows={4}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
            </section>
          </div>
        </div>

        {/* ── Histórico (largura total, colapsável) ───────────────────────── */}
        <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <button type="button" onClick={() => setShowHistorico(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400 text-base">history</span>
              <span className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">Registros Finalizados</span>
              {recentRecords.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[9px] font-black">{recentRecords.length}</span>
              )}
            </div>
            <span className={`material-symbols-outlined text-slate-400 transition-transform ${showHistorico ? 'rotate-180' : ''}`}>expand_more</span>
          </button>

          {showHistorico && (
            <div className="border-t border-slate-100 dark:border-slate-800 p-4">
              {loadingRecent ? (
                <div className="flex justify-center py-4">
                  <div className="size-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
                </div>
              ) : recentRecords.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Nenhum registro finalizado ainda</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {recentRecords.slice(0, 10).map(r => {
                    const def = r.defects as Record<string, unknown>;
                    const sf  = def.status_final as string | undefined;
                    const setores = (def.setores_envolvidos as string[] | undefined) ?? [];
                    const hh = (def.homem_hora_total as number | undefined) ?? 0;
                    const statusOpt = STATUS_OPCOES.find(o => o.value === sf);
                    return (
                      <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200">OP {r.op}</span>
                            {statusOpt && (
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${statusOpt.on}`}>{statusOpt.label}</span>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-400 shrink-0">
                            {new Date(r.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex gap-1 flex-wrap">
                            {setores.map(s => (
                              <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">{s}</span>
                            ))}
                          </div>
                          <div className="flex gap-3 ml-auto text-[9px] text-slate-400">
                            <span>Rev: {fmt(r.qty_revisadas)}</span>
                            <span className="text-emerald-600">Bom: {fmt(r.qty_aprovadas)}</span>
                            <span className="text-rose-500">Ref: {fmt(r.qty_reprovadas)}</span>
                            {hh > 0 && <span>{hh.toFixed(1).replace('.', ',')}HH</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer fixo ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex gap-2">
        <button type="button" onClick={handleClear}
          className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0">
          Limpar
        </button>
        <button type="button" onClick={() => save('em_andamento')} disabled={saving || !op.trim() || !hasData}
          className="flex-1 h-11 rounded-xl border-2 border-amber-400 text-amber-700 dark:text-amber-300 text-sm font-black hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-sm">pause_circle</span>
          {isEditing ? 'Atualizar' : 'Salvar e Continuar'}
        </button>
        <button type="button" onClick={() => save('finalizado')} disabled={saving || !op.trim() || !hasData}
          className="flex-1 h-11 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
          {saving
            ? <span className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : <span className="material-symbols-outlined text-sm">check_circle</span>}
          {saving ? 'Salvando...' : 'Finalizar'}
        </button>
      </div>
    </div>
  );
};

export default AcabamentoRevisaoFinalView;
