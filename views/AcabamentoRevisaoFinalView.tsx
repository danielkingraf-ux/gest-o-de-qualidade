import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import OpTraceBanner from '../components/OpTraceBanner';
import DefectPhotoUpload from '../components/DefectPhotoUpload';
import { defectPhotoService, type PendingPhoto } from '../services/defectPhotoService';
import { dedupInspections, parseObsSafe } from '../utils/inspectionDedup';

// ── Constants ──────────────────────────────────────────────────────────────────
const SETORES_ORIGEM = [
  'Impressão', 'Corte/Vinco', 'Colagem', 'Hot Stamping', 'UV', 'Produto Acabado', 'Outro',
] as const;

const SETOR_COLORS: Record<string, { active: string; inactive: string }> = {
  'Impressão':       { active: 'bg-indigo-600 border-indigo-600 text-white', inactive: 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20' },
  'Corte/Vinco':     { active: 'bg-violet-600 border-violet-600 text-white', inactive: 'bg-white dark:bg-slate-900 border-violet-200 dark:border-violet-900/40 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20' },
  'Colagem':         { active: 'bg-amber-600 border-amber-600 text-white',   inactive: 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20' },
  'Hot Stamping':    { active: 'bg-orange-600 border-orange-600 text-white', inactive: 'bg-white dark:bg-slate-900 border-orange-200 dark:border-orange-900/40 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20' },
  'UV':              { active: 'bg-cyan-600 border-cyan-600 text-white',     inactive: 'bg-white dark:bg-slate-900 border-cyan-200 dark:border-cyan-900/40 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/20' },
  'Produto Acabado': { active: 'bg-teal-600 border-teal-600 text-white',     inactive: 'bg-white dark:bg-slate-900 border-teal-200 dark:border-teal-900/40 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/20' },
  'Outro':           { active: 'bg-slate-600 border-slate-600 text-white',   inactive: 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800' },
};

const DEFEITOS_LISTA = [
  'Cor fora do padrão', 'Mancha', 'Pinta', 'Fiapo', 'Registro desalinhado',
  'Falha de verniz', 'Falha de texto', 'Texto fechado', 'Corte incorreto',
  'Vinco incorreto', 'Colagem com falha', 'Hot stamping com falha', 'Hot stamping ausente',
  'UV com falha', 'UV irregular', 'Amassado', 'Riscado', 'Dobrado', 'Rasgado',
  'Dimensão incorreta', 'Impressão dupla', 'Falta de impressão', 'Outro',
];

const STATUS_OPCOES = [
  {
    value: 'fechou' as const, label: 'Fechou', icon: 'check_circle',
    on: 'bg-emerald-600 border-emerald-600 text-white',
    off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/10',
  },
  {
    value: 'nao_fechou' as const, label: 'Não fechou', icon: 'cancel',
    on: 'bg-rose-600 border-rose-600 text-white',
    off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/10',
  },
  {
    value: 'precisa_reimpressao' as const, label: 'Precisa reimpressão', icon: 'print',
    on: 'bg-amber-500 border-amber-500 text-white',
    off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/10',
  },
  {
    value: 'aprovado_com_restricao' as const, label: 'Aprovado c/ restrição', icon: 'verified',
    on: 'bg-indigo-600 border-indigo-600 text-white',
    off: 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/10',
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
// keep localNow in scope (used implicitly via mkPeriodo chain)
void localNow;

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

/** Step badge: número cinza → checkmark teal quando done */
const StepBadge: React.FC<{ step: number; done: boolean }> = ({ step, done }) => (
  <div className={`size-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
    done
      ? 'bg-teal-500 text-white shadow-sm shadow-teal-200 dark:shadow-teal-900/40'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
  }`}>
    {done
      ? <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
      : <span className="text-[11px] font-black">{step}</span>
    }
  </div>
);

const SectionTitle: React.FC<{
  icon: string;
  title: string;
  subtitle?: string;
  step?: number;
  done?: boolean;
  optional?: boolean;
}> = ({ icon, title, subtitle, step, done = false, optional }) => (
  <div className="flex items-center gap-3 mb-4">
    {step !== undefined && <StepBadge step={step} done={done} />}
    <span className="material-symbols-outlined text-slate-400 text-base">{icon}</span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white leading-none">{title}</h2>
        {optional && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold uppercase tracking-wide">opcional</span>
        )}
      </div>
      {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
    {done && step !== undefined && (
      <span className="text-[9px] font-black text-teal-600 dark:text-teal-400 shrink-0">Pronto</span>
    )}
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
  const setorColor = SETOR_COLORS[problema.setor] ?? SETOR_COLORS['Outro'];
  const isComplete = !!problema.setor && !!problema.problema && !!problema.operador_id && !!problema.qty_afetada;

  return (
    <div className={`rounded-xl border transition-colors ${
      isComplete
        ? 'border-teal-200 dark:border-teal-900/50 bg-teal-50/30 dark:bg-teal-950/5'
        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
    }`}>
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-slate-100 dark:border-slate-700/50">
        <div className={`size-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black ${
          isComplete ? 'bg-teal-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
        }`}>
          {isComplete ? <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span> : index + 1}
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex-1">
          Problema {index + 1}
          {problema.setor && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black ${setorColor.active}`}>
              {problema.setor}
            </span>
          )}
        </span>
        <button type="button" onClick={onRemove}
          className="size-6 rounded-lg flex items-center justify-center text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* 1. Setor de origem — chip colorido por setor */}
        <Field label="Setor de origem">
          <div className="flex flex-wrap gap-1.5">
            {SETORES_ORIGEM.map(s => {
              const c = SETOR_COLORS[s] ?? SETOR_COLORS['Outro'];
              return (
                <button key={s} type="button"
                  onClick={() => set('setor', problema.setor === s ? '' : s)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-colors ${
                    problema.setor === s ? c.active : c.inactive
                  }`}>
                  {s}
                </button>
              );
            })}
          </div>
        </Field>

        {/* 2. Problema encontrado — campo mais importante, vem logo após o setor */}
        <Field label="Problema encontrado *">
          <input list={`def-${problema.id}`} placeholder="Selecione ou descreva o problema..."
            value={problema.problema}
            onChange={e => set('problema', e.target.value)}
            className={inputCls} />
          <datalist id={`def-${problema.id}`}>
            {DEFEITOS_LISTA.map(d => <option key={d} value={d} />)}
          </datalist>
        </Field>

        {/* 3. Operador + Máquina */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Operador responsável *">
            <select value={problema.operador_id} onChange={e => set('operador_id', e.target.value)}
              className={inputCls}>
              <option value="">— selecione —</option>
              {operadores.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Máquina">
            <select value={problema.maquina_id} onChange={e => set('maquina_id', e.target.value)}
              className={inputCls}>
              <option value="">— opcional —</option>
              {maquinas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        </div>

        {/* 4. Qtd afetada + observação */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Qtd afetada *">
            <input type="number" min="0" placeholder="0"
              value={problema.qty_afetada}
              onChange={e => set('qty_afetada', e.target.value)}
              className={inputCls} />
          </Field>
          <Field label="Observação">
            <input type="text" placeholder="opcional..."
              value={problema.observacao}
              onChange={e => set('observacao', e.target.value)}
              className={inputCls} />
          </Field>
        </div>
      </div>
    </div>
  );
};

// ── PeriodoCard (legacy — not used in render) ──────────────────────────────────
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
void PeriodoCard; // suppress unused warning

// ── PeriodoTecnicoCard ─────────────────────────────────────────────────────────
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
    <div className="rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-950/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-950/20 border-b border-violet-100 dark:border-violet-900/30">
        <span className="material-symbols-outlined text-violet-400 text-sm">schedule</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 flex-1">
          Período {index + 1}
        </span>
        {min > 0 && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-200 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 font-black">
            {fmtDuracao(min)} · {homemHora.toFixed(1).replace('.', ',')} HH
            {custo > 0 && ` · ${fmtMoney(custo)}`}
          </span>
        )}
        <button type="button" onClick={onRemove} className="size-6 rounded-lg flex items-center justify-center text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div className="p-3 space-y-2">
        {/* Data + horários */}
        <div className="grid grid-cols-3 gap-2">
          <Field label="Data"><input type="date" value={periodo.data} onChange={e => set('data', e.target.value)} className={inputCls} /></Field>
          <Field label="Hora início"><input type="time" value={periodo.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} className={inputCls} /></Field>
          <Field label="Hora fim"><input type="time" value={periodo.hora_fim} onChange={e => set('hora_fim', e.target.value)} className={inputCls} /></Field>
        </div>

        {/* Revisores + setor */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Revisores (nome ou matrícula)"><input type="text" placeholder="Ex: Ana, 1234, Maria" value={periodo.revisores} onChange={e => set('revisores', e.target.value)} className={inputCls} /></Field>
          <Field label="Setor dos revisores"><input type="text" placeholder="Ex: Revisão, Qualidade" value={periodo.setor} onChange={e => set('setor', e.target.value)} className={inputCls} /></Field>
        </div>

        {/* Pessoas + valor hora */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Qtd de pessoas"><input type="number" min="1" value={periodo.qty_pessoas} onChange={e => set('qty_pessoas', Math.max(1, parseInt(e.target.value) || 1))} className={inputCls} /></Field>
          <Field label="Valor hora / pessoa (R$)"><input type="number" min="0" step="0.01" placeholder="opcional" value={periodo.valor_hora} onChange={e => set('valor_hora', e.target.value)} className={inputCls} /></Field>
        </div>

        {/* Calculado */}
        {min > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {([
              ['Minutos', fmt(min)],
              ['Horas', horas.toFixed(2).replace('.', ',')],
              ['Homem-hora', homemHora.toFixed(2).replace('.', ',')],
              ['Custo', fmtMoney(custo)],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white dark:bg-slate-900 border border-violet-100 dark:border-violet-900/30 p-2 text-center">
                <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className="text-[11px] font-black text-violet-700 dark:text-violet-300 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}

        <Field label="Observação"><input type="text" placeholder="opcional..." value={periodo.observacao} onChange={e => set('observacao', e.target.value)} className={inputCls} /></Field>
      </div>
    </div>
  );
};

// ── Step progress indicator ────────────────────────────────────────────────────
const StepProgress: React.FC<{ steps: { label: string; done: boolean }[] }> = ({ steps }) => (
  <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
    {steps.map((step, i) => (
      <React.Fragment key={step.label}>
        <div className={`flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black transition-all ${
          step.done
            ? 'bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
        }`}>
          {step.done && <span className="material-symbols-outlined text-teal-500" style={{ fontSize: 11 }}>check_circle</span>}
          {step.label}
        </div>
        {i < steps.length - 1 && (
          <div className={`h-px w-3 shrink-0 rounded ${step.done ? 'bg-teal-300 dark:bg-teal-700' : 'bg-slate-200 dark:bg-slate-700'}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
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
    rodadasImpressao: number;
    escolhaImpressao: number;
    refugoImpressao: number;
    boaImpressao: number;
    rodadasCorteVinco: number;
    escolhaCorteVinco: number;
    refugoCorteVinco: number;
    aprovadoCorteVinco: number;
    rodadasColagem: number;
    escolhaColagem: number;
    refugoColagem: number;
    aprovadoColagem: number;
    boasRevisadasColagem: number;
    refugoRevisaoColagem: number;
    rodadasProdutoAcabado: number;
    escolhaProdutoAcabado: number;
    refugoProdutoAcabado: number;
    palletsReprovados: PalletReprovado[];
    totalPallets: number;
    unidadesPalletsReprovados: number;
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
          .eq('op', trimmed).eq('modulo', 'corte_vinco'),
        supabase.from('acabamento_registros')
          .select('qty_revisadas, qty_aprovadas, qty_reprovadas, defects, operator_ids, machine_id')
          .eq('op', trimmed).eq('modulo', 'colagem'),
        supabase.from('pallet_inspections')
          .select('id, pallet_number, defects_critical, defects_major, defects_minor, units_per_box, boxes_per_pallet, analyst_name, completed_at, observations')
          .eq('op', trimmed).eq('result', 'REJECTED').is('archived_at', null).order('pallet_number'),
      ]);

      let rodadasImpressao = 0, escolhaImpressao = 0, refugoImpressao = 0, boaImpressao = 0;
      let rodadasProdutoAcabado = 0, escolhaProdutoAcabado = 0, refugoProdutoAcabado = 0;
      const opIds = new Set<string>();
      const machineIds = new Set<string>();

      // Parciais da mesma rodada SOMAM; só duplo-save idêntico e laudo PA
      // repetido (vale o mais recente) são descartados.
      type InspRow = { observations: string; machine_id: string | null; created_at: string };
      const inspRows = dedupInspections((inspRes.data ?? []) as InspRow[], {
        getObs: row => parseObsSafe(row.observations),
        getCreatedAt: row => row.created_at,
      });
      for (const row of inspRows) {
        const obs = parseObsSafe(row.observations);
        if (obs.process_area === 'producao_inicial' && obs.saldo_unidades) {
          rodadasImpressao  += Number(obs.saldo_unidades.rodadas)    || 0;
          escolhaImpressao  += Number(obs.saldo_unidades.em_escolha) || 0;
          refugoImpressao   += Number(obs.saldo_unidades.reprovadas) || 0;
          boaImpressao      += Number(obs.saldo_unidades.aprovadas)  || 0;
        }
        if (obs.process_area === 'produto_acabado' && obs.producao) {
          rodadasProdutoAcabado += Number(obs.producao.qty_produzida) || 0;
          escolhaProdutoAcabado += Number(obs.producao.qty_escolha)   || 0;
          refugoProdutoAcabado  += Number(obs.producao.qty_refugo)    || 0;
        }
      }
      // Operadores e máquinas: considerar TODOS os registros (inclusive duplicados)
      for (const row of (inspRes.data ?? []) as InspRow[]) {
        const obs = parseObsSafe(row.observations);
        if (Array.isArray(obs.all_operator_ids)) {
          (obs.all_operator_ids as string[]).forEach((id: string) => id && opIds.add(id));
        }
        if (row.machine_id) machineIds.add(row.machine_id);
      }

      const rodadasCorteVinco    = (cvRes.data ?? []).reduce((s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0);
      const escolhaCorteVinco    = (cvRes.data ?? []).reduce((s: number, r: { qty_reprovadas: number }) => s + (r.qty_reprovadas || 0), 0);
      const refugoCorteVinco     = 0;
      const aprovadoCorteVinco   = (cvRes.data ?? []).reduce((s: number, r: { qty_aprovadas: number }) => s + (r.qty_aprovadas || 0), 0);

      for (const row of (cvRes.data ?? []) as Array<{ operator_ids: string[] | null; machine_id: string | null }>) {
        if (Array.isArray(row.operator_ids)) row.operator_ids.forEach((id: string) => id && opIds.add(id));
        if (row.machine_id) machineIds.add(row.machine_id);
      }

      const rodadasColagem    = (colRes.data ?? []).reduce((s: number, r: { qty_revisadas: number }) => s + (r.qty_revisadas || 0), 0);
      // Compatibilidade formato antigo / novo (mesmo critério do OPTraceView):
      // - Formato antigo: qty_reprovadas incluía escolha acumulada (impressão + C/V) → dobra contagem
      // - Formato novo: defects.escolha_acumulada_recebida existe; qty_reprovadas = só colagem própria
      const colData = (colRes.data ?? []) as Array<{ qty_reprovadas: number; defects: Record<string, unknown> | null }>;
      const isNewColagemFmt = colData.some(r => r.defects && 'escolha_acumulada_recebida' in r.defects);
      const escolhaColRaw = colData.reduce((s, r) => s + (r.qty_reprovadas || 0), 0);
      const escolhaColagem = isNewColagemFmt
        ? escolhaColRaw
        : Math.max(0, escolhaColRaw - (escolhaImpressao + escolhaCorteVinco));
      const refugoColagem     = (colRes.data ?? []).reduce((s: number, r: { defects: Record<string, number> | null }) => s + (Number(r.defects?.qty_refugo) || 0), 0);
      const aprovadoColagem   = (colRes.data ?? []).reduce((s: number, r: { qty_aprovadas: number }) => s + (r.qty_aprovadas || 0), 0);
      // Escolha já RESOLVIDA na colagem (revisada antes de colar): as boas
      // recuperadas voltaram pro fluxo e o refugo da revisão é perda definitiva.
      // Nada disso chega à Revisão Final.
      const boasRevisadasColagem = colData.reduce((s, r) => s + (Number((r.defects as Record<string, unknown>)?.boas_revisadas) || 0), 0);
      const refugoRevisaoColagem = colData.reduce((s, r) => s + (Number((r.defects as Record<string, unknown>)?.refugo_revisao) || 0), 0);

      for (const row of (colRes.data ?? []) as Array<{ operator_ids: string[] | null; machine_id: string | null }>) {
        if (Array.isArray(row.operator_ids)) row.operator_ids.forEach((id: string) => id && opIds.add(id));
        if (row.machine_id) machineIds.add(row.machine_id);
      }

      const totalEscolha     = Math.max(0,
        escolhaImpressao + escolhaCorteVinco + escolhaColagem + escolhaProdutoAcabado
        - boasRevisadasColagem - refugoRevisaoColagem);
      const totalRefugoAntes = refugoImpressao + refugoCorteVinco + refugoColagem + refugoRevisaoColagem + refugoProdutoAcabado;

      const { count: totalPallets } = await supabase
        .from('pallet_inspections').select('id', { count: 'exact', head: true })
        .eq('op', trimmed).is('archived_at', null);

      const [maqRes, opRes] = await Promise.all([
        machineIds.size > 0
          ? supabase.from('machines').select('id, name').in('id', [...machineIds])
          : Promise.resolve({ data: [] }),
        opIds.size > 0
          ? supabase.from('operators').select('id, name').in('id', [...opIds])
          : Promise.resolve({ data: [] }),
      ]);

      const maquinasNomes    = ((maqRes.data ?? []) as Array<{ id: string; name: string }>).map(m => m.name);
      const operadoresNomes  = ((opRes.data ?? []) as Array<{ id: string; name: string }>).map(o => o.name);
      const palletsReprovados = (palletsRes.data ?? []) as PalletReprovado[];
      const unidadesPalletsReprovados = palletsReprovados.reduce(
        (s, p) => s + (Number(p.units_per_box) || 0) * (Number(p.boxes_per_pallet) || 0), 0
      );
      const qtdSolicitada = orderRes.data?.qtd_total ?? 0;
      setSaldoOp({
        qtdSolicitada,
        rodadasImpressao, escolhaImpressao, refugoImpressao, boaImpressao,
        rodadasCorteVinco, escolhaCorteVinco, refugoCorteVinco, aprovadoCorteVinco,
        rodadasColagem, escolhaColagem, refugoColagem, aprovadoColagem,
        boasRevisadasColagem, refugoRevisaoColagem,
        rodadasProdutoAcabado, escolhaProdutoAcabado, refugoProdutoAcabado,
        palletsReprovados, totalPallets: totalPallets ?? 0, unidadesPalletsReprovados,
        totalEscolha, totalRefugoAntes, operadoresNomes, maquinasNomes,
      });
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const qtySolicitada           = saldoOp?.qtdSolicitada ?? 0;
  const qtyEnviadaRevisao       = saldoOp?.totalEscolha ?? 0;
  const numPalletsReprovados    = saldoOp?.palletsReprovados?.length ?? 0;
  const qtyRecuperada           = toInt(resultado.qty_recuperada);
  const qtyRefugadaFinal        = toInt(resultado.qty_refugada);
  const totalRefugoAntes        = saldoOp?.totalRefugoAntes ?? 0;
  const perdasTotais            = totalRefugoAntes + qtyRefugadaFinal;
  const qtyBoaProdutoAcabado    = Math.max(0, (saldoOp?.rodadasProdutoAcabado ?? 0) - (saldoOp?.escolhaProdutoAcabado ?? 0) - (saldoOp?.refugoProdutoAcabado ?? 0));
  const unidadesPalletsReprovados = saldoOp?.unidadesPalletsReprovados ?? 0;
  const qtyBoaLimpa             = Math.max(0, (saldoOp?.rodadasProdutoAcabado ?? 0) - (saldoOp?.escolhaProdutoAcabado ?? 0) - (saldoOp?.refugoProdutoAcabado ?? 0));
  const qtyFinalAprovada        = qtyBoaLimpa + qtyRecuperada;
  const saldo                   = qtyFinalAprovada - qtySolicitada;
  const fechouPedido            = saldo >= 0;
  const hasSaldoCalc            = qtySolicitada > 0;
  const totalMinutos            = periodos.reduce((s, p) => s + periodoMinutos(p), 0);
  const totalHomemHora          = periodos.reduce((s, p) => s + (periodoMinutos(p) / 60) * p.qty_pessoas, 0);
  const totalPessoas            = periodos.reduce((s, p) => s + p.qty_pessoas, 0);
  const custoRevisao            = periodos.reduce((s, p) => s + (periodoMinutos(p) / 60) * p.qty_pessoas * toMoney(p.valor_hora), 0);
  const hasData                 = problemas.length > 0 || qtyEnviadaRevisao > 0 || qtyRecuperada > 0 || periodos.length > 0;

  // Step done states
  const stepDone = {
    op:        op.trim().length >= 3,
    problemas: problemas.length > 0 && problemas.every(p => p.setor && p.problema && p.operador_id && p.qty_afetada),
    resultado: qtyEnviadaRevisao > 0 && (qtyRecuperada + qtyRefugadaFinal) === qtyEnviadaRevisao,
    periodos:  totalMinutos > 0,
    status:    statusFinal !== '',
  };

  // Progresso da revisão (barra)
  const pctRevisado = qtyEnviadaRevisao > 0
    ? Math.min(100, Math.round(((qtyRecuperada + qtyRefugadaFinal) / qtyEnviadaRevisao) * 100))
    : 0;

  const statusSugerido: StatusFinal = statusFinal || (
    !fechouPedido && qtySolicitada > 0 ? 'precisa_reimpressao' :
    problemas.length > 0 || numPalletsReprovados > 0 ? 'aprovado_com_restricao' :
    qtySolicitada > 0 ? 'fechou' : ''
  );

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
    if (qtyRecuperada + qtyRefugadaFinal > qtyEnviadaRevisao) {
      showToast(
        `Recuperada + refugada (${fmt(qtyRecuperada + qtyRefugadaFinal)}) não pode ser maior que a escolha recebida (${fmt(qtyEnviadaRevisao)} un.).`,
        'error',
      );
      return;
    }
    if (status === 'finalizado' && qtyEnviadaRevisao > 0 && qtyRecuperada + qtyRefugadaFinal !== qtyEnviadaRevisao) {
      const faltam = qtyEnviadaRevisao - (qtyRecuperada + qtyRefugadaFinal);
      showToast(
        `Para finalizar, a escolha precisa fechar: ${fmt(qtyRecuperada)} recuperada + ${fmt(qtyRefugadaFinal)} refugada = ${fmt(qtyRecuperada + qtyRefugadaFinal)}, mas vieram ${fmt(qtyEnviadaRevisao)} un. (faltam ${fmt(faltam)}). Use "Salvar andamento" se ainda está revisando.`,
        'error',
      );
      return;
    }
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
      problemas.filter(p => p.operador_id)
        .map(p => ({ id: p.operador_id as string, name: operadores.find(o => o.id === p.operador_id)?.name ?? (p.operador_id as string) }))
        .map(o => JSON.stringify(o))
    )].map((s: string) => JSON.parse(s) as { id: string; name: string });

    const defectsPayload = {
      tipo: 'revisao_final_v2',
      session_status: status,
      data_inicio: dataInicio ?? new Date().toISOString(),
      data_atualizacao: new Date().toISOString(),
      problemas: problemas.map(p => ({
        ...p,
        operador_nome: operadores.find(o => o.id === p.operador_id)?.name ?? '',
        maquina_nome: maquinas.find(m => m.id === p.maquina_id)?.name ?? '',
      })),
      setores_envolvidos: setoresEnvolvidos,
      operadores_envolvidos: operadoresEnvolvidos,
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
      periodos,
      total_minutos: totalMinutos,
      total_horas: parseFloat((totalMinutos / 60).toFixed(2)),
      total_pessoas: totalPessoas,
      homem_hora_total: parseFloat(totalHomemHora.toFixed(2)),
      custo_revisao: parseFloat(custoRevisao.toFixed(2)),
      status_final: statusSugerido,
      data_revisao: new Date().toISOString().slice(0, 10),
    };

    const row = {
      op: opName, modulo: 'revisao_final', auxiliar_user_id: user.id,
      qty_revisadas: qtyRevisada, qty_aprovadas: qtyBoa_, qty_reprovadas: qtyRefugada,
      defects: defectsPayload, notes: notes.trim() || null,
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

    if (insertedId && pendingPhotos.length > 0) {
      try {
        await defectPhotoService.uploadMany({ recordId: insertedId, recordTable: 'acabamento_registros', photos: pendingPhotos, userId: user.id });
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
      if (!editingId && insertedId) { setEditingId(insertedId); setDataInicio(new Date().toISOString()); }
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="p-4 md:p-6 pb-28 max-w-4xl mx-auto space-y-4">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-10 rounded-xl bg-teal-100 dark:bg-teal-950/30 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-teal-600">verified</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                Revisão Final
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Fechamento da OP — perdas, origem e resultado final</p>
            </div>
            {profile?.name && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 shrink-0">
                <span className="material-symbols-outlined text-teal-500 text-sm">person</span>
                <span className="text-xs font-bold text-teal-700 dark:text-teal-300">{profile.name}</span>
              </div>
            )}
          </div>

          {/* Step progress — mostra só quando tem OP preenchida */}
          {stepDone.op && (
            <StepProgress steps={[
              { label: 'OP',       done: stepDone.op },
              { label: 'Problemas', done: stepDone.problemas },
              { label: 'Resultado', done: stepDone.resultado },
              { label: 'Horas',     done: stepDone.periodos },
              { label: 'Status',    done: stepDone.status },
            ]} />
          )}
        </header>

        {/* ── Sessões em andamento ──────────────────────────────────────────── */}
        {openSessions.length > 0 && !isEditing && (
          <section className="rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-amber-500 text-base">schedule</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                Sessões em Andamento
              </span>
              <span className="ml-auto text-[9px] font-black bg-amber-200 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                {openSessions.length}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-slate-800 dark:text-white">OP {r.op}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-black uppercase">Em andamento</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {elapsed(inicio)} · {numProblemas} problema{numProblemas !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => restoreFromDefects(def, r)}
                      className="h-8 px-3 rounded-lg bg-amber-500 text-white text-xs font-black hover:bg-amber-600 transition-colors flex items-center gap-1 shrink-0">
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
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <span className="material-symbols-outlined text-amber-500 text-sm">edit_note</span>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
              Continuando OP {op}
              {dataInicio && <span className="font-normal"> · iniciada {elapsed(dataInicio)}</span>}
            </span>
            <button type="button" onClick={handleClear} className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 underline font-bold hover:no-underline">
              Cancelar
            </button>
          </div>
        )}

        {/* ── 1. Identificação ──────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <SectionTitle icon="tag" title="Número da OP" step={1} done={stepDone.op} />
          <input list="rf-op-list" value={op} onChange={e => setOp(e.target.value)}
            placeholder="Ex: 12345"
            className="h-12 w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-base font-black outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-500/10 placeholder:font-normal placeholder:text-slate-400 transition-all" />
          <datalist id="rf-op-list">{opList.map(o => <option key={o} value={o} />)}</datalist>
        </section>

        {/* Rastreio da OP */}
        <OpTraceBanner op={op} moduloAtual="revisao_final" />

        {/* ── Pallets Reprovados ─────────────────────────────────────────────── */}
        {saldoOp && saldoOp.palletsReprovados.length > 0 && (
          <section className="rounded-2xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-rose-500">report</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">
                Pallets Reprovados — revisão necessária
              </span>
              <span className="ml-auto text-xs font-black text-rose-600 dark:text-rose-300">
                {saldoOp.palletsReprovados.length} / {saldoOp.totalPallets} pallets
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
                    <th className="px-3 py-2 text-left hidden sm:table-cell">Analista</th>
                    <th className="px-3 py-2 text-left hidden sm:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100 dark:divide-rose-900/30">
                  {saldoOp.palletsReprovados.map(p => (
                    <tr key={p.id} className="bg-white dark:bg-slate-900/50">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200">#{p.pallet_number}</td>
                      <td className="px-3 py-2 text-center font-black text-rose-600">{p.defects_critical}</td>
                      <td className="px-3 py-2 text-center font-bold text-amber-600">{p.defects_major}</td>
                      <td className="px-3 py-2 text-center font-bold text-slate-500">{p.defects_minor}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{p.analyst_name ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-400 hidden sm:table-cell">{p.completed_at ? new Date(p.completed_at).toLocaleDateString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Histórico por Etapa ─────────────────────────────────────────────── */}
        {saldoOp && (saldoOp.rodadasImpressao > 0 || saldoOp.rodadasCorteVinco > 0 || saldoOp.rodadasColagem > 0 || saldoOp.rodadasProdutoAcabado > 0) && (
          <section className="rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-teal-500">summarize</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-400">
                Histórico por Etapa — OP {op.trim().toUpperCase()}
              </span>
              {saldoOp.qtdSolicitada > 0 && (
                <span className="ml-auto text-[10px] font-black text-teal-600 dark:text-teal-300">
                  Pedido: {fmt(saldoOp.qtdSolicitada)} un.
                </span>
              )}
            </div>
            <div className="rounded-xl overflow-x-auto border border-teal-100 dark:border-teal-900/50 mb-3">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="bg-teal-100/60 dark:bg-teal-900/30 text-[9px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-400">
                    <th className="px-3 py-2 text-left">Etapa</th>
                    <th className="px-3 py-2 text-right text-indigo-500">Recebido</th>
                    <th className="px-3 py-2 text-right text-slate-400">Rodado</th>
                    <th className="px-3 py-2 text-right text-emerald-600">Boas →</th>
                    <th className="px-3 py-2 text-right text-amber-600">Escolha</th>
                    <th className="px-3 py-2 text-right text-rose-500">Refugo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-100 dark:divide-teal-900/30">
                  {saldoOp.rodadasImpressao > 0 && (
                    <tr className="bg-white dark:bg-slate-900/60">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-indigo-400">print</span>Impressão</div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-300 dark:text-slate-600">—</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-400">{fmt(saldoOp.rodadasImpressao)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">{fmt(saldoOp.boaImpressao)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaImpressao)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">{fmt(saldoOp.refugoImpressao)}</td>
                    </tr>
                  )}
                  {saldoOp.rodadasCorteVinco > 0 && (
                    <tr className="bg-white dark:bg-slate-900/60">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-violet-400">content_cut</span>Corte e Vinco</div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-indigo-500">{fmt(saldoOp.boaImpressao)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-400">{fmt(saldoOp.rodadasCorteVinco)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">{fmt(saldoOp.aprovadoCorteVinco)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaCorteVinco)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">{fmt(saldoOp.refugoCorteVinco)}</td>
                    </tr>
                  )}
                  {saldoOp.rodadasColagem > 0 && (
                    <tr className="bg-white dark:bg-slate-900/60">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-amber-400">precision_manufacturing</span>Colagem</div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-indigo-500">{fmt(saldoOp.aprovadoCorteVinco)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-400">{fmt(saldoOp.rodadasColagem)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">{fmt(saldoOp.aprovadoColagem)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaColagem)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">{fmt(saldoOp.refugoColagem)}</td>
                    </tr>
                  )}
                  {saldoOp.rodadasProdutoAcabado > 0 && (
                    <tr className="bg-white dark:bg-slate-900/60">
                      <td className="px-3 py-2 font-black text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-teal-400">inventory_2</span>Produto Acabado</div>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-indigo-500">{fmt(saldoOp.aprovadoColagem)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-400">{fmt(saldoOp.rodadasProdutoAcabado)}</td>
                      <td className="px-3 py-2 text-right font-black text-emerald-600">{fmt(qtyBoaProdutoAcabado)}</td>
                      <td className="px-3 py-2 text-right font-black text-amber-600">{fmt(saldoOp.escolhaProdutoAcabado)}</td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">{fmt(saldoOp.refugoProdutoAcabado)}</td>
                    </tr>
                  )}
                  {(saldoOp.boasRevisadasColagem > 0 || saldoOp.refugoRevisaoColagem > 0) && (
                    <tr className="bg-slate-50 dark:bg-slate-800/40">
                      <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500" colSpan={4}>Escolha já resolvida na Colagem (revisada antes de colar)</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-emerald-600">−{fmt(saldoOp.boasRevisadasColagem)} recuperadas</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-rose-500">−{fmt(saldoOp.refugoRevisaoColagem)} refugo</td>
                    </tr>
                  )}
                  <tr className="bg-amber-50 dark:bg-amber-950/20 font-black">
                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-400" colSpan={4}>Total escolha → Revisão Final</td>
                    <td className="px-3 py-2 text-right text-lg text-amber-700 dark:text-amber-300">{fmt(saldoOp.totalEscolha)}</td>
                    <td className="px-3 py-2 text-right text-sm text-rose-600">{fmt(saldoOp.totalRefugoAntes)}</td>
                  </tr>
                  <tr className="bg-emerald-50 dark:bg-emerald-950/20 font-black">
                    <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400" colSpan={4}>Aprovado direto → Expedição</td>
                    <td className="px-3 py-2 text-right text-lg text-emerald-700 dark:text-emerald-300" colSpan={2}>{fmt(qtyBoaLimpa)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[9px] text-slate-400 italic">
              Cada etapa envia sua escolha à Revisão Final. O que a colagem já revisou antes de colar (boas recuperadas + refugo da revisão) é descontado — só chega aqui a escolha pendente. Pallets reprovados no PA seguem à Revisão Final para inspeção peça a peça.
            </p>
          </section>
        )}

        {/* ── 2. Resultado da Revisão ────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <SectionTitle icon="fact_check" title="Resultado da Revisão" step={2} done={stepDone.resultado}
            subtitle="O que saiu da mesa de revisão?" />

          {/* Barra de progresso */}
          {qtyEnviadaRevisao > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Progresso · {fmt(qtyRecuperada + qtyRefugadaFinal)} de {fmt(qtyEnviadaRevisao)} un. revisadas
                </span>
                <span className={`text-[10px] font-black ${pctRevisado === 100 ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500'}`}>
                  {pctRevisado}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${
                    pctRevisado === 100 ? 'bg-gradient-to-r from-teal-400 to-emerald-400' : 'bg-gradient-to-r from-amber-400 to-orange-400'
                  }`}
                  style={{ width: `${pctRevisado}%` }}
                />
              </div>
              {pctRevisado === 100 && (
                <p className="text-[9px] font-black text-teal-600 dark:text-teal-400 mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-teal-500" style={{ fontSize: 12 }}>check_circle</span>
                  Escolha 100% contabilizada
                </p>
              )}
            </div>
          )}

          {/* Inputs principais — cards grandes */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* BOA */}
            <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/10 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="material-symbols-outlined text-emerald-500 text-sm">thumb_up</span>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Recuperadas (boas)</p>
              </div>
              <input type="number" min="0" placeholder="0"
                value={resultado.qty_recuperada}
                onChange={e => setResultadoField('qty_recuperada', e.target.value)}
                className="w-full h-14 rounded-xl border-0 bg-white dark:bg-slate-900 text-center text-2xl font-black text-emerald-700 dark:text-emerald-300 outline-none focus:ring-2 focus:ring-emerald-400/30 shadow-sm"
              />
              {qtyRecuperada > 0 && <p className="text-[8px] text-emerald-500 text-center mt-1 font-bold">+ {fmt(qtyRecuperada)} un. aprovadas</p>}
            </div>

            {/* REFUGO */}
            <div className="rounded-xl border-2 border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/10 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="material-symbols-outlined text-rose-500 text-sm">delete_forever</span>
                <p className="text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">Refugadas (descarte)</p>
              </div>
              <input type="number" min="0" placeholder="0"
                value={resultado.qty_refugada}
                onChange={e => setResultadoField('qty_refugada', e.target.value)}
                className="w-full h-14 rounded-xl border-0 bg-white dark:bg-slate-900 text-center text-2xl font-black text-rose-600 dark:text-rose-300 outline-none focus:ring-2 focus:ring-rose-400/30 shadow-sm"
              />
              {qtyRefugadaFinal > 0 && <p className="text-[8px] text-rose-500 text-center mt-1 font-bold">{fmt(qtyRefugadaFinal)} un. descartadas</p>}
            </div>
          </div>

          {/* Aviso saldo */}
          {qtyEnviadaRevisao > 0 && (qtyRecuperada + qtyRefugadaFinal) > qtyEnviadaRevisao && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
              <span className="material-symbols-outlined text-rose-500 text-sm">warning</span>
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                Atenção: recuperadas + refugadas ({fmt(qtyRecuperada + qtyRefugadaFinal)}) superam o total enviado ({fmt(qtyEnviadaRevisao)}).
              </span>
            </div>
          )}
        </section>

        {/* ── 2b. Fechamento Final da OP ─────────────────────────────────────── */}
        <section className="rounded-2xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/10 p-4">
          <SectionTitle icon="inventory" title="Fechamento Final da OP" subtitle="Calculado automaticamente" />

          {/* Grid de métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {([
              { label: 'Pedido',                value: fmt(qtySolicitada),                       color: 'slate'   },
              { label: 'Impressão (rodado)',     value: fmt(saldoOp?.rodadasImpressao ?? 0),      color: 'slate'   },
              { label: 'Aprovado direto',        value: fmt(qtyBoaLimpa),                         color: 'emerald' },
              { label: 'Recuperada (revisão)',   value: fmt(qtyRecuperada),                        color: 'emerald' },
              { label: 'Total aprovado',         value: fmt(qtyFinalAprovada),                     color: 'indigo'  },
              { label: 'Refugo da revisão',      value: fmt(qtyRefugadaFinal),                     color: 'rose'    },
              { label: 'Refugo total (etapas)', value: fmt(perdasTotais),                          color: 'rose'    },
              { label: 'Custo revisão',          value: fmtMoney(custoRevisao),                    color: 'slate'   },
            ] as const).map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl p-2.5 border ${
                color === 'emerald' ? 'border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-slate-900' :
                color === 'rose'    ? 'border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-900' :
                color === 'indigo'  ? 'border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/20' :
                'border-teal-100 dark:border-teal-900/50 bg-white dark:bg-slate-900'
              }`}>
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 leading-none">{label}</p>
                <p className={`mt-1 text-base font-black leading-none ${
                  color === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' :
                  color === 'rose'    ? 'text-rose-600 dark:text-rose-300' :
                  color === 'indigo'  ? 'text-indigo-700 dark:text-indigo-300' :
                  'text-slate-800 dark:text-slate-100'
                }`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Banner: fechou ou não */}
          {hasSaldoCalc && (
            <div className={`rounded-xl p-4 border-2 ${
              fechouPedido
                ? 'border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900'
                : 'border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900'
            }`}>
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined text-3xl ${fechouPedido ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {fechouPedido ? 'check_circle' : 'cancel'}
                </span>
                <div>
                  <p className={`text-base font-black uppercase tracking-wide ${fechouPedido ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                    {fechouPedido ? '✓ Deu o pedido' : '✗ Não fechou o pedido'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Pedido: {fmt(qtySolicitada)} · Aprovado: {fmt(qtyFinalAprovada)}
                    {saldo > 0 ? ` · Sobra: +${fmt(saldo)}` : saldo < 0 ? ` · Falta: ${fmt(Math.abs(saldo))}` : ''}
                  </p>
                </div>
                {saldo < 0 && (
                  <div className="ml-auto text-right shrink-0">
                    <p className="text-[9px] font-black uppercase text-rose-500">Reimprimir</p>
                    <p className="text-xl font-black text-rose-600 dark:text-rose-400">{fmt(Math.abs(saldo))}</p>
                    <p className="text-[8px] text-rose-400">unidades</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── 3. Problemas Identificados ────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <SectionTitle icon="report_problem" title="Problemas Identificados" step={3} done={stepDone.problemas}
            subtitle="Um problema por setor envolvido · setor, operador, descrição e quantidade são obrigatórios ao finalizar" />

          <div className="space-y-3">
            {problemas.length === 0 && (
              <div className="py-6 text-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-3xl block mb-1">report_problem</span>
                <p className="text-xs text-slate-400">Nenhum problema adicionado ainda</p>
                <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">Clique em "Adicionar" para registrar</p>
              </div>
            )}
            {problemas.map((p, i) => (
              <ProblemaCard key={p.id} problema={p} operadores={operadores} maquinas={maquinas} index={i}
                onChange={updated => setProblemas(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onRemove={() => setProblemas(prev => prev.filter(x => x.id !== p.id))} />
            ))}
          </div>

          <button type="button"
            onClick={() => setProblemas(prev => [...prev, mkProblema()])}
            className="mt-3 w-full h-11 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs font-black text-slate-400 hover:border-rose-300 hover:text-rose-500 dark:hover:border-rose-800 dark:hover:text-rose-400 transition-colors flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-sm">add_circle</span>
            Adicionar Problema
          </button>
        </section>

        {/* ── 4. Períodos de Revisão ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <SectionTitle icon="schedule" title="Horas de Revisão" step={4} done={stepDone.periodos}
            subtitle="Registre os períodos — pode ser pausada e retomada em outro turno" />

          {/* Totais (visível quando tem dados) */}
          {periodos.length > 0 && totalMinutos > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {([
                { label: 'Tempo total', value: fmtDuracao(totalMinutos), color: 'text-violet-700 dark:text-violet-300' },
                { label: 'Total pessoas',  value: fmt(totalPessoas),    color: 'text-slate-700 dark:text-slate-200' },
                { label: 'Homem-hora',     value: `${totalHomemHora.toFixed(1).replace('.', ',')} HH`, color: 'text-violet-700 dark:text-violet-300' },
              ]).map(({ label, value, color }) => (
                <div key={label} className="rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30 p-2.5 text-center">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                  <p className={`text-sm font-black mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {periodos.length === 0 && (
              <div className="py-5 text-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-3xl block mb-1">schedule</span>
                <p className="text-xs text-slate-400">Nenhum período registrado</p>
              </div>
            )}
            {periodos.map((p, i) => (
              <PeriodoTecnicoCard key={p.id} periodo={p} index={i}
                onChange={updated => setPeriodos(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onRemove={() => setPeriodos(prev => prev.filter(x => x.id !== p.id))} />
            ))}
          </div>

          <button type="button"
            onClick={() => setPeriodos(prev => [...prev, mkPeriodo()])}
            className="mt-3 w-full h-11 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs font-black text-slate-400 hover:border-violet-300 hover:text-violet-500 dark:hover:border-violet-800 dark:hover:text-violet-400 transition-colors flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-sm">add_circle</span>
            Adicionar Período de Revisão
          </button>
        </section>

        {/* ── 5. Status Final ───────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <SectionTitle icon="flag" title="Status Final da OP" step={5} done={stepDone.status}
            subtitle="O sistema sugere automaticamente — confirme ou altere" />

          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPCOES.map(s => {
              const isActive = statusSugerido === s.value;
              return (
                <button key={s.value} type="button"
                  onClick={() => setStatusFinal(statusFinal === s.value ? '' : s.value)}
                  className={`h-14 rounded-xl border-2 text-xs font-black transition-all flex flex-col items-center justify-center gap-0.5 ${isActive ? s.on : s.off}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{s.icon}</span>
                  <span>{s.label}</span>
                  {statusSugerido === s.value && statusFinal !== s.value && (
                    <span className="text-[8px] opacity-60">sugerido</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 6. Observações ────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <SectionTitle icon="notes" title="Observações Gerais" optional />
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Anotações finais, destino do material, decisões tomadas..."
            rows={3}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-teal-500/20 resize-none placeholder:text-slate-400" />
        </section>

        {/* ── Fotos de Defeito ────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <DefectPhotoUpload pendingPhotos={pendingPhotos} onPendingChange={setPendingPhotos} disabled={saving} />
        </section>

        {/* ── Registros Recentes ─────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <SectionTitle icon="history" title="Registros Finalizados" />
          {loadingRecent ? (
            <div className="flex justify-center py-6">
              <div className="size-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
            </div>
          ) : recentRecords.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Nenhum registro finalizado ainda</p>
          ) : (
            <div className="space-y-2">
              {recentRecords.slice(0, 10).map(r => {
                const def = r.defects as Record<string, unknown>;
                const sf = def.status_final as string | undefined;
                const setores = (def.setores_envolvidos as string[] | undefined) ?? [];
                const hh = (def.homem_hora_total as number | undefined) ?? 0;
                const statusOpt = STATUS_OPCOES.find(o => o.value === sf);
                const fechou = (def.fechou_pedido as boolean | undefined);
                return (
                  <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-black text-slate-800 dark:text-white">OP {r.op}</span>
                      {statusOpt && (
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border ${statusOpt.on}`}>
                          {statusOpt.label}
                        </span>
                      )}
                      {fechou !== undefined && (
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                          fechou
                            ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                        }`}>
                          {fechou ? 'Fechou pedido' : 'Não fechou'}
                        </span>
                      )}
                      <span className="text-[9px] text-slate-400 ml-auto shrink-0">
                        {new Date(r.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-1 flex-wrap flex-1 min-w-0">
                        {setores.map(s => {
                          const c = SETOR_COLORS[s];
                          return (
                            <span key={s} className={`text-[8px] px-1.5 py-0.5 rounded font-bold border ${c ? c.inactive : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                              {s}
                            </span>
                          );
                        })}
                      </div>
                      <div className="flex gap-2 shrink-0 text-[9px] text-slate-400">
                        <span>Rev: <strong className="text-slate-600 dark:text-slate-300">{fmt(r.qty_revisadas)}</strong></span>
                        <span>✓ <strong className="text-emerald-600 dark:text-emerald-400">{fmt(r.qty_aprovadas)}</strong></span>
                        {hh > 0 && <span><strong className="text-violet-600 dark:text-violet-400">{hh.toFixed(1).replace('.', ',')}HH</strong></span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* ── Footer fixo ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-4 py-3">
        {/* Progress mini — mostra steps completos no footer */}
        {stepDone.op && (
          <div className="flex items-center gap-1.5 mb-2">
            {Object.values(stepDone).filter(Boolean).length > 0 && (
              <>
                <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 flex-1 overflow-hidden">
                  <div
                    className="h-1 rounded-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-500"
                    style={{ width: `${(Object.values(stepDone).filter(Boolean).length / Object.values(stepDone).length) * 100}%` }}
                  />
                </div>
                <span className="text-[8px] font-black text-slate-400 shrink-0">
                  {Object.values(stepDone).filter(Boolean).length}/{Object.values(stepDone).length}
                </span>
              </>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={handleClear}
            className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0">
            Limpar
          </button>
          <button type="button" onClick={() => save('em_andamento')}
            disabled={saving || !op.trim() || !hasData}
            className="flex-1 h-11 rounded-xl border-2 border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 text-sm font-black hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-sm">pause_circle</span>
            {isEditing ? 'Atualizar' : 'Salvar andamento'}
          </button>
          <button type="button" onClick={() => save('finalizado')}
            disabled={saving || !op.trim() || !hasData}
            className="flex-1 h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm shadow-teal-200 dark:shadow-teal-900/40">
            {saving
              ? <span className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <span className="material-symbols-outlined text-sm">check_circle</span>}
            {saving ? 'Salvando...' : 'Finalizar OP'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AcabamentoRevisaoFinalView;
