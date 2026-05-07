
import React from 'react';

type DefectCounterVariant = 'amber' | 'rose';

interface DefectCounterProps {
  name: string;
  icon: string;
  count: number;
  onUpdate: (delta: number) => void;
  onSet: (val: number) => void;
  variant?: DefectCounterVariant;
}

const ACTIVE_CLASSES: Record<DefectCounterVariant, string> = {
  amber: 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20',
  rose:  'border-rose-300  dark:border-rose-700  bg-rose-50/50  dark:bg-rose-950/20',
};

const DefectCounter: React.FC<DefectCounterProps> = ({
  name,
  icon,
  count,
  onUpdate,
  onSet,
  variant = 'amber',
}) => (
  <div
    className={`flex items-center justify-between p-2 rounded-xl border transition-all bg-white dark:bg-slate-900/50 group ${
      count > 0 ? ACTIVE_CLASSES[variant] : 'border-slate-100 dark:border-slate-800'
    }`}
  >
    <div className="flex items-center gap-2 overflow-hidden">
      <span className="material-symbols-outlined text-base text-primary p-1">{icon}</span>
      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase truncate">{name}</span>
    </div>
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onUpdate(-1)}
        className="size-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"
      >
        <span className="material-symbols-outlined text-sm">remove</span>
      </button>
      <input
        type="number"
        value={count || ''}
        onChange={(e) => onSet(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-10 h-6 text-center font-black text-[11px] bg-slate-50 dark:bg-slate-800 rounded border-none outline-none focus:ring-1 focus:ring-primary/30"
        placeholder="0"
      />
      <button
        type="button"
        onClick={() => onUpdate(1)}
        className="size-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 transition-colors"
      >
        <span className="material-symbols-outlined text-sm">add</span>
      </button>
    </div>
  </div>
);

export default DefectCounter;
