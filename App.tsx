import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ToastProvider, useToast } from './contexts/ToastContext';
import AdminView from './views/AdminView';
import {
  AlertLevel,
  MasterItem,
  ProcessKey,
  QualityPayload,
  QualityRecord,
  QualityStatus,
  ShiftAlert,
  qualityService,
} from './services/qualityService';

type ViewKey = 'dashboard' | 'new' | 'trace' | 'alerts' | 'admin';

interface SessionUser {
  id: string;
  email?: string;
  user_metadata?: { name?: string; full_name?: string };
}

interface MasterData {
  machines: MasterItem[];
  operators: MasterItem[];
  analysts: MasterItem[];
}

interface WizardState {
  op: string;
  process: ProcessKey;
  shift: string;
  machineId: string;
  operatorId: string;
  analystId: string;
  status: QualityStatus;
  samples: number;
  rejected: number;
  notes: string;
  defects: Record<string, number>;
  metrics: Record<string, number | string>;
  product: Record<string, string | number>;
  physicalTests: Record<string, { found: string; limit: string }>;
  nbr: {
    lotSize: number;
    critical: Record<string, number>;
    major: Record<string, number>;
    minor: Record<string, number>;
  };
}

const PROCESS_CONFIG: Record<ProcessKey, {
  label: string;
  sector: QualityPayload['sector'];
  icon: string;
  color: string;
  defects: Array<{ key: string; label: string }>;
}> = {
  OFFSET: {
    label: 'Off-set',
    sector: 'START_PRODUCTION',
    icon: 'print',
    color: 'bg-blue-600',
    defects: [
      { key: 'cor', label: 'Cor' },
      { key: 'manchas', label: 'Manchas' },
      { key: 'pintas', label: 'Pintas' },
      { key: 'fiapos', label: 'Fiapos' },
      { key: 'registro', label: 'Registro' },
      { key: 'falha_verniz', label: 'Falha verniz' },
      { key: 'falha_texto', label: 'Falha texto' },
      { key: 'texto_fechado', label: 'Texto fechado' },
    ],
  },
  ESCOLHAS: {
    label: 'Escolhas',
    sector: 'START_PRODUCTION',
    icon: 'content_paste_search',
    color: 'bg-amber-600',
    defects: [],
  },
  UV: {
    label: 'UV',
    sector: 'START_PRODUCTION',
    icon: 'flare',
    color: 'bg-emerald-600',
    defects: [
      { key: 'cor', label: 'Cor' },
      { key: 'registro', label: 'Registro' },
      { key: 'falha_verniz', label: 'Falha verniz' },
      { key: 'acabamento_aspero', label: 'Acabamento aspero' },
    ],
  },
  HOT_STAMPING: {
    label: 'Hot Stamping',
    sector: 'START_PRODUCTION',
    icon: 'local_fire_department',
    color: 'bg-rose-600',
    defects: [
      { key: 'falha', label: 'Falha' },
      { key: 'registro', label: 'Registro' },
      { key: 'entupimento_texto', label: 'Entupimento de texto' },
      { key: 'ausencia', label: 'Ausencia' },
    ],
  },
  FINISHED_REPORT: {
    label: 'Laudo FORM 058',
    sector: 'FINISHED_PRODUCT',
    icon: 'verified',
    color: 'bg-violet-600',
    defects: [
      { key: 'observacao_visual', label: 'Ocorrencia visual' },
      { key: 'falha_acabamento', label: 'Falha acabamento' },
      { key: 'divergencia_medida', label: 'Divergencia medida' },
    ],
  },
  NBR_6425: {
    label: 'NBR 6425',
    sector: 'FINISHED_PRODUCT',
    icon: 'rule',
    color: 'bg-slate-700',
    defects: [],
  },
};

