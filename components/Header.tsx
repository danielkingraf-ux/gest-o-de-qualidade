import React, { useState, useEffect } from 'react';

interface HeaderProps {
  onOpenSidebar: () => void;
  unreadCount: number;
  onOpenChat: () => void;
  onOpenSecurity: () => void;
}

const Header = ({ onOpenSidebar, unreadCount, onOpenChat, onOpenSecurity }: HeaderProps) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md transition-colors duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="size-10 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors md:hidden"
            aria-label="Abrir menu"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-white">Qualidade em Tempo Real</h2>
          <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 animate-pulse">
            Ativo
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenChat}
            className={`relative size-10 flex items-center justify-center rounded-lg transition-all ${unreadCount > 0
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            aria-label="Abrir Chat da Qualidade"
            data-tooltip="Abrir Chat da Qualidade"
          >
            <span className={`material-symbols-outlined${unreadCount > 0 ? ' animate-bell-ring' : ''}`}>notifications</span>
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={onOpenSecurity}
            className="size-10 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label="Seguranca do sistema"
            data-tooltip="Seguranca do sistema"
          >
            <span className="material-symbols-outlined">help</span>
          </button>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-2"></div>
          <div className="text-right">
            <p className="text-xs font-bold leading-none capitalize text-slate-700 dark:text-slate-300">
              {now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              {now.toLocaleTimeString('pt-BR')}
            </p>
          </div>
        </div>
      </div>
      {unreadCount > 0 && (
        <button
          type="button"
          onClick={onOpenChat}
          className="flex w-full items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-[11px] font-black uppercase tracking-widest text-white transition hover:bg-amber-600"
        >
          <span className="material-symbols-outlined text-base">mark_chat_unread</span>
          Ha {unreadCount} mensagem{unreadCount > 1 ? 's' : ''} do Chat da Qualidade para o turno visualizar
        </button>
      )}
    </header>
  );
};

export default Header;
