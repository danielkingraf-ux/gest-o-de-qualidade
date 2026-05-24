import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';
import { authService } from '../services/authService';
import { getRoleLabel, normalizeRole } from '../utils/permissions';

interface SidebarProps {
  user: { email?: string };
  onLogout: () => void;
  onOpenChat: () => void;
  unreadCount: number;
  pendingRequests: number;
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

type MenuItem = { path: string; label: string; icon: string; roles: string[]; badge?: number; isAction?: boolean };
type MenuGroup = { label: string; items: MenuItem[] };

const Sidebar = ({ user, onLogout, onOpenChat, unreadCount, pendingRequests, isCollapsed, setIsCollapsed, isMobileOpen, onCloseMobile }: SidebarProps) => {
  const location = useLocation();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { profile } = useUser();
  const normalizedRole = normalizeRole(profile?.role);

  const allGroups: MenuGroup[] = [
    {
      label: 'Visao Geral',
      items: [
        { path: '/', label: 'Dashboard', icon: 'dashboard', roles: ['administrador', 'direcao', 'supervisao'] },
        { path: '/quality-panel', label: 'Painel de Qualidade', icon: 'query_stats', roles: ['administrador', 'supervisao'] },
        { path: '/rastreabilidade', label: 'Rastreabilidade', icon: 'manage_search', roles: ['administrador', 'direcao', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao', 'consulta_auditoria'] },
      ],
    },
    {
      label: 'Fluxo da OP',
      items: [
        { path: '/inspections', label: 'Processo Inicial', icon: 'print', roles: ['administrador', 'analista_qualidade'] },
        { path: '/acabamento-corte-vinco', label: 'Corte e Vinco', icon: 'border_style', roles: ['administrador', 'supervisao', 'revisao_escolha'] },
        { path: '/acabamento-colagem', label: 'Colagem', icon: 'join_inner', roles: ['administrador', 'supervisao', 'revisao_escolha'] },
        { path: '/finishing-analysis', label: 'Produto Acabado', icon: 'inventory_2', roles: ['administrador', 'analista_qualidade'] },
        { path: '/acabamento-revisao-final', label: 'Revisao Final', icon: 'fact_check', roles: ['administrador', 'supervisao', 'revisao_escolha'] },
      ],
    },
    {
      label: 'Operacional',
      items: [
        { path: 'chat', label: 'Ocorrencias', icon: 'forum', badge: unreadCount, isAction: true, roles: ['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao'] },
        { path: '/pallets', label: 'Pallets', icon: 'stacks', roles: ['administrador', 'analista_qualidade', 'expedicao'] },
        { path: '/reports', label: 'Relatorios', icon: 'insert_chart', roles: ['administrador', 'direcao', 'supervisao', 'consulta_auditoria'] },
        { path: '/management-report', label: 'Rel. Gerencial', icon: 'summarize', roles: ['administrador', 'direcao', 'supervisao'] },
        { path: '/supervisor', label: 'Aprovacoes', icon: 'rule', badge: pendingRequests, roles: ['administrador', 'supervisao'] },
      ],
    },
    {
      label: 'Sistema',
      items: [
        { path: '/admin', label: 'Administracao', icon: 'admin_panel_settings', roles: ['administrador'] },
      ],
    },
  ];

  const userRole = profile?.role ?? 'consulta_auditoria';
  const visibleGroups = allGroups
    .map(g => ({ ...g, items: g.items.filter(item => item.roles.includes(normalizeRole(userRole))) }))
    .filter(g => g.items.length > 0);

  const handleLogout = async () => {
    const { error } = await authService.signOut();
    if (!error) {
      showToast('Sessao encerrada', 'info');
      onLogout();
    }
  };

  return (
    <aside
      className={`${isCollapsed ? 'w-20' : 'w-64'} border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col p-4 shrink-0 h-full transition-all duration-300 relative z-40 fixed md:static inset-y-0 left-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      aria-hidden={!isMobileOpen ? true : undefined}
    >
      {/* Collapse Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 size-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center shadow-sm z-20 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors hidden md:flex"
      >
        <span className="material-symbols-outlined text-xs text-slate-500">
          {isCollapsed ? 'chevron_right' : 'chevron_left'}
        </span>
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 items-center justify-center px-2 py-5 border-b border-slate-100 dark:border-slate-800/50">
          {isCollapsed ? (
            <img src="/logo-symbol.png" alt="K" className="w-full h-auto object-contain max-h-14 transition-all" />
          ) : (
            <img src="/logo-full.png" alt="Kingraf" className="h-12 w-auto object-contain transition-all" />
          )}
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto no-scrollbar">
          {visibleGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-3' : ''}>
              {!isCollapsed ? (
                <p className="px-3 mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
                  {group.label}
                </p>
              ) : (
                gi > 0 && <div className="mx-3 mb-2 border-t border-slate-100 dark:border-slate-800" />
              )}
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                const badgeCount = item.badge;
                return item.isAction ? (
                  <button
                    key={item.path}
                    onClick={() => { onOpenChat(); onCloseMobile(); }}
                    aria-label={item.label}
                    data-tooltip={isCollapsed ? item.label : ''}
                    data-tooltip-side="right"
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${isCollapsed ? 'justify-center' : ''}`}
                  >
                    <div className="relative flex items-center justify-center">
                      <span className="material-symbols-outlined">{item.icon}</span>
                      {badgeCount != null && badgeCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </div>
                    {!isCollapsed && <p className="text-sm font-medium">{item.label}</p>}
                  </button>
                ) : (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-label={item.label}
                    data-tooltip={isCollapsed ? item.label : ''}
                    data-tooltip-side="right"
                    onClick={onCloseMobile}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-primary/10 text-primary' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    <div className="relative flex items-center justify-center">
                      <span className="material-symbols-outlined">{item.icon}</span>
                      {badgeCount != null && badgeCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white animate-bounce-slow">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </div>
                    {!isCollapsed && <p className={`text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</p>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
      <div className="mt-4 flex shrink-0 flex-col gap-4 border-t border-slate-200 dark:border-slate-800 pt-4">

        <button
          onClick={toggleTheme}
          aria-label={`Modo ${theme === 'dark' ? 'Claro' : 'Escuro'}`}
          data-tooltip={isCollapsed ? `Modo ${theme === 'dark' ? 'Claro' : 'Escuro'}` : ''}
          data-tooltip-side="right"
          className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors w-full group ${isCollapsed ? 'justify-center' : ''}`}
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">
              {theme === 'dark' ? 'dark_mode' : 'light_mode'}
            </span>
            {!isCollapsed && <p className="text-sm font-medium">Modo {theme === 'dark' ? 'Escuro' : 'Claro'}</p>}
          </div>
          {!isCollapsed && (
            <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${theme === 'dark' ? 'bg-primary' : 'bg-slate-300'}`}>
              <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full shadow-sm transition-transform duration-200 ${theme === 'dark' ? 'translate-x-4' : 'translate-x-0'}`}></div>
            </div>
          )}
        </button>

        <button
          onClick={handleLogout}
          aria-label="Sair do Sistema"
          data-tooltip={isCollapsed ? 'Sair do Sistema' : ''}
          data-tooltip-side="right"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-500 hover:text-rose-600 transition-colors w-full ${isCollapsed ? 'justify-center' : ''}`}
        >
          <span className="material-symbols-outlined">logout</span>
          {!isCollapsed && <p className="text-sm font-medium">Sair do Sistema</p>}
        </button>
        <div className={`flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="size-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-xs">person</span>
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <p className="text-xs font-bold truncate text-slate-700 dark:text-slate-200">{profile?.name || user?.email?.split('@')[0] || 'Usuario'}</p>
              <p className={`text-[10px] uppercase font-black tracking-widest leading-none ${
                normalizedRole === 'administrador' ? 'text-amber-500' :
                normalizedRole === 'revisao_escolha' ? 'text-indigo-500' :
                normalizedRole === 'consulta_auditoria' ? 'text-slate-500' :
                'text-emerald-500'
              }`}>
                {getRoleLabel(profile?.role)}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