const STATUS_META: Record<QualityStatus, { label: string; className: string; dot: string }> = {
  APPROVED: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  RESTRICTED: { label: 'Aprovado c/ restricao', className: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  REJECTED: { label: 'Reprovado', className: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
};

const emptyWizard = (): WizardState => ({
  op: '',
  process: 'OFFSET',
  shift: getShift(),
  machineId: '',
  operatorId: '',
  analystId: '',
  status: 'APPROVED',
  samples: 5,
  rejected: 0,
  notes: '',
  defects: {},
  metrics: {
    op_total_unidades: 0,
    folhas_impressas_total: 0,
    folhas_revisadas_pilha: 0,
    escolhas_unidades: 0,
  },
  product: {
    cliente: '',
    codigo_produto: '',
    descricao_material: '',
    desenho_tecnico: '',
    versao: '',
    numero_facas: '',
    cartao: '',
    quantidade_total: 0,
    quantidade_analisada: 0,
    numero_laudo: '',
  },
  physicalTests: {
    espessura: { found: '', limit: '' },
    gramatura: { found: '', limit: '' },
    comprimento: { found: '', limit: '' },
    largura: { found: '', limit: '' },
    altura: { found: '', limit: '' },
  },
  nbr: {
    lotSize: 0,
    critical: { colagem_incorreta: 0, pingo_cola: 0 },
    major: { impressao_fora_registro: 0, vinco: 0, hot_stamping_descentralizado: 0, cor_fora_padrao: 0 },
    minor: { mancha: 0, pintas: 0, decalque: 0, relevo_descentralizado: 0, hot_stamping_descentralizado: 0 },
  },
});

function getShift() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Manha';
  if (hour >= 14 && hour < 22) return 'Tarde';
  return 'Noite';
}

function totalValues(values: Record<string, number>) {
  return Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0);
}

function calculateNbrSample(lotSize: number) {
  if (lotSize <= 0) return 0;
  if (lotSize <= 500) return 32;
  if (lotSize <= 1200) return 50;
  if (lotSize <= 3200) return 80;
  if (lotSize <= 10000) return 125;
  return 200;
}

