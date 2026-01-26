
import React from 'react';

const TIMELINE_STEPS = [
  {
    id: 1,
    name: 'Impressão Off-Set',
    status: 'Concluído',
    time: '08:00 - 10:45',
    machine: 'Heidelberg XL 106',
    metrics: { ok: '12.500', fail: '0' },
    done: true,
    current: false
  },
  {
    id: 2,
    name: 'Verniz UV',
    status: 'Em Processo',
    time: 'Início: 11:05',
    machine: 'Spot UV Master',
    metrics: { ok: '8.200', fail: '42' },
    done: false,
    current: true
  },
  {
    id: 3,
    name: 'Hot Stamping Dourado',
    status: 'Aguardando',
    time: 'Prev: 15:30',
    machine: 'Press-04',
    metrics: null,
    done: false,
    current: false
  }
];

export default function HistoryView() {
  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
      <div className="flex flex-wrap justify-between items-start gap-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-tighter">Ativa</span>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Ordem de Produção</p>
          </div>
          <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-800 dark:text-white">#2023-8842</h1>
          <p className="text-slate-500 text-sm">
            Cliente: <span className="font-bold text-slate-800 dark:text-slate-200">Indústrias Metalúrgicas S.A.</span> |
            Produto: <span className="font-bold text-slate-800 dark:text-slate-200">Embalagem Premium UV</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-5 h-11 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all">
            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">route</span>
            Fluxo de Produção
          </h2>

          <div className="relative pl-8 space-y-6">
            <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-800 border-l-2 border-dashed border-slate-300 dark:border-slate-700"></div>

            {TIMELINE_STEPS.map((step) => (
              <div
                key={step.id}
                className={`relative p-6 rounded-2xl border transition-all ${step.current
                  ? 'border-primary bg-white dark:bg-slate-900 shadow-xl ring-4 ring-primary/5'
                  : step.done
                    ? step.metrics && parseInt(step.metrics.fail) > 0
                      ? 'border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 ring-2 ring-rose-100 dark:ring-rose-900/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-60'
                  }`}
              >
                <div className={`absolute -left-[27px] top-1/2 -translate-y-1/2 size-7 rounded-full border-4 border-background-light dark:border-background-dark flex items-center justify-center ${step.current ? 'bg-primary' : step.done ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}>
                  <span className="material-symbols-outlined text-[14px] text-white font-bold">
                    {step.current ? 'autorenew' : step.done ? 'done' : 'pending'}
                  </span>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`text-lg font-bold ${step.current ? 'text-primary' : 'text-slate-800 dark:text-slate-200'}`}>{step.name}</h4>
                      {step.current && <span className="text-[10px] bg-primary text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">Em Processo</span>}
                    </div>
                    <p className="text-xs text-slate-500">Máquina: {step.machine}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${step.current ? 'text-primary' : 'text-slate-400'}`}>{step.time}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Status: {step.status}</p>
                  </div>
                </div>

                {step.metrics && (
                  <div className="flex gap-4 mt-6">
                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
                      <span className="material-symbols-outlined text-emerald-600 text-sm">check_circle</span>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{step.metrics.ok} OK</span>
                    </div>
                    {parseInt(step.metrics.fail) > 0 && (
                      <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 rounded-lg border border-rose-100 dark:border-rose-900/50">
                        <span className="material-symbols-outlined text-rose-600 text-sm">warning</span>
                        <span className="text-xs font-bold text-rose-700 dark:text-rose-400">{step.metrics.fail} Rejeitos</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-primary text-lg">attach_file</span>
              Documentos da OP
            </h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3 cursor-pointer">
                <div className="size-10 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-500">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div>
                  <p className="text-xs font-bold truncate max-w-[140px]">Ficha_Tecnica_V2.pdf</p>
                  <p className="text-[10px] text-slate-400 uppercase">Especificação</p>
                </div>
              </div>
              <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-3 cursor-pointer">
                <div className="size-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-500">
                  <span className="material-symbols-outlined">image</span>
                </div>
                <div>
                  <p className="text-xs font-bold truncate max-w-[140px]">Layout_Referencia.jpg</p>
                  <p className="text-[10px] text-slate-400 uppercase">Visual</p>
                </div>
              </div>
            </div>
            <button className="w-full mt-6 py-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-400 hover:text-primary hover:border-primary transition-all">
              Ver todos os anexos
            </button>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4 shadow-xl shadow-slate-900/20">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">insights</span>
              Performance Geral
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Eficiência Hoje</span>
                  <span className="font-bold text-emerald-400">99.6%</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[99%]"></div>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-800 flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Yield Final</p>
                  <p className="text-2xl font-black">99.66%</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Estimativa Conclusão</p>
                  <p className="text-sm font-bold">18:45</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
