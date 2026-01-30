
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
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
            Ordem de Produção
          </p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">#2023-8842</h1>
          <p className="text-xs text-slate-500 font-medium">
            Cliente: <span className="font-bold text-slate-700 dark:text-slate-200">Indústrias Metalúrgicas S.A.</span> •
            Produto: <span className="font-bold text-slate-700 dark:text-slate-200">Embalagem Premium UV</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-5 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-all border border-slate-200 dark:border-slate-700">
            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Rastreabilidade</h2>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Fluxo Cronológico de Produção</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-[10px] font-black uppercase text-emerald-600">Ativa Agora</span>
            </div>

            <div className="relative pl-8 space-y-4">
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-200 dark:bg-slate-800"></div>

              {TIMELINE_STEPS.map((step) => (
                <div
                  key={step.id}
                  className={`relative p-5 rounded-2xl border transition-all ${step.current
                    ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/5'
                    : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 group'
                    }`}
                >
                  <div className={`absolute -left-[27px] top-8 size-7 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center shadow-sm ${step.current ? 'bg-primary ring-4 ring-primary/10' : step.done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
                    }`}>
                    <span className="material-symbols-outlined text-[10px] text-white font-black">
                      {step.current ? 'autorenew' : step.done ? 'done' : 'pending'}
                    </span>
                  </div>

                  <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h4 className={`text-sm font-black uppercase tracking-tight ${step.current ? 'text-primary' : 'text-slate-800 dark:text-slate-200'}`}>{step.name}</h4>
                        {step.current && <span className="text-[8px] bg-primary text-white px-2 py-0.5 rounded font-black uppercase tracking-widest animate-pulse">Em Processo</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[14px] text-slate-400">precision_manufacturing</span>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{step.machine}</p>
                      </div>
                    </div>
                    <div className="text-left md:text-right shrink-0">
                      <p className={`text-xs font-black ${step.current ? 'text-primary' : 'text-slate-600 dark:text-slate-400'}`}>{step.time}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{step.status}</p>
                    </div>
                  </div>

                  {step.metrics && (
                    <div className="flex gap-3 mt-4">
                      <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-xl border border-emerald-100/50 dark:border-emerald-900/50">
                        <span className="material-symbols-outlined text-emerald-600 text-sm">check_circle</span>
                        <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">{step.metrics.ok} OK</span>
                      </div>
                      {parseInt(step.metrics.fail) > 0 && (
                        <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 rounded-xl border border-rose-100/50 dark:border-rose-900/50">
                          <span className="material-symbols-outlined text-rose-600 text-sm">warning</span>
                          <span className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">{step.metrics.fail} Rejeitos</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="mb-6">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">attach_file</span>
                Documentos Associados
              </h3>
            </div>
            <div className="space-y-2">
              <div className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center gap-3 cursor-pointer group">
                <div className="size-10 rounded-xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">description</span>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-700 dark:text-slate-200 truncate max-w-[140px] uppercase">Ficha_Tecnica_V2</p>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Especificação • PDF</p>
                </div>
              </div>
              <div className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center gap-3 cursor-pointer group">
                <div className="size-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">image</span>
                </div>
                <div>
                  <p className="text-xs font-black text-slate-700 dark:text-slate-200 truncate max-w-[140px] uppercase">Layout_Ref</p>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Visual • JPG</p>
                </div>
              </div>
            </div>
            <button className="w-full mt-4 py-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-primary hover:border-primary/50 transition-all">
              Ver todos os anexos
            </button>
          </div>

          <div className="bg-slate-900 dark:bg-slate-950 rounded-3xl p-6 text-white space-y-6 shadow-xl shadow-slate-900/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-6xl">insights</span>
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 relative">
              <span className="material-symbols-outlined text-primary text-lg">insights</span>
              Performance Geral
            </h3>
            <div className="space-y-4 relative">
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                  <span className="text-slate-400">Eficiência Hoje</span>
                  <span className="text-emerald-400">99.6%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[99.6%] rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-800 flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-1">Yield Final</p>
                  <p className="text-2xl font-black tracking-tighter">99.66%</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-1">ETA</p>
                  <p className="text-sm font-bold text-primary">18:45</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