function calculateStatus(state: WizardState): QualityStatus {
  if (state.process === 'NBR_6425') {
    const critical = totalValues(state.nbr.critical);
    const major = totalValues(state.nbr.major);
    const minor = totalValues(state.nbr.minor);
    if (critical > 0 || major > 7 || minor > 14) return 'REJECTED';
    if (major > 0 || minor > 0) return 'RESTRICTED';
    return 'APPROVED';
  }
  if (state.process === 'ESCOLHAS') return state.status;
  if (state.rejected > 0 || totalValues(state.defects) > 0) return state.status === 'APPROVED' ? 'RESTRICTED' : state.status;
  return state.status;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LoginScreen() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await qualityService.signIn(email, password);
      if (error) throw error;
      showToast('Sessao iniciada', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao entrar', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        <div className="text-center space-y-2">
          <img src="/logo-full.png" alt="Kingraf" className="h-20 mx-auto object-contain" />
          <h1 className="text-xl font-black text-slate-900">Controle de Qualidade</h1>
          <p className="text-sm text-slate-500">Acesso operacional por analista ou supervisor</p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-slate-500">E-mail</span>
          <input className="w-full h-12 rounded-lg border border-slate-200 px-3 outline-none focus:ring-2 focus:ring-primary/20" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-slate-500">Senha</span>
          <input className="w-full h-12 rounded-lg border border-slate-200 px-3 outline-none focus:ring-2 focus:ring-primary/20" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button disabled={loading} className="w-full h-12 rounded-lg bg-primary text-white font-black uppercase text-xs tracking-wider disabled:opacity-60">
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}

function Navigation({ active, onChange, onLogout }: { active: ViewKey; onChange: (view: ViewKey) => void; onLogout: () => void }) {
  const items: Array<{ key: ViewKey; label: string; icon: string }> = [
    { key: 'dashboard', label: 'Painel', icon: 'dashboard' },
    { key: 'new', label: 'Nova analise', icon: 'add_task' },
    { key: 'trace', label: 'OPs', icon: 'manage_search' },
    { key: 'alerts', label: 'Alertas', icon: 'campaign' },
    { key: 'admin', label: 'Cadastros', icon: 'tune' },
  ];

  return (
    <aside className="w-full md:w-64 bg-white border-r border-slate-200 md:min-h-screen p-3 flex md:flex-col gap-2">
      <div className="hidden md:flex items-center gap-3 p-3 mb-2 border-b border-slate-100">
        <img src="/logo-symbol.png" alt="K" className="size-12 object-contain" />
        <div>
          <p className="font-black text-slate-900 leading-none">Qualidade</p>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Por OP</p>
        </div>
      </div>
      <nav className="flex md:flex-col gap-2 overflow-x-auto flex-1">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`h-11 px-3 rounded-lg flex items-center gap-2 whitespace-nowrap text-sm font-bold transition-colors ${active === item.key ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <button onClick={onLogout} className="h-11 px-3 rounded-lg flex items-center gap-2 text-sm font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600">
        <span className="material-symbols-outlined text-xl">logout</span>
        <span className="hidden md:inline">Sair</span>
      </button>
    </aside>
  );
}

function StatusBadge({ status }: { status: QualityStatus }) {
  const meta = STATUS_META[status] || STATUS_META.IN_PROGRESS;
  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${meta.className}`}>
      <span className={`size-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function Dashboard({ records, alerts, onOpenNew }: { records: QualityRecord[]; alerts: ShiftAlert[]; onOpenNew: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const todaysRecords = records.filter((record) => record.created_at.slice(0, 10) === today);
  const approved = records.filter((record) => record.status === 'APPROVED').length;
  const rejected = records.filter((record) => record.status === 'REJECTED').length;
  const restricted = records.filter((record) => record.status === 'RESTRICTED').length;
  const approvalRate = records.length ? Math.round((approved / records.length) * 100) : 0;
  const activeAlerts = alerts.filter((alert) => alert.type !== 'info');

  const processCounts = Object.values(PROCESS_CONFIG).map((config) => ({
    label: config.label,
    count: records.filter((record) => record.payload?.process_label === config.label).length,
  }));

  return (
    <section className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-primary">Tempo real</p>
          <h1 className="text-2xl font-black text-slate-900">Painel de controle por OP</h1>
          <p className="text-sm text-slate-500">Status, alertas e rastreabilidade em uma tela operacional.</p>
        </div>
        <button onClick={onOpenNew} className="h-12 px-5 rounded-lg bg-primary text-white font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2">
          <span className="material-symbols-outlined">add</span>
          Nova analise
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <MetricCard label="Hoje" value={todaysRecords.length} icon="today" tone="bg-blue-600" />
        <MetricCard label="Total" value={records.length} icon="inventory_2" tone="bg-slate-700" />
        <MetricCard label="Aprovacao" value={`${approvalRate}%`} icon="check_circle" tone="bg-emerald-600" />
        <MetricCard label="Restricao" value={restricted} icon="warning" tone="bg-amber-600" />
        <MetricCard label="Reprovadas" value={rejected} icon="cancel" tone="bg-rose-600" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-slate-900">Ultimas OPs</h2>
            <span className="text-xs font-bold text-slate-400">{records.length} registros</span>
          </div>
          <div className="space-y-2">
            {records.slice(0, 8).map((record) => (
              <React.Fragment key={record.id}>
                <RecordRow record={record} />
              </React.Fragment>
            ))}
            {records.length === 0 && <EmptyState label="Nenhuma analise registrada ainda." />}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-black text-slate-900">Alertas ativos</h2>
          {activeAlerts.slice(0, 6).map((alert) => (
            <div key={alert.id} className={`p-3 rounded-xl border ${alert.type === 'critical' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
              <p className="text-[10px] font-black uppercase text-slate-400">{alert.op ? `OP ${alert.op}` : 'Sem OP'}</p>
              <p className="text-sm font-bold text-slate-800">{alert.content}</p>
            </div>
          ))}
          {activeAlerts.length === 0 && <EmptyState label="Sem alertas abertos." />}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="font-black text-slate-900 mb-4">Volume por processo</h2>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {processCounts.map((item) => (
            <div key={item.label} className="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-[10px] font-black uppercase text-slate-400">{item.label}</p>
              <p className="text-2xl font-black text-slate-900">{item.count}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string | number; icon: string; tone: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
      <div className={`size-11 rounded-xl ${tone} text-white flex items-center justify-center`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="text-xl font-black text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function RecordRow({ record }: { record: QualityRecord }) {
  const config = record.payload ? PROCESS_CONFIG[record.payload.process] : null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`size-8 rounded-lg ${config?.color || 'bg-slate-600'} text-white flex items-center justify-center shrink-0`}>
            <span className="material-symbols-outlined text-base">{config?.icon || 'assignment'}</span>
          </span>
          <div className="min-w-0">
            <p className="font-black text-slate-900 truncate">OP {record.op}</p>
            <p className="text-xs text-slate-500 truncate">{record.payload?.process_label || 'Registro'} - {record.machines?.name || 'Sem maquina'}</p>
          </div>
        </div>
      </div>
      <StatusBadge status={record.status} />
      <p className="text-xs font-bold text-slate-400 md:text-right">{formatDate(record.created_at)}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="min-h-28 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-400 text-center p-4">
      {label}
    </div>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
      <span className="text-sm font-black uppercase text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="size-12 rounded-lg bg-slate-100 text-slate-700 text-2xl font-black">-</button>
        <span className="w-10 text-center text-xl font-black text-slate-900">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} className="size-12 rounded-lg bg-primary text-white text-2xl font-black">+</button>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      <input type="number" min={0} value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} className="w-full h-12 rounded-lg border border-slate-200 px-3 font-bold outline-none focus:ring-2 focus:ring-primary/20" />
    </label>
  );
}

