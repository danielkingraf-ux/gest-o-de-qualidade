import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';
import DefectPhotoUpload from '../components/DefectPhotoUpload';
import { defectPhotoService, type PendingPhoto } from '../services/defectPhotoService';

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
  {
    value: 'fechou' as const, label: 'Fechou',
    on: 'bg-emerald-600 border-emerald-600 text-white',
    off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400',
  },
  {
    value: 'nao_fechou' as const, label: 'Não fechou',
    on: 'bg-rose-600 border-rose-600 text-white',
    off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-400',
  },
  {
    value: 'precisa_reimpressao' as const, label: 'Precisa reimpressão',
    on: 'bg-amber-500 border-amber-500 text-white',
    off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400',
  },
  {
    value: 'aprovado_com_restricao' as const, label: 'Aprovado com restrição',
    on: 'bg-indigo-600 border-indigo-600 text-white',
    off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400',
  },
] as const;
type StatusFinal = typeof STATUS_OPCOES[number]['value'] | '';

// ── Types ──────────────────────────────────────────────────────────────────────
type Operador = { id: string; name: string };

type Problema = {
  id: string;
  setor: string;
  operador_id: string;
  maquina_id: string;
  problema: string;
  qty_afetada: string;
  observacao: string;
};

type Periodo = {
  id: string;
  inicio?: string;
  fim?: string;
  pessoas?: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  qty_pessoas: number;
  revisores: string;
  setor: string;
  valor_hora: string;
  observacao: string;
};

type Resultado = {
  qty_solicitada: string;
  qty_revisada: string;
  qty_boa: string;
  qty_recuperada: string;
  qty_refugada: string;
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

const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);

const mkProblema = (): Problema => ({ id: newId(), setor: '', operador_id: '', maquina_id: '', problema: '', qty_afetada: '', observacao: '' });
const mkPeriodo = (): Periodo => ({ id: newId(), data: today(), hora_inicio: currentTime(), hora_fim: currentTime(), qty_pessoas: 1, revisores: '', setor: '', valor_hora: '', observacao: '' });
const mkResultado = (): Resultado => ({ qty_solicitada: '', qty_revisada: '', qty_boa: '', qty_recuperada: '', qty_refugada: '' });