function WizardView({ master, user, initialOp, onSaved }: { master: MasterData; user: SessionUser; initialOp: string; onSaved: () => void }) {
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(emptyWizard);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState((current) => ({
      ...current,
      machineId: current.machineId || master.machines[0]?.id || '',
      operatorId: current.operatorId || master.operators[0]?.id || '',
      analystId: current.analystId || master.analysts[0]?.id || '',
    }));
  }, [master]);

  useEffect(() => {
    if (!initialOp) return;
    setState((current) => ({ ...current, op: initialOp.toUpperCase() }));
  }, [initialOp]);

  const config = PROCESS_CONFIG[state.process];
  const calculatedStatus = calculateStatus(state);
  const steps = ['OP', 'Equipe', 'Qualidade', 'Confirmar'];
  const canSubmit = state.op.trim() && state.machineId && state.operatorId && state.analystId;

  const updateDefect = (key: string, value: number) => {
    setState((current) => ({ ...current, defects: { ...current.defects, [key]: value } }));
  };

  const save = async () => {
    if (!canSubmit) {
      showToast('Preencha OP, maquina, operador e analista.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const status = calculatedStatus;
      const payload: QualityPayload = {
        schema_version: 2,
        op: state.op.trim().toUpperCase(),
        process: state.process,
        process_label: config.label,
        sector: config.sector,
        shift: state.shift,
        status,
        defects: state.defects,
        metrics: state.metrics,
        product: state.product,
        physical_tests: state.physicalTests,
        nbr: {
          lot_size: state.nbr.lotSize,
          sample_size: calculateNbrSample(state.nbr.lotSize),
          critical: state.nbr.critical,
          major: state.nbr.major,
          minor: state.nbr.minor,
        },
        notes: state.notes,
        all_operator_ids: [state.operatorId],
        all_analyst_ids: [state.analystId],
      };

      await qualityService.createRecord({
        op: payload.op,
        machineId: state.machineId,
        operatorIds: [state.operatorId],
        analystIds: [state.analystId],
        status,
        samplesCount: state.process === 'NBR_6425' ? calculateNbrSample(state.nbr.lotSize) : state.samples,
        rejectedCount: state.rejected,
        payload,
      });

      if (status === 'REJECTED') {
        await qualityService.createAlert({
          op: payload.op,
          level: 'critical',
          message: `${config.label} reprovado automaticamente. Verificar OP.`,
          userId: user.id,
          userEmail: user.email || 'sem-email',
        });
      }

      showToast('Analise registrada', 'success');
      setState(emptyWizard());
      setStep(0);
      onSaved();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-primary">Wizard operacional</p>
        <h1 className="text-2xl font-black text-slate-900">Nova analise de qualidade</h1>
        <div className="grid grid-cols-4 gap-2 mt-5">
          {steps.map((label, index) => (
            <div key={label} className={`h-2 rounded-full ${index <= step ? 'bg-primary' : 'bg-slate-200'}`} title={label} />
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 min-h-[460px]">
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-xl font-black text-slate-900">Qual OP e processo?</h2>
            <label className="block space-y-1">
              <span className="text-xs font-black uppercase text-slate-500">Ordem de Producao</span>
              <input value={state.op} onChange={(event) => setState({ ...state, op: event.target.value.toUpperCase() })} placeholder="Ex: 12345" className="w-full h-16 rounded-xl border border-slate-200 px-4 text-2xl font-black outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(Object.keys(PROCESS_CONFIG) as ProcessKey[]).map((key) => {
                const item = PROCESS_CONFIG[key];
                const active = state.process === key;
                return (
                  <button key={key} type="button" onClick={() => setState({ ...state, process: key, defects: {}, status: 'APPROVED' })} className={`p-4 rounded-xl border text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className={`size-10 rounded-lg ${item.color} text-white flex items-center justify-center mb-3`}>
                      <span className="material-symbols-outlined">{item.icon}</span>
                    </span>
                    <span className="font-black text-slate-900">{item.label}</span>
                    <p className="text-xs text-slate-500">{item.sector === 'START_PRODUCTION' ? 'Inicio de producao' : 'Produto acabado'}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-xl font-black text-slate-900">Quem esta analisando?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SelectField label="Maquina" value={state.machineId} items={master.machines} onChange={(value) => setState({ ...state, machineId: value })} />
              <SelectField label="Operador" value={state.operatorId} items={master.operators} onChange={(value) => setState({ ...state, operatorId: value })} />
              <SelectField label="Analista" value={state.analystId} items={master.analysts} onChange={(value) => setState({ ...state, analystId: value })} />
            </div>
            <div className="grid grid-cols-3 gap-3 max-w-lg">
              {['Manha', 'Tarde', 'Noite'].map((shift) => (
                <button key={shift} type="button" onClick={() => setState({ ...state, shift })} className={`h-14 rounded-xl font-black ${state.shift === shift ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>{shift}</button>
              ))}
            </div>
            {(master.machines.length === 0 || master.operators.length === 0 || master.analysts.length === 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                Cadastre maquina, operador e analista na aba Cadastros antes de enviar uma analise.
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <QualityStep state={state} setState={setState} updateDefect={updateDefect} />
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-xl font-black text-slate-900">Conferir antes de enviar</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SummaryItem label="OP" value={state.op || '-'} />
              <SummaryItem label="Processo" value={config.label} />
              <SummaryItem label="Turno" value={state.shift} />
              <SummaryItem label="Amostras" value={state.process === 'NBR_6425' ? calculateNbrSample(state.nbr.lotSize) : state.samples} />
              <SummaryItem label="Defeitos" value={state.process === 'NBR_6425' ? totalValues(state.nbr.critical) + totalValues(state.nbr.major) + totalValues(state.nbr.minor) : totalValues(state.defects)} />
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Status calculado</p>
                <StatusBadge status={calculatedStatus} />
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-black uppercase text-slate-500">Observacoes</span>
              <textarea value={state.notes} onChange={(event) => setState({ ...state, notes: event.target.value })} className="w-full h-28 rounded-xl border border-slate-200 p-3 outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
          </div>
        )}
      </div>

      <footer className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row justify-between gap-3">
        <button type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} className="h-12 px-5 rounded-lg bg-slate-100 text-slate-700 font-black uppercase text-xs disabled:opacity-40">
          Voltar
        </button>
        {step < 3 ? (
          <button type="button" onClick={() => setStep((current) => Math.min(3, current + 1))} className="h-12 px-6 rounded-lg bg-primary text-white font-black uppercase text-xs">
            Avancar
          </button>
        ) : (
          <button type="button" disabled={saving || !canSubmit} onClick={save} className="h-12 px-6 rounded-lg bg-emerald-600 text-white font-black uppercase text-xs disabled:opacity-50">
            {saving ? 'Salvando...' : 'Confirmar envio'}
          </button>
        )}
      </footer>
    </section>
  );
}

function SelectField({ label, value, items, onChange }: { label: string; value: string; items: MasterItem[]; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-black uppercase text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full h-12 rounded-lg border border-slate-200 px-3 font-bold outline-none focus:ring-2 focus:ring-primary/20">
        <option value="">Selecionar</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
  );
}

function QualityStep({ state, setState, updateDefect }: { state: WizardState; setState: (state: WizardState) => void; updateDefect: (key: string, value: number) => void }) {
  const config = PROCESS_CONFIG[state.process];

  if (state.process === 'ESCOLHAS') {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-black text-slate-900">Quantidades de escolha</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricNumber state={state} setState={setState} field="op_total_unidades" label="OP total em unidades" />
          <MetricNumber state={state} setState={setState} field="folhas_impressas_total" label="Folhas impressas" />
          <MetricNumber state={state} setState={setState} field="folhas_revisadas_pilha" label="Folhas revisadas na pilha" />
          <MetricNumber state={state} setState={setState} field="escolhas_unidades" label="Escolhas em unidades" />
        </div>
        <StatusPicker value={state.status} onChange={(status) => setState({ ...state, status })} includeInProgress />
      </div>
    );
  }

  if (state.process === 'FINISHED_REPORT') {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-black text-slate-900">Laudo de produto acabado</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.keys(state.product).map((field) => (
            <label key={field} className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{field.replace(/_/g, ' ')}</span>
              <input value={String(state.product[field] ?? '')} onChange={(event) => setState({ ...state, product: { ...state.product, [field]: event.target.value } })} className="w-full h-12 rounded-lg border border-slate-200 px-3 font-bold outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {Object.entries(state.physicalTests).map(([key, value]) => (
            <div key={key} className="rounded-xl border border-slate-200 p-3 space-y-2">
              <p className="text-[10px] font-black uppercase text-slate-500">{key}</p>
              <input placeholder="Encontrado" value={value.found} onChange={(event) => setState({ ...state, physicalTests: { ...state.physicalTests, [key]: { ...value, found: event.target.value } } })} className="w-full h-10 rounded-lg border border-slate-200 px-2 text-sm" />
              <input placeholder="Limite" value={value.limit} onChange={(event) => setState({ ...state, physicalTests: { ...state.physicalTests, [key]: { ...value, limit: event.target.value } } })} className="w-full h-10 rounded-lg border border-slate-200 px-2 text-sm" />
            </div>
          ))}
        </div>
        <DefectGrid defects={config.defects} values={state.defects} onChange={updateDefect} />
        <StatusPicker value={state.status} onChange={(status) => setState({ ...state, status })} />
      </div>
    );
  }

  if (state.process === 'NBR_6425') {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-black text-slate-900">Analise por classe de defeito</h2>
        <NumberField label="Tamanho do lote" value={state.nbr.lotSize} onChange={(lotSize) => setState({ ...state, nbr: { ...state.nbr, lotSize } })} />
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-xs font-black uppercase text-slate-500">Amostra calculada</p>
          <p className="text-3xl font-black text-slate-900">{calculateNbrSample(state.nbr.lotSize)}</p>
        </div>
        <NbrClass title="Critico" values={state.nbr.critical} onChange={(critical) => setState({ ...state, nbr: { ...state.nbr, critical } })} />
        <NbrClass title="Maior" values={state.nbr.major} onChange={(major) => setState({ ...state, nbr: { ...state.nbr, major } })} />
        <NbrClass title="Menor" values={state.nbr.minor} onChange={(minor) => setState({ ...state, nbr: { ...state.nbr, minor } })} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black text-slate-900">Registrar desvios</h2>
      <DefectGrid defects={config.defects} values={state.defects} onChange={updateDefect} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <NumberField label="Cartuchos reprovados" value={state.rejected} onChange={(rejected) => setState({ ...state, rejected })} />
        <NumberField label="Total de amostras" value={state.samples} onChange={(samples) => setState({ ...state, samples })} />
      </div>
      <StatusPicker value={state.status} onChange={(status) => setState({ ...state, status })} />
    </div>
  );
}

function MetricNumber({ state, setState, field, label }: { state: WizardState; setState: (state: WizardState) => void; field: string; label: string }) {
  return <NumberField label={label} value={Number(state.metrics[field] || 0)} onChange={(value) => setState({ ...state, metrics: { ...state.metrics, [field]: value } })} />;
}

function DefectGrid({ defects, values, onChange }: { defects: Array<{ key: string; label: string }>; values: Record<string, number>; onChange: (key: string, value: number) => void }) {
  if (defects.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {defects.map((defect) => (
        <React.Fragment key={defect.key}>
          <Counter label={defect.label} value={values[defect.key] || 0} onChange={(value) => onChange(defect.key, value)} />
        </React.Fragment>
      ))}
    </div>
  );
}

function StatusPicker({ value, onChange, includeInProgress = false }: { value: QualityStatus; onChange: (status: QualityStatus) => void; includeInProgress?: boolean }) {
  const statuses: QualityStatus[] = includeInProgress ? ['APPROVED', 'RESTRICTED', 'REJECTED', 'IN_PROGRESS'] : ['APPROVED', 'RESTRICTED', 'REJECTED'];
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {statuses.map((status) => (
        <button key={status} type="button" onClick={() => onChange(status)} className={`h-14 rounded-xl border font-black uppercase text-xs ${value === status ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-500'}`}>
          {STATUS_META[status].label}
        </button>
      ))}
    </div>
  );
}