function periodoMinutos(p: Periodo): number {
  const inicio = `${p.data}T${p.hora_inicio}`;
  const fim = `${p.data}T${p.hora_fim}`;
  if (!p.data || !p.hora_inicio || !p.hora_fim) return 0;
  return Math.max(0, Math.floor((new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000));
}

function fmtDuracao(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h ${m}min`;
}

const toInt = (s: string) => parseInt(s, 10) || 0;
const toMoney = (s: string) => Number(String(s || '0').replace(',', '.')) || 0;
const fmt = (n: number) => n.toLocaleString('pt-BR');
const fmtMoney = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function elapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h === 0) return `${Math.floor(ms / 60_000)}min atrás`;
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? 's' : ''} atrás`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const SectionTitle: React.FC<{ icon: string; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-2 mb-4">
    <span className="material-symbols-outlined text-slate-400 text-base">{icon}</span>
    <div>
      <h2 className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white">{title}</h2>
      {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
    </div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <div className={className}>
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
    {children}
  </div>
);

const inputCls = 'w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:font-normal placeholder:text-slate-400';

// ── ProblemaCard ───────────────────────────────────────────────────────────────
const ProblemaCard: React.FC<{
  problema: Problema;
  operadores: Operador[];
  maquinas: { id: string; name: string }[];
  index: number;
  onChange: (p: Problema) => void;
  onRemove: () => void;
}> = ({ problema, operadores, maquinas, index, onChange, onRemove }) => {
  const set = <K extends keyof Problema>(k: K, v: Problema[K]) => onChange({ ...problema, [k]: v });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Problema {index + 1}</span>
        <button type="button" onClick={onRemove}
          className="size-6 rounded-lg flex items-center justify-center text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {/* Setor */}
      <Field label="Setor de Origem" className="mb-3">
        <div className="flex flex-wrap gap-1.5">
          {SETORES_ORIGEM.map(s => (
            <button key={s} type="button"
              onClick={() => set('setor', problema.setor === s ? '' : s)}
              className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-colors ${
                problema.setor === s
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </Field>

      {/* Operador + Máquina */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="Operador Responsável">
          <select value={problema.operador_id} onChange={e => set('operador_id', e.target.value)}
            className={inputCls}>
            <option value="">— sem operador —</option>
            {operadores.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Máquina">
          <select value={problema.maquina_id} onChange={e => set('maquina_id', e.target.value)}
            className={inputCls}>
            <option value="">— sem máquina —</option>
            {maquinas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>

      {/* Qtd afetada */}
      <Field label="Qtd Afetada" className="mb-2">
        <input type="number" min="0" placeholder="opcional"
          value={problema.qty_afetada}
          onChange={e => set('qty_afetada', e.target.value)}
          className={inputCls} />
      </Field>

      {/* Problema encontrado */}
      <Field label="Problema Encontrado" className="mb-2">
        <input list={`def-${problema.id}`} placeholder="Selecione ou descreva o problema..."
          value={problema.problema}
          onChange={e => set('problema', e.target.value)}
          className={inputCls} />
        <datalist id={`def-${problema.id}`}>
          {DEFEITOS_LISTA.map(d => <option key={d} value={d} />)}
        </datalist>
      </Field>

      {/* Observação */}
      <Field label="Observação">
        <input type="text" placeholder="opcional..."
          value={problema.observacao}
          onChange={e => set('observacao', e.target.value)}
          className={inputCls} />
      </Field>
    </div>
  );
};

// ── PeriodoCard ────────────────────────────────────────────────────────────────
const PeriodoCard: React.FC<{
  periodo: Periodo;
  index: number;
  onChange: (p: Periodo) => void;
  onRemove: () => void;
}> = ({ periodo, index, onChange, onRemove }) => {
  const set = <K extends keyof Periodo>(k: K, v: Periodo[K]) => onChange({ ...periodo, [k]: v });
  const min = periodoMinutos(periodo);
  const hh = ((min / 60) * periodo.qty_pessoas).toFixed(1).replace('.', ',');

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      <div className="flex items-center justify-between mb-3">
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
        <Field label="Início">
          <input type="datetime-local" value={periodo.inicio}
            onChange={e => set('inicio', e.target.value)}
            className={inputCls} />
        </Field>
        <Field label="Término">
          <input type="datetime-local" value={periodo.fim}
            onChange={e => set('fim', e.target.value)}
            className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="Pessoas Envolvidas">
          <input type="text" placeholder="Ex: Ana, Maria, João"
            value={periodo.pessoas}
            onChange={e => set('pessoas', e.target.value)}
            className={inputCls} />
        </Field>
        <Field label="Qtd de Pessoas">
          <input type="number" min="1"
            value={periodo.qty_pessoas}
            onChange={e => set('qty_pessoas', Math.max(1, parseInt(e.target.value) || 1))}
            className={inputCls} />
        </Field>
      </div>

      <Field label="Observação">
        <input type="text" placeholder="opcional..."
          value={periodo.observacao}
          onChange={e => set('observacao', e.target.value)}
          className={inputCls} />
      </Field>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const PeriodoTecnicoCard: React.FC<{
  periodo: Periodo;
  index: number;
  onChange: (p: Periodo) => void;
  onRemove: () => void;
}> = ({ periodo, index, onChange, onRemove }) => {
  const set = <K extends keyof Periodo>(k: K, v: Periodo[K]) => onChange({ ...periodo, [k]: v });
  const min = periodoMinutos(periodo);
  const horas = min / 60;
  const homemHora = horas * periodo.qty_pessoas;
  const custo = homemHora * toMoney(periodo.valor_hora);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Período {index + 1}</span>
          {min > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 font-black">
              {fmtDuracao(min)} · {homemHora.toFixed(1).replace('.', ',')} HH · {fmtMoney(custo)}
            </span>
          )}
        </div>
        <button type="button" onClick={onRemove} className="size-6 rounded-lg flex items-center justify-center text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <Field label="Data"><input type="date" value={periodo.data} onChange={e => set('data', e.target.value)} className={inputCls} /></Field>
        <Field label="Hora início"><input type="time" value={periodo.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} className={inputCls} /></Field>
        <Field label="Hora fim"><input type="time" value={periodo.hora_fim} onChange={e => set('hora_fim', e.target.value)} className={inputCls} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="Nome ou matrícula dos revisores"><input type="text" placeholder="Ex: Ana, 1234, Maria" value={periodo.revisores} onChange={e => set('revisores', e.target.value)} className={inputCls} /></Field>
        <Field label="Setor dos revisores"><input type="text" placeholder="Ex: Revisão, Qualidade" value={periodo.setor} onChange={e => set('setor', e.target.value)} className={inputCls} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="Quantidade de pessoas"><input type="number" min="1" value={periodo.qty_pessoas} onChange={e => set('qty_pessoas', Math.max(1, parseInt(e.target.value) || 1))} className={inputCls} /></Field>
        <Field label="Valor hora por pessoa"><input type="number" min="0" step="0.01" placeholder="opcional" value={periodo.valor_hora} onChange={e => set('valor_hora', e.target.value)} className={inputCls} /></Field>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        {[
          ['Total minutos', fmt(min)],
          ['Total horas', horas.toFixed(2).replace('.', ',')],
          ['Homem-hora', homemHora.toFixed(2).replace('.', ',')],
          ['Custo', fmtMoney(custo)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white dark:bg-slate-900 p-2">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="text-xs font-black text-slate-700 dark:text-slate-200">{value}</p>
          </div>
        ))}
      </div>

      <Field label="Observação"><input type="text" placeholder="opcional..." value={periodo.observacao} onChange={e => set('observacao', e.target.value)} className={inputCls} /></Field>
    </div>
  );
};

const AcabamentoRevisaoFinalView: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useUser();

  const [op, setOp] = useState('');
  const [opList, setOpList] = useState<string[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [maquinas, setMaquinas] = useState<{ id: string; name: string }[]>([]);
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [resultado, setResultado] = useState<Resultado>(mkResultado());
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [statusFinal, setStatusFinal] = useState<StatusFinal>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState<string | null>(null);
  const [openSessions, setOpenSessions] = useState<DbRecord[]>([]);
  const [recentRecords, setRecentRecords] = useState<DbRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  type PalletReprovado = {
    id: string;
    pallet_number: number;
    defects_critical: number;
    defects_major: number;
    defects_minor: number;
    units_per_box: number;
    boxes_per_pallet: number;
    analyst_name: string | null;
    completed_at: string | null;
    observations: string | null;
  };

  type SaldoConsolidado = {
    qtdSolicitada: number;
    // Impressão
    rodadasImpressao: number;
    escolhaImpressao: number;
    refugoImpressao: number;
    boaImpressao: number;
    // Corte e Vinco
    rodadasCorteVinco: number;
    escolhaCorteVinco: number;
    refugoCorteVinco: number;
    aprovadoCorteVinco: number;
    // Colagem
    rodadasColagem: number;
    escolhaColagem: number;
    refugoColagem: number;
    aprovadoColagem: number;
    // Produto Acabado
    rodadasProdutoAcabado: number;
    escolhaProdutoAcabado: number;
    refugoProdutoAcabado: number;
    // Pallets
    palletsReprovados: PalletReprovado[];
    totalPallets: number;
    unidadesPalletsReprovados: number;
    // Total escolha para revisão
    totalEscolha: number;
    totalRefugoAntes: number;
    operadoresNomes: string[];
    maquinasNomes: string[];
  };
  const [saldoOp, setSaldoOp] = useState<SaldoConsolidado | null>(null);

  // ── Fetch initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('orders').select('op').order('op').then(({ data }) => {
      if (data) setOpList(data.map((r: { op: string }) => r.op));
    });
    supabase.from('operators').select('id, name').order('name').then(({ data }) => {
      if (data) setOperadores(data as Operador[]);
    });
    supabase.from('machines').select('id, name').order('name').then(({ data }) => {
      if (data) setMaquinas(data as { id: string; name: string }[]);
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

  // ── Consolida saldo da OP ao digitar ────────────────────────────────────────
  useEffect(() => {
    const trimmed = op.trim().toUpperCase();
    if (trimmed.length < 3) { setSaldoOp(null); return; }

    const timer = setTimeout(async () => {
      const [orderRes, inspRes, cvRes, colRes, palletsRes] = await Promise.all([
        supabase.from('orders').select('qtd_total').eq('op', trimmed).maybeSingle(),
        supabase.from('inspections').select('observations, machine_id, created_at').eq('op', trimmed).order('created_at', { ascending: false }),
        supabase.from('acabamento_registros')
          .select('qty_revisadas, qty_aprovadas, qty_reprovadas, operator_ids, machine_id')
          .eq('op', trimmed)
          .eq('modulo', 'corte_vinco'),
        supabase.from('acabamento_registros')
          .select('qty_revisadas, qty_aprovadas, qty_reprovadas, defects, operator_ids, machine_id')
          .eq('op', trimmed)
          .eq('modulo', 'colagem'),
        // Pallets reprovados no Produto Acabado
        supabase.from('pallet_inspections')
          .select('id, pallet_number, defects_critical, defects_major, defects_minor, units_per_box, boxes_per_pallet, analyst_name, completed_at, observations')
          .eq('op', trimmed)
          .eq('result', 'REJECTED')
          .is('archived_at', null)
          .order('pallet_number'),
      ]);

      let rodadasImpressao = 0, escolhaImpressao = 0, refugoImpressao = 0, boaImpressao = 0;
      let rodadasProdutoAcabado = 0, escolhaProdutoAcabado = 0, refugoProdutoAcabado = 0;
      const opIds = new Set<string>();
      const machineIds = new Set<string>();

      // Deduplicar: agrupar por numero_rodada e manter só o mais recente de cada.
      // Dados vêm ordenados por created_at DESC, então o primeiro de cada rodada é o mais recente.
      const seenRodadaInicial = new Set<number>();
      const seenRodadaPA = new Set<number>();

      for (const row of (inspRes.data ?? []) as Array<{ observations: string; machine_id: string | null; created_at: string }>) {
        try {
          const obs = typeof row.observations === 'string'
            ? JSON.parse(row.observations)
            : (row.observations ?? {});
          const numRodada = Number(obs.numero_rodada) || 1;

          if (obs.process_area === 'producao_inicial' && obs.saldo_unidades) {
            if (!seenRodadaInicial.has(numRodada)) {
              seenRodadaInicial.add(numRodada);
              rodadasImpressao  += Number(obs.saldo_unidades.rodadas)    || 0;
              escolhaImpressao  += Number(obs.saldo_unidades.em_escolha) || 0;
              refugoImpressao   += Number(obs.saldo_unidades.reprovadas) || 0;
              boaImpressao      += Number(obs.saldo_unidades.aprovadas)  || 0;
            }
          }
          if (obs.process_area === 'produto_acabado' && obs.producao) {
            const laudoNum = Number(obs.laudo_numero) || 1;
            if (!seenRodadaPA.has(laudoNum)) {
              seenRodadaPA.add(laudoNum);
              rodadasProdutoAcabado += Number(obs.producao.qty_produzida) || 0;
              escolhaProdutoAcabado += Number(obs.producao.qty_escolha)   || 0;
              refugoProdutoAcabado  += Number(obs.producao.qty_refugo)    || 0;
            }
          }
          if (Array.isArray(obs.all_operator_ids)) {
            (obs.all_operator_ids as string[]).forEach((id: string) => id && opIds.add(id));
          }
        } catch { /* ignora */ }
        if (row.machine_id) machineIds.add(row.machine_id);
      }

      const rodadasCorteVinco = (cvRes.data ?? [])
        .reduce((s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0);
      const escolhaCorteVinco = (cvRes.data ?? [])
        .reduce((s: number, r: { qty_reprovadas: number }) => s + (r.qty_reprovadas || 0), 0);
      const refugoCorteVinco = 0; // C/V não tem refugo separado, reprovadas = escolha
      const aprovadoCorteVinco = (cvRes.data ?? [])
        .reduce((s: number, r: { qty_aprovadas: number }) => s + (r.qty_aprovadas || 0), 0);

      for (const row of (cvRes.data ?? []) as Array<{ operator_ids: string[] | null; machine_id: string | null }>) {
        if (Array.isArray(row.operator_ids)) row.operator_ids.forEach((id: string) => id && opIds.add(id));
        if (row.machine_id) machineIds.add(row.machine_id);
      }

      const rodadasColagem = (colRes.data ?? [])
        .reduce((s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0);
      // Escolha da colagem = escolha gerada PELA colagem + escolha acumulada (impressão + vinco)
      // que não foi revisada antes de colar (campo escolha_para_revisao_final no defects)
      const escolhaColagem = (colRes.data ?? [])
        .reduce((s: number, r: { qty_reprovadas: number; defects: Record<string, number> | null }) => {
          const gerada = r.qty_reprovadas || 0;
          const passouSemRevisar = Number(r.defects?.escolha_para_revisao_final) || 0;
          return s + gerada + passouSemRevisar;
        }, 0);
      const refugoColagem = (colRes.data ?? [])
        .reduce((s: number, r: { defects: Record<string, number> | null }) =>
          s + (Number(r.defects?.qty_refugo) || 0), 0);
      const aprovadoColagem = (colRes.data ?? [])
        .reduce((s: number, r: { qty_aprovadas: number }) => s + (r.qty_aprovadas || 0), 0);

      for (const row of (colRes.data ?? []) as Array<{ operator_ids: string[] | null; machine_id: string | null }>) {
        if (Array.isArray(row.operator_ids)) row.operator_ids.forEach((id: string) => id && opIds.add(id));
        if (row.machine_id) machineIds.add(row.machine_id);
      }

      // Total da escolha que vai pra revisão = soma da escolha GERADA em cada etapa
      // (impressão + corte/vinco + colagem + produto acabado). Bate com a coluna
      // "Escolha (gerada)" do histórico por etapa.
      const totalEscolha = escolhaImpressao + escolhaCorteVinco + escolhaColagem + escolhaProdutoAcabado;
      const totalRefugoAntes = refugoImpressao + refugoCorteVinco + refugoColagem + refugoProdutoAcabado;

      // Conta total de pallets da OP (todos os resultados)
      const { count: totalPallets } = await supabase
        .from('pallet_inspections')
        .select('id', { count: 'exact', head: true })
        .eq('op', trimmed)
        .is('archived_at', null);

      // Busca nomes de máquinas e operadores
      const [maqRes, opRes] = await Promise.all([
        machineIds.size > 0
          ? supabase.from('machines').select('id, name').in('id', [...machineIds])
          : Promise.resolve({ data: [] }),
        opIds.size > 0
          ? supabase.from('operators').select('id, name').in('id', [...opIds])
          : Promise.resolve({ data: [] }),
      ]);

      const maquinasNomes = ((maqRes.data ?? []) as Array<{ id: string; name: string }>).map(m => m.name);
      const operadoresNomes = ((opRes.data ?? []) as Array<{ id: string; name: string }>).map(o => o.name);

      const palletsReprovados = (palletsRes.data ?? []) as PalletReprovado[];
      // Unidades dos pallets reprovados = unidades/caixa × caixas/pallet (não contam como boas)
      const unidadesPalletsReprovados = palletsReprovados.reduce(
        (s, p) => s + (Number(p.units_per_box) || 0) * (Number(p.boxes_per_pallet) || 0),
        0
      );

      const qtdSolicitada = orderRes.data?.qtd_total ?? 0;
      setSaldoOp({
        qtdSolicitada,
        rodadasImpressao, escolhaImpressao, refugoImpressao, boaImpressao,
        rodadasCorteVinco, escolhaCorteVinco, refugoCorteVinco, aprovadoCorteVinco,
        rodadasColagem, escolhaColagem, refugoColagem, aprovadoColagem,
        rodadasProdutoAcabado, escolhaProdutoAcabado, refugoProdutoAcabado,
        palletsReprovados,
        totalPallets: totalPallets ?? 0,
        unidadesPalletsReprovados,
        totalEscolha,
        totalRefugoAntes,
        operadoresNomes, maquinasNomes,
      });

      // NÃO pré-preenche qty_recuperada — o campo real é preenchido pelo revisor
    }, 600);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const qtySolicitada = saldoOp?.qtdSolicitada ?? 0;
  const qtyEnviadaRevisao = saldoOp?.totalEscolha ?? 0;
  const numPalletsReprovados = saldoOp?.palletsReprovados?.length ?? 0;
  // Campos REAIS preenchidos pelo revisor
  const qtyRecuperada = toInt(resultado.qty_recuperada);  // saiu BOA da revisão
  const qtyRefugadaFinal = toInt(resultado.qty_refugada);  // saiu REFUGO da revisão
  // Refugo acumulado de todas as etapas antes da revisão
  const totalRefugoAntes = saldoOp?.totalRefugoAntes ?? 0;
  // Total de perdas = refugo das etapas + refugo da revisão
  const perdasTotais = totalRefugoAntes + qtyRefugadaFinal;
  // "Boa" LOCAL do Produto Acabado (só para a tabela de etapas):
  // o que o PA produziu - escolha do PA - refugo do PA
  const qtyBoaProdutoAcabado = Math.max(0, (saldoOp?.rodadasProdutoAcabado ?? 0) - (saldoOp?.escolhaProdutoAcabado ?? 0) - (saldoOp?.refugoProdutoAcabado ?? 0));

  // Unidades dos pallets reprovados no Produto Acabado (650/caixa × 48 caixas, etc.) — só informativo.
  // NÃO é descontado de novo: essas peças já estão DENTRO do produzido do PA e a escolha (23.800)
  // já representa o material pendente de revisão. Descontar os dois contaria a mesma peça duas vezes.
  const unidadesPalletsReprovados = saldoOp?.unidadesPalletsReprovados ?? 0;

  // Aprovado direto = boas do Produto Acabado.
  // Cada etapa já descontou suas próprias escolhas antes de passar adiante:
  //   Impressão: rodadas → -escolha → -refugo = aprovadas → C/V
  //   C/V: recebido → -escolha → -refugo = aprovadas → Colagem
  //   Colagem: recebido → -escolha → -refugo = aprovadas → PA
  //   PA: recebido → -escolha → -refugo = boas diretas
  // As escolhas de cada etapa vão DIRETO pra Revisão Final, não passam adiante.
  // Por isso NÃO subtraímos totalEscolha do PA — ela nunca entrou lá.
  const qtyBoaLimpa = Math.max(0,
    (saldoOp?.rodadasProdutoAcabado ?? 0)
    - (saldoOp?.escolhaProdutoAcabado ?? 0)
    - (saldoOp?.refugoProdutoAcabado ?? 0)
  );
  const qtyFinalAprovada = qtyBoaLimpa + qtyRecuperada;
  // Fecha o pedido?
  const saldo = qtyFinalAprovada - qtySolicitada;
  const fechouPedido = saldo >= 0;
  const hasSaldoCalc = qtySolicitada > 0;

  const totalMinutos = periodos.reduce((s, p) => s + periodoMinutos(p), 0);
  const totalHomemHora = periodos.reduce((s, p) => s + (periodoMinutos(p) / 60) * p.qty_pessoas, 0);
  const totalPessoas = periodos.reduce((s, p) => s + p.qty_pessoas, 0);
  const custoRevisao = periodos.reduce((s, p) => s + (periodoMinutos(p) / 60) * p.qty_pessoas * toMoney(p.valor_hora), 0);

  const hasData = problemas.length > 0 || qtyEnviadaRevisao > 0 || qtyRecuperada > 0 || periodos.length > 0;

  // ── Session management ─────────────────────────────────────────────────────
  const handleClear = () => {
    setOp(''); setProblemas([]); setResultado(mkResultado());
    setPeriodos([]); setStatusFinal(''); setNotes('');
    setEditingId(null); setDataInicio(null); setSaldoOp(null);
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setPendingPhotos([]);
  };

  const restoreFromDefects = (def: Record<string, unknown>, record: DbRecord) => {
    setOp(record.op);
    setProblemas(((def.problemas as unknown[]) ?? []).map((p: unknown) => ({ ...(p as Problema), id: newId() })));
    const r = def.resultado as Resultado | undefined;
    setResultado(r ?? mkResultado());
    setPeriodos(((def.periodos as unknown[]) ?? []).map((p: unknown) => ({ ...(p as Periodo), id: newId() })));
    setStatusFinal((def.status_final as StatusFinal) ?? '');
    setNotes(record.notes ?? '');
    setEditingId(record.id);
    setDataInicio((def.data_inicio as string) ?? record.timestamp);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Sessão OP ${record.op} carregada — continue de onde parou`, 'success');
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async (status: 'em_andamento' | 'finalizado') => {
    if (!op.trim()) { showToast('Informe o número da OP', 'error'); return; }
    if (!hasData) { showToast('Adicione ao menos um problema ou informe a quantidade revisada', 'error'); return; }

    // Conservação da escolha: a revisão não pode recuperar/refugar mais do que recebeu.
    // E ao finalizar, a escolha TEM que zerar: recuperada + refugada == escolha enviada.
    if (qtyRecuperada + qtyRefugadaFinal > qtyEnviadaRevisao) {
      showToast(
        `Recuperada + refugada (${fmt(qtyRecuperada + qtyRefugadaFinal)}) não pode ser maior que a escolha recebida (${fmt(qtyEnviadaRevisao)} un.).`,
        'error',
      );
      return;
    }
    if (status === 'finalizado' && qtyEnviadaRevisao > 0
        && qtyRecuperada + qtyRefugadaFinal !== qtyEnviadaRevisao) {
      const faltam = qtyEnviadaRevisao - (qtyRecuperada + qtyRefugadaFinal);
      showToast(
        `Para finalizar, a escolha precisa fechar: ${fmt(qtyRecuperada)} recuperada + ${fmt(qtyRefugadaFinal)} refugada = ${fmt(qtyRecuperada + qtyRefugadaFinal)}, mas vieram ${fmt(qtyEnviadaRevisao)} un. (faltam ${fmt(faltam)}). Use "Salvar andamento" se ainda está revisando.`,
        'error',
      );
      return;
    }

    // Ao finalizar com escolha: exigir detalhamento (setor/operador/problema/qtd) e horas de revisão.
    if (status === 'finalizado' && qtyEnviadaRevisao > 0) {
      if (problemas.length === 0) {
        showToast('Registre ao menos um problema da escolha (setor, operador, problema, quantidade) antes de finalizar.', 'error');
        return;
      }
      const incompleto = problemas.some(p => !p.setor.trim() || !p.operador_id || !p.problema.trim() || !String(p.qty_afetada).trim());
      if (incompleto) {
        showToast('Cada problema precisa de setor, operador, descrição e quantidade afetada.', 'error');
        return;
      }
      if (totalMinutos <= 0) {
        showToast('Informe as horas de revisão (períodos) antes de finalizar.', 'error');
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }

    const opName = op.trim().toUpperCase();
    const qtyRevisada = qtyEnviadaRevisao;
    const qtyBoa_ = qtyFinalAprovada;
    const qtyRefugada = toInt(resultado.qty_refugada);

    const setoresEnvolvidos = [...new Set(problemas.map(p => p.setor).filter(Boolean))];
    const operadoresEnvolvidos = [...new Set(
      problemas
        .filter(p => p.operador_id)
        .map(p => ({ id: p.operador_id as string, name: operadores.find(o => o.id === p.operador_id)?.name ?? (p.operador_id as string) }))
        .map(o => JSON.stringify(o))
    )].map((s: string) => JSON.parse(s) as { id: string; name: string });

    const defectsPayload = {
      tipo: 'revisao_final_v2',
      session_status: status,
      data_inicio: dataInicio ?? new Date().toISOString(),
      data_atualizacao: new Date().toISOString(),
      // Problemas
      problemas: problemas.map(p => ({
        ...p,
        operador_nome: operadores.find(o => o.id === p.operador_id)?.name ?? '',
        maquina_nome: maquinas.find(m => m.id === p.maquina_id)?.name ?? '',
      })),
      setores_envolvidos: setoresEnvolvidos,
      operadores_envolvidos: operadoresEnvolvidos,
      // Resultado
      resultado: { ...resultado },
      qty_solicitada: qtySolicitada,
      quantidade_enviada_revisao: qtyEnviadaRevisao,
      quantidade_recuperada_revisao: qtyRecuperada,
      quantidade_refugada_revisao: qtyRefugadaFinal,
      quantidade_boa_produto_acabado: qtyBoaProdutoAcabado,
      quantidade_aprovado_direto: qtyBoaLimpa,
      quantidade_final_aprovada: qtyFinalAprovada,
      perdas_totais: perdasTotais,
      saldo,
      fechou_pedido: fechouPedido,
      pallets_reprovados: numPalletsReprovados,
      unidades_pallets_reprovados: unidadesPalletsReprovados,
      consolidado_automatico: saldoOp,
      // Periodos
      periodos,
      total_minutos: totalMinutos,
      total_horas: parseFloat((totalMinutos / 60).toFixed(2)),
      total_pessoas: totalPessoas,
      homem_hora_total: parseFloat(totalHomemHora.toFixed(2)),
      custo_revisao: parseFloat(custoRevisao.toFixed(2)),
      // Status
      status_final: statusSugerido,
      // Data do registro
      data_revisao: new Date().toISOString().slice(0, 10),
    };

    const row = {
      op: opName,
      modulo: 'revisao_final',
      auxiliar_user_id: user.id,
      qty_revisadas: qtyRevisada,
      qty_aprovadas: qtyBoa_,
      qty_reprovadas: qtyRefugada,
      defects: defectsPayload,
      notes: notes.trim() || null,
    };

    setSaving(true);
    let error;
    let insertedId: string | null = editingId;
    if (editingId) {
      ({ error } = await supabase.from('acabamento_registros').update(row).eq('id', editingId));
    } else {
      const result = await supabase.from('acabamento_registros').insert(row).select('id').single();
      error = result.error;
      insertedId = result.data?.id ?? null;
    }

    if (error) { setSaving(false); showToast('Erro ao salvar registro', 'error'); return; }

    // Upload de fotos de defeito (se houver)
    if (insertedId && pendingPhotos.length > 0) {
      try {
        await defectPhotoService.uploadMany({
          recordId: insertedId,
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

    if (status === 'em_andamento') {
      showToast('Sessão salva — continue quando quiser', 'success');
      if (!editingId && insertedId) {
        setEditingId(insertedId);
        setDataInicio(new Date().toISOString());
      }
      loadRecent();
    } else {
      showToast('Revisão finalizada com sucesso!', 'success');
      handleClear();
      loadRecent();
    }
  };

  const setResultadoField = (k: keyof Resultado, v: string) =>
    setResultado(prev => ({ ...prev, [k]: v }));

  const isEditing = !!editingId;
  const statusSugerido: StatusFinal = statusFinal || (
    !fechouPedido && qtySolicitada > 0 ? 'precisa_reimpressao' :
    problemas.length > 0 || numPalletsReprovados > 0 ? 'aprovado_com_restricao' :
    qtySolicitada > 0 ? 'fechou' : ''
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="p-4 md:p-6 pb-28 max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-teal-600">verified</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Revisão Final
              </h1>
              <p className="text-xs text-slate-500">Fechamento da OP — perdas, origem e resultado final</p>
            </div>
          </div>
          {profile?.name && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40">
              <span className="material-symbols-outlined text-teal-500 text-sm">person</span>
              <span className="text-xs font-bold text-teal-700 dark:text-teal-300">{profile.name}</span>
              <span className="text-[10px] text-slate-400 ml-auto">
                {new Date().toLocaleDateString('pt-BR')}
              </span>
            </div>
          )}
        </div>

        {/* Sessões abertas */}
        {openSessions.length > 0 && !isEditing && (
          <section className="mb-4 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-amber-500 text-base">schedule</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                Sessões em Andamento
              </span>
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
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-black uppercase">
                          Em andamento
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {elapsed(inicio)} · {numProblemas} problema{numProblemas !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => restoreFromDefects(def, r)}
                      className="h-8 px-3 rounded-lg bg-amber-500 text-white text-xs font-black hover:bg-amber-600 transition-colors flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">play_arrow</span>
                      Continuar
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Banner sessão ativa */}
        {isEditing && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <span className="material-symbols-outlined text-amber-500 text-sm">edit_note</span>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
              Continuando OP {op}
              {dataInicio && <span className="font-normal"> · iniciada {elapsed(dataInicio)}</span>}
            </span>
            <button type="button" onClick={handleClear}
              className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 underline font-bold">
              Cancelar
            </button>
          </div>
        )}

        {/* ── 1. Identificação ──────────────────────────────────────────────── */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <Field label="Número da OP">
            <input list="rf-op-list" value={op} onChange={e => setOp(e.target.value)}
              placeholder="Ex: 12345"
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 placeholder:font-normal placeholder:text-slate-400" />
            <datalist id="rf-op-list">{opList.map(o => <option key={o} value={o} />)}</datalist>
          </Field>
        </section>

        {/* Rastreio da OP */}
        <OpTraceBanner op={op} moduloAtual="revisao_final" />

        {/* ── Pallets Reprovados para Revisão ──────────────────────────────── */}
        {saldoOp && saldoOp.palletsReprovados.length > 0 && (
          <section className="mb-4 rounded-2xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-rose-500 text-base">report</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">
                Pallets Reprovados — precisam revisão
              </span>
              <span className="ml-auto text-xs font-black text-rose-600 dark:text-rose-300">
                {saldoOp.palletsReprovados.length} de {saldoOp.totalPallets} pallets
              </span>
            </div>
            <div className="rounded-xl overflow-hidden border border-rose-100 dark:border-rose-900/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-rose-100/60 dark:bg-rose-900/30 text-[9px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">
                    <th className="px-3 py-2 text-left">Pallet</th>
                    <th className="px-3 py-2 text-center">Críticos</th>
                    <th className="px-3 py-2 text-center">Maiores</th>
                    <th className="px-3 py-2 text-center">Menores</th>
                    <th className="px-3 py-2 text-left">Analista</th>
                    <th className="px-3 py-2 text-left">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100 dark:divide-rose-900/30">
                  {saldoOp.palletsReprovados.map(p => (
                    <tr key={p.id} className="bg-white dark:bg-slate-900/50">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200">#{p.pallet_number}</td>
                      <td className="px-3 py-2 text-center font-bold text-rose-600">{p.defects_critical}</td>
                      <td className="px-3 py-2 text-center font-bold text-amber-600">{p.defects_major}</td>
                      <td className="px-3 py-2 text-center font-bold text-slate-500">{p.defects_minor}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.analyst_name ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{p.completed_at ? new Date(p.completed_at).toLocaleDateString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Saldo consolidado da OP — o que veio para revisão ─────────────── */}
        {saldoOp && (saldoOp.rodadasImpressao > 0 || saldoOp.rodadasCorteVinco > 0 || saldoOp.rodadasColagem > 0 || saldoOp.rodadasProdutoAcabado > 0) && (
          <section className="mb-4 rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-teal-500 text-base">summarize</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-400">
                Histórico por Etapa — OP {op.trim().toUpperCase()}
              </span>
              {saldoOp.qtdSolicitada > 0 && (
                <span className="ml-auto text-[10px] font-black text-teal-600 dark:text-teal-300">
                  Pedido: {fmt(saldoOp.qtdSolicitada)} un.
                </span>
              )}
            </div>

            <div className="rounded-xl overflow-hidden border border-teal-100 dark:border-teal-900/50 mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-teal-100/60 dark:bg-teal-900/30 text-[9px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-400">
                    <th className="px-3 py-2 text-left">Etapa</th>
                    <th className="px-3 py-2 text-right text-indigo-500">Recebido</th>
                    <th className="px-3 py-2 text-right text-slate-500">Rodado (ref.)</th>
                    <th className="px-3 py-2 text-right text-emerald-600">Boas → próxima</th>
                    <th className="px-3 py-2 text-right text-amber-600">Escolha (gerada)</th>
                    <th className="px-3 py-2 text-right text-rose-600">Refugo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-100 dark:divide-teal-900/30">
                  {saldoOp.rodadasImpressao > 0 && (
                    <tr className="bg-white dark:bg-slate-900/50">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-indigo-400">print</span>Impressão
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-indigo-500">—</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-400">{fmt(saldoOp.rodadasImpressao)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">{fmt(saldoOp.boaImpressao)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaImpressao)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">{fmt(saldoOp.refugoImpressao)}</td>
                    </tr>
                  )}
                  {saldoOp.rodadasCorteVinco > 0 && (
                    <tr className="bg-white dark:bg-slate-900/50">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-indigo-400">content_cut</span>Corte e Vinco
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-indigo-500">{fmt(saldoOp.boaImpressao)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-400">{fmt(saldoOp.rodadasCorteVinco)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">{fmt(saldoOp.aprovadoCorteVinco)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaCorteVinco)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">{fmt(saldoOp.refugoCorteVinco)}</td>
                    </tr>
                  )}
                  {saldoOp.rodadasColagem > 0 && (
                    <tr className="bg-white dark:bg-slate-900/50">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-indigo-400">precision_manufacturing</span>Colagem
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-indigo-500">{fmt(saldoOp.aprovadoCorteVinco)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-400">{fmt(saldoOp.rodadasColagem)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">{fmt(saldoOp.aprovadoColagem)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaColagem)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">{fmt(saldoOp.refugoColagem)}</td>
                    </tr>
                  )}
                  {saldoOp.rodadasProdutoAcabado > 0 && (
                    <tr className="bg-white dark:bg-slate-900/50">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-indigo-400">inventory_2</span>Produto Acabado
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-indigo-500">{fmt(saldoOp.aprovadoColagem)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-400">{fmt(saldoOp.rodadasProdutoAcabado)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">{fmt(qtyBoaProdutoAcabado)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaProdutoAcabado)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">{fmt(saldoOp.refugoProdutoAcabado)}</td>
                    </tr>
                  )}
                  {/* Totalização para revisão */}
                  <tr className="bg-amber-50 dark:bg-amber-950/20 font-black">
                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-400" colSpan={4}>
                      Total escolha → Revisão Final
                    </td>
                    <td className="px-3 py-2 text-right text-lg text-amber-700 dark:text-amber-300">{fmt(saldoOp.totalEscolha)}</td>
                    <td className="px-3 py-2 text-right text-sm text-rose-600">{fmt(saldoOp.totalRefugoAntes)}</td>
                  </tr>
                  {/* Boas diretas que vão pra expedição */}
                  <tr className="bg-emerald-50 dark:bg-emerald-950/20 font-black">
                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400" colSpan={4}>
                      Aprovado direto → Expedição (sem revisão)
                    </td>
                    <td className="px-3 py-2 text-right text-lg text-emerald-700 dark:text-emerald-300" colSpan={2}>{fmt(qtyBoaLimpa)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[9px] text-slate-400 italic mb-1">
              Cada etapa envia sua escolha diretamente à Revisão Final. A colagem soma também a escolha acumulada (impressão + vinco) que não foi revisada antes de colar. Pallets reprovados no PA seguem à Revisão Final para inspeção peça a peça.
            </p>
          </section>
        )}

        {/* ── 2. Problemas identificados ────────────────────────────────────── */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <SectionTitle icon="report_problem" title="Problemas Identificados na OP"
            subtitle="Adicione um problema para cada setor envolvido" />

          <div className="flex flex-col gap-3">
            {problemas.map((p, i) => (
              <ProblemaCard key={p.id} problema={p} operadores={operadores} maquinas={maquinas} index={i}
                onChange={updated => setProblemas(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onRemove={() => setProblemas(prev => prev.filter(x => x.id !== p.id))} />
            ))}
          </div>

          <button type="button"
            onClick={() => setProblemas(prev => [...prev, mkProblema()])}
            className="mt-3 w-full h-10 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs font-black text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-sm">add</span>
            Adicionar Problema
          </button>
        </section>

        {/* ── 3. Resultado da Revisão (campos REAIS) ─────────────────────── */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <SectionTitle icon="fact_check" title="Resultado da Revisão" subtitle="Preencha com o que realmente saiu da revisão" />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Quantidade BOA (recuperada na revisão)">
              <input type="number" min="0" placeholder="Quantas peças saíram boas?"
                value={resultado.qty_recuperada}
                onChange={e => setResultadoField('qty_recuperada', e.target.value)}
                className="w-full h-12 rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 text-center text-lg font-black text-emerald-700 dark:text-emerald-300 outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </Field>
            <Field label="Quantidade REFUGO (descartada na revisão)">
              <input type="number" min="0" placeholder="Quantas peças foram refugadas?"
                value={resultado.qty_refugada}
                onChange={e => setResultadoField('qty_refugada', e.target.value)}
                className="w-full h-12 rounded-xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 text-center text-lg font-black text-rose-600 dark:text-rose-300 outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </Field>
          </div>

          {/* Info: o que veio para revisão */}
          {qtyEnviadaRevisao > 0 && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <span className="material-symbols-outlined text-amber-500 text-sm">info</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                Vieram {fmt(qtyEnviadaRevisao)} un. de escolha para revisão
                {numPalletsReprovados > 0 && ` + ${numPalletsReprovados} pallet(s) reprovado(s) (${fmt(unidadesPalletsReprovados)} un.)`}
              </span>
              {(qtyRecuperada + qtyRefugadaFinal > 0) && (qtyRecuperada + qtyRefugadaFinal) !== qtyEnviadaRevisao && (
                <span className="ml-auto text-[10px] font-black text-amber-600">
                  Revisado: {fmt(qtyRecuperada + qtyRefugadaFinal)} de {fmt(qtyEnviadaRevisao)}
                </span>
              )}
            </div>
          )}
        </section>

        {/* ── 3b. Fechamento Final da OP ───────────────────────────────────── */}
        <section className="mb-4 rounded-2xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/20 p-4">
          <SectionTitle icon="inventory" title="Fechamento Final da OP" subtitle="Soma automática — a OP fecha o pedido?" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Pedido', value: fmt(qtySolicitada), color: 'slate' },
              { label: 'Tiragem impressão (rodado)', value: fmt(saldoOp?.rodadasImpressao ?? 0), color: 'slate' },
              { label: 'Aprovado direto (s/ revisão)', value: fmt(qtyBoaLimpa), color: 'emerald' },
              { label: 'Recuperada (Revisão)', value: fmt(qtyRecuperada), color: 'emerald' },
              { label: 'Total aprovado', value: fmt(qtyFinalAprovada), color: 'indigo' },
              { label: 'Refugo revisão', value: fmt(qtyRefugadaFinal), color: 'rose' },
              { label: 'Refugo total (todas etapas)', value: fmt(perdasTotais), color: 'rose' },
              { label: 'Custo revisão', value: fmtMoney(custoRevisao), color: 'slate' },
              { label: 'Status', value: STATUS_OPCOES.find(s => s.value === statusSugerido)?.label || '—', color: 'slate' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl border p-3 ${
                color === 'emerald' ? 'border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-slate-900' :
                color === 'rose' ? 'border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-900' :
                color === 'indigo' ? 'border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/20' :
                'border-teal-100 dark:border-teal-900/50 bg-white dark:bg-slate-900'
              }`}>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className={`mt-1 text-lg font-black ${
                  color === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' :
                  color === 'rose' ? 'text-rose-600 dark:text-rose-300' :
                  color === 'indigo' ? 'text-indigo-700 dark:text-indigo-300' :
                  'text-slate-800 dark:text-slate-100'
                }`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Resultado: fechou ou não */}
          {hasSaldoCalc && (
            <div className={`rounded-xl p-4 border-2 ${
              fechouPedido
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20'
                : 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/20'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-2xl ${fechouPedido ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {fechouPedido ? 'check_circle' : 'cancel'}
                  </span>
                  <div>
                    <span className={`text-sm font-black ${fechouPedido ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                      {fechouPedido ? 'DEU O PEDIDO' : 'NÃO FECHOU O PEDIDO'}
                    </span>
                    <p className={`text-[11px] mt-0.5 ${fechouPedido ? 'text-emerald-600' : 'text-rose-500'}`}>
                      Pedido: {fmt(qtySolicitada)} · Aprovado: {fmt(qtyFinalAprovada)}
                      {saldo > 0 ? ` · Sobra: ${fmt(saldo)}` : saldo < 0 ? ` · Falta: ${fmt(Math.abs(saldo))}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              {!fechouPedido && (
                <div className="mt-3 pt-3 border-t border-rose-200 dark:border-rose-800 flex items-start gap-3">
                  <span className="material-symbols-outlined text-rose-500 text-base mt-0.5 shrink-0">print</span>
                  <div>
                    <p className="text-xs font-black text-rose-700 dark:text-rose-300 uppercase tracking-wide">
                      Precisa reimprimir {fmt(Math.abs(saldo))} unidades
                    </p>
                    <p className="text-[11px] text-rose-500 dark:text-rose-400 mt-0.5">
                      O pedido exige {fmt(qtySolicitada)} un. · aprovadas: {fmt(qtyFinalAprovada)} un. · faltam {fmt(Math.abs(saldo))} un.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 4. Períodos de Revisão ────────────────────────────────────────── */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <SectionTitle icon="schedule" title="Períodos de Revisão"
            subtitle="A revisão pode ser pausada e retomada em outro dia ou horário" />

          <div className="flex flex-col gap-3">
            {periodos.map((p, i) => (
              <PeriodoTecnicoCard key={p.id} periodo={p} index={i}
                onChange={updated => setPeriodos(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onRemove={() => setPeriodos(prev => prev.filter(x => x.id !== p.id))} />
            ))}
          </div>

          <button type="button"
            onClick={() => setPeriodos(prev => [...prev, mkPeriodo()])}
            className="mt-3 w-full h-10 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs font-black text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-colors flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-sm">add</span>
            Adicionar Período de Revisão
          </button>

          {/* Totais de períodos */}
          {periodos.length > 0 && totalMinutos > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Tempo Total', value: fmtDuracao(totalMinutos) },
                { label: 'Total Pessoas', value: fmt(totalPessoas) },
                { label: 'Homem-Hora', value: `${totalHomemHora.toFixed(1).replace('.', ',')}HH` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className="text-sm font-black text-slate-700 dark:text-slate-200 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 5. Status Final ──────────────────────────────────────────────── */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <SectionTitle icon="flag" title="Status Final da OP" />
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPCOES.map(s => (
              <button key={s.value} type="button"
                onClick={() => setStatusFinal(statusFinal === s.value ? '' : s.value)}
                className={`h-10 rounded-xl border-2 text-xs font-black transition-colors ${
                  statusSugerido === s.value ? s.on : s.off
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── 6. Observações ───────────────────────────────────────────────── */}
        <section className="mb-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <SectionTitle icon="notes" title="Observações Gerais" />
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Anotações finais, destino do material, decisões tomadas..."
            rows={3}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500/20 resize-none" />
        </section>

        {/* ── 7. Registros Recentes ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <SectionTitle icon="history" title="Registros Finalizados" />
          {loadingRecent ? (
            <div className="flex justify-center py-4">
              <div className="size-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
            </div>
          ) : recentRecords.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-2">Nenhum registro finalizado ainda</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentRecords.slice(0, 10).map(r => {
                const def = r.defects as Record<string, unknown>;
                const sf = def.status_final as string | undefined;
                const setores = (def.setores_envolvidos as string[] | undefined) ?? [];
                const hh = (def.homem_hora_total as number | undefined) ?? 0;
                const statusOpt = STATUS_OPCOES.find(o => o.value === sf);
                return (
                  <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200">OP {r.op}</span>
                        {statusOpt && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${statusOpt.on}`}>
                            {statusOpt.label}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-400 shrink-0">
                        {new Date(r.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex gap-1 flex-wrap">
                        {setores.map(s => (
                          <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                            {s}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-3 ml-auto text-[9px] text-slate-400">
                        <span>Rev: {fmt(r.qty_revisadas)}</span>
                        <span>Bom: {fmt(r.qty_aprovadas)}</span>
                        <span>Ref: {fmt(r.qty_reprovadas)}</span>
                        {hh > 0 && <span>{hh.toFixed(1).replace('.', ',')}HH</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Fotos de Defeito */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <DefectPhotoUpload
            pendingPhotos={pendingPhotos}
            onPendingChange={setPendingPhotos}
            disabled={saving}
          />
        </section>
      </div>

      {/* ── Footer fixo ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={handleClear}
          className="order-last sm:order-none w-full sm:w-auto sm:shrink-0 h-12 sm:h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          Limpar
        </button>
        <button type="button" onClick={() => save('em_andamento')}
          disabled={saving || !op.trim() || !hasData}
          className="w-full sm:flex-1 h-12 sm:h-11 rounded-xl border-2 border-amber-400 text-amber-700 dark:text-amber-300 text-sm font-black hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-sm">pause_circle</span>
          {isEditing ? 'Atualizar' : 'Salvar e Continuar'}
        </button>
        <button type="button" onClick={() => save('finalizado')}
          disabled={saving || !op.trim() || !hasData}
          className="w-full sm:flex-1 h-12 sm:h-11 rounded-xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
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