function NbrClass({ title, values, onChange }: { title: string; values: Record<string, number>; onChange: (values: Record<string, number>) => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
      <h3 className="font-black text-slate-900">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(values).map(([key, value]) => (
          <React.Fragment key={key}>
            <Counter label={key.replace(/_/g, ' ')} value={value} onChange={(next) => onChange({ ...values, [key]: next })} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-lg font-black text-slate-900">{value}</p>
    </div>
  );
}

function TraceabilityView({ records, onNewFromOp }: { records: QualityRecord[]; onNewFromOp: (op: string) => void }) {
  const [query, setQuery] = useState('');
  const filtered = records.filter((record) => record.op.toLowerCase().includes(query.toLowerCase()));
  const grouped = filtered.reduce<Record<string, QualityRecord[]>>((map, record) => {
    map[record.op] = [...(map[record.op] || []), record];
    return map;
  }, {});

  return (
    <section className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-primary">Rastreabilidade</p>
        <h1 className="text-2xl font-black text-slate-900">Linha do tempo por OP</h1>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar OP" className="mt-4 w-full max-w-md h-12 rounded-lg border border-slate-200 px-3 font-bold outline-none focus:ring-2 focus:ring-primary/20" />
      </div>
      <div className="space-y-4">
        {Object.entries(grouped).map(([op, opRecords]) => (
          <div key={op} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">OP {op}</h2>
                <p className="text-xs text-slate-500 font-bold">{opRecords.length} etapa(s) registrada(s)</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => onNewFromOp(op)} className="h-10 px-4 rounded-lg bg-primary text-white font-black uppercase text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">add_task</span>
                  Nova etapa
                </button>
                <button onClick={() => copyOpLink(op)} className="h-10 px-4 rounded-lg bg-slate-100 text-slate-700 font-black uppercase text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">link</span>
                  Copiar link da OP
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {opRecords.map((record) => (
                <React.Fragment key={record.id}>
                  <RecordRow record={record} />
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && <EmptyState label="Nenhuma OP encontrada." />}
      </div>
    </section>
  );
}

function copyOpLink(op: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('view', 'new');
  url.searchParams.set('op', op);
  navigator.clipboard?.writeText(url.toString());
}

function AlertsView({ alerts, user, onCreated }: { alerts: ShiftAlert[]; user: SessionUser; onCreated: () => void }) {
  const { showToast } = useToast();
  const [op, setOp] = useState('');
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<AlertLevel>('alert');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!op.trim() || !message.trim()) {
      showToast('Informe OP e mensagem.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await qualityService.createAlert({ op: op.trim().toUpperCase(), message, level, userId: user.id, userEmail: user.email || 'sem-email' });
      setOp('');
      setMessage('');
      onCreated();
      showToast('Alerta criado', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao criar alerta', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 h-fit">
        <h1 className="text-2xl font-black text-slate-900">Novo alerta</h1>
        <input value={op} onChange={(event) => setOp(event.target.value.toUpperCase())} placeholder="OP" className="w-full h-12 rounded-lg border border-slate-200 px-3 font-bold" />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setLevel('alert')} className={`h-12 rounded-lg font-black ${level === 'alert' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>Atencao</button>
          <button type="button" onClick={() => setLevel('critical')} className={`h-12 rounded-lg font-black ${level === 'critical' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Urgente</button>
        </div>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Descreva a ocorrencia" className="w-full h-32 rounded-lg border border-slate-200 p-3" />
        <button disabled={saving} className="w-full h-12 rounded-lg bg-primary text-white font-black uppercase text-xs disabled:opacity-50">{saving ? 'Enviando...' : 'Criar alerta'}</button>
      </form>
      <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-xl font-black text-slate-900">Historico de alertas</h2>
        {alerts.map((alert) => (
          <div key={alert.id} className={`p-4 rounded-xl border ${alert.type === 'critical' ? 'bg-rose-50 border-rose-100' : alert.type === 'alert' ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{alert.op ? `OP ${alert.op}` : 'Sem OP'} - {alert.shift}</p>
              <p className="text-[10px] font-bold text-slate-400">{formatDate(alert.created_at)}</p>
            </div>
            <p className="font-bold text-slate-900">{alert.content}</p>
            <p className="text-xs text-slate-500">{alert.user_email}</p>
          </div>
        ))}
        {alerts.length === 0 && <EmptyState label="Nenhum alerta criado." />}
      </div>
    </section>
  );
}



function AppShell({ user }: { user: SessionUser }) {
  const { showToast } = useToast();
  const initialParams = new URLSearchParams(window.location.search);
  const initialView = initialParams.get('view') as ViewKey | null;
  const [view, setView] = useState<ViewKey>(initialView && ['dashboard', 'new', 'trace', 'alerts', 'admin'].includes(initialView) ? initialView : 'dashboard');
  const [draftOp, setDraftOp] = useState(initialParams.get('op')?.toUpperCase() || '');
  const [records, setRecords] = useState<QualityRecord[]>([]);
  const [alerts, setAlerts] = useState<ShiftAlert[]>([]);
  const [master, setMaster] = useState<MasterData>({ machines: [], operators: [], analysts: [] });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [recordsData, alertsData, masterData] = await Promise.all([
        qualityService.listRecords(),
        qualityService.listAlerts(),
        qualityService.getMasterData(),
      ]);
      setRecords(recordsData);
      setAlerts(alertsData);
      setMaster(masterData);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = async () => {
    await qualityService.signOut();
  };

  const openNewFromOp = (op = '') => {
    setDraftOp(op.toUpperCase());
    setView('new');
  };

  const content = useMemo(() => {
    if (loading) return <div className="h-96 flex items-center justify-center text-slate-400 font-bold">Carregando...</div>;
    if (view === 'dashboard') return <Dashboard records={records} alerts={alerts} onOpenNew={() => openNewFromOp()} />;
    if (view === 'new') return <WizardView master={master} user={user} initialOp={draftOp} onSaved={refresh} />;
    if (view === 'trace') return <TraceabilityView records={records} onNewFromOp={openNewFromOp} />;
    if (view === 'alerts') return <AlertsView alerts={alerts} user={user} onCreated={refresh} />;
    return <AdminView />;
  }, [alerts, draftOp, loading, master, records, refresh, user, view]);

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      <Navigation active={view} onChange={setView} onLogout={logout} />
      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        {content}
      </main>
    </div>
  );
}

function RootApp() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    qualityService.getCurrentUser().then((currentUser) => {
      setUser(currentUser as SessionUser | null);
      setLoading(false);
    });
    const { data: { subscription } } = qualityService.onAuthStateChange(async (_event, session) => {
      setUser((session?.user as SessionUser | undefined) || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-400 font-bold">Carregando...</div>;
  }

  return user ? <AppShell user={user} /> : <LoginScreen />;
}

export default function App() {
  return (
    <ToastProvider>
      <RootApp />
    </ToastProvider>
  );
}
