import React, { useState, createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabase';
import { authService } from './services/authService';
import { UserProvider, useUser } from './contexts/UserContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import ChatPopup from './components/ChatPopup';
import PrivacyNoticeModal from './components/PrivacyNoticeModal';
import InspectionView from './views/InspectionView';
import RecordsView from './views/RecordsView';
import DocumentationView from './views/DocumentationView';
import AdminView from './views/AdminView';
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';
import ShiftLogView from './views/ShiftLogView';
import FinishingAnalysisView from './views/FinishingAnalysisView';
import ReportsView from './views/ReportsView';
import SupervisorView from './views/SupervisorView';
import LgpdView from './views/LgpdView';
import PalletAuditView from './views/PalletAuditView';
import PalletListView from './views/PalletListView';
import QualityPanelView from './views/QualityPanelView';
import OPTraceView from './views/OPTraceView';
import AcabamentoEscolhasView from './views/AcabamentoEscolhasView';
import AcabamentoCortesVincoView from './views/AcabamentoCortesVincoView';
import AcabamentoColagemView from './views/AcabamentoColagemView';
import AcabamentoRevisaoFinalView from './views/AcabamentoRevisaoFinalView';
import EscolhaRevisaoView from './views/EscolhaRevisaoView';
import OcorrenciasOpView from './views/OcorrenciasOpView';
import { getRoleLabel, normalizeRole } from './utils/permissions';


// Theme System
type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('kg_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('kg_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};


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

const Sidebar = ({ user, onLogout, onOpenChat, unreadCount, pendingRequests, isCollapsed, setIsCollapsed, isMobileOpen, onCloseMobile }: SidebarProps) => {
  const location = useLocation();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { profile } = useUser();
  const normalizedRole = normalizeRole(profile?.role);

  type MenuItem = { path: string; label: string; icon: string; roles: string[]; badge?: number; isAction?: boolean };
  type MenuGroup = { label: string; items: MenuItem[] };

  const allGroups: MenuGroup[] = [
    {
      label: 'Visão Geral',
      items: [
        { path: '/', label: 'Dashboard', icon: 'dashboard', roles: ['administrador', 'direcao', 'supervisao'] },
        { path: '/quality-panel', label: 'Painel de Qualidade', icon: 'query_stats', roles: ['administrador', 'supervisao'] },
        { path: '/rastreabilidade', label: 'Rastreabilidade', icon: 'manage_search', roles: ['administrador', 'direcao', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao', 'consulta_auditoria'] },
      ],
    },
    {
      label: 'Fluxo da OP',
      items: [
        { path: '/inspections', label: 'Processo Inicial', icon: 'assignment_turned_in', roles: ['administrador', 'analista_qualidade'] },
        { path: '/acabamento-corte-vinco', label: 'Corte e Vinco', icon: 'content_cut', roles: ['administrador', 'supervisao', 'revisao_escolha'] },
        { path: '/acabamento-colagem', label: 'Colagem', icon: 'precision_manufacturing', roles: ['administrador', 'supervisao', 'revisao_escolha'] },
        { path: '/finishing-analysis', label: 'Produto Acabado', icon: 'table_chart', roles: ['administrador', 'analista_qualidade'] },
        { path: '/acabamento-revisao-final', label: 'Revisão Final', icon: 'verified', roles: ['administrador', 'supervisao', 'revisao_escolha'] },
      ],
    },
    {
      label: 'Operacional',
      items: [
        { path: 'chat', label: 'Ocorrências', icon: 'forum', badge: unreadCount, isAction: true, roles: ['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao'] },
        { path: '/pallets', label: 'Pallets', icon: 'stacks', roles: ['administrador', 'analista_qualidade', 'expedicao'] },
        { path: '/reports', label: 'Relatórios', icon: 'insert_chart', roles: ['administrador', 'direcao', 'supervisao', 'consulta_auditoria'] },
        { path: '/supervisor', label: 'Aprovações', icon: 'rule', badge: pendingRequests, roles: ['administrador', 'supervisao'] },
      ],
    },
    {
      label: 'Sistema',
      items: [
        { path: '/admin', label: 'Administração', icon: 'admin_panel_settings', roles: ['administrador'] },
      ],
    },
  ];

  const userRole = profile?.role ?? 'consulta_auditoria';
  const visibleGroups = allGroups
    .map(g => ({ ...g, items: g.items.filter(item => item.roles.includes(normalizeRole(userRole))) }))
    .filter(g => g.items.length > 0);
  const menuItems = visibleGroups.flatMap(g => g.items);

  const handleLogout = async () => {
    const { error } = await authService.signOut();
    if (!error) {
      showToast('Sessão encerrada', 'info');
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
              {/* Cabeçalho do grupo */}
              {!isCollapsed ? (
                <p className="px-3 mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
                  {group.label}
                </p>
              ) : (
                gi > 0 && <div className="mx-3 mb-2 border-t border-slate-100 dark:border-slate-800" />
              )}
              {/* Itens do grupo */}
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
              <p className="text-xs font-bold truncate text-slate-700 dark:text-slate-200">{profile?.name || user?.email?.split('@')[0] || 'Usuário'}</p>
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

// Modal de Segurança
const SecurityModal = ({ onClose }: { onClose: () => void }) => createPortal(
  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
    <div
      className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-in"
      onClick={e => e.stopPropagation()}
    >
      {/* Header do modal */}
      <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-8 py-6 rounded-t-3xl flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-emerald-500 text-2xl">verified_user</span>
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Segurança do Sistema</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium">Como seus dados são protegidos nesta plataforma</p>
        </div>
        <button onClick={onClose} className="size-10 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors shrink-0">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="px-8 py-6 space-y-5">

        {/* Autenticação */}
        <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-blue-600 text-xl">lock</span>
            <h3 className="text-sm font-black text-blue-900 dark:text-blue-300 uppercase tracking-wide">Autenticação JWT</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-[9px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-widest">Supabase Auth</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Todo acesso exige login com e-mail e senha. Após autenticação, o sistema gera um <strong className="text-slate-800 dark:text-slate-200">token JWT</strong> assinado digitalmente com validade curta. Cada requisição ao banco carrega esse token — sem ele, nenhuma operação é executada. O token é renovado automaticamente enquanto a sessão está ativa e invalidado imediatamente no logout.
          </p>
        </div>

        {/* RLS */}
        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-indigo-600 text-xl">shield</span>
            <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">RLS — Row Level Security</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-widest">PostgreSQL</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
            O banco de dados aplica <strong className="text-slate-800 dark:text-slate-200">políticas de segurança linha a linha</strong>. Mesmo que alguém tente acessar diretamente o banco com credenciais válidas, o PostgreSQL filtra automaticamente o que cada papel pode ver ou modificar:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {[
              { label: 'inspections', desc: 'Analistas leem/criam; supervisores têm acesso total' },
              { label: 'orders', desc: 'Leitura aberta para autenticados; escrita restrita' },
              { label: 'user_profiles', desc: 'Cada usuário vê apenas seu próprio perfil' },
              { label: 'edit_requests', desc: 'Aprovação exclusiva de supervisores' },
              { label: 'nqa_profiles', desc: 'Leitura para todos; gerência só por supervisor' },
              { label: 'blocklist / LGPD', desc: 'Acesso restrito a funções internas do sistema' },
            ].map(item => (
              <div key={item.label} className="flex gap-2 bg-white dark:bg-slate-800/60 rounded-xl p-3 border border-indigo-100 dark:border-indigo-900/30">
                <span className="material-symbols-outlined text-indigo-400 text-base shrink-0 mt-0.5">table_rows</span>
                <div>
                  <p className="font-black text-slate-700 dark:text-slate-200 font-mono">{item.label}</p>
                  <p className="text-slate-500 dark:text-slate-400 leading-snug">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funções de controle de acesso */}
        <div className="rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-amber-600 text-xl">functions</span>
            <h3 className="text-sm font-black text-amber-900 dark:text-amber-300 uppercase tracking-wide">Funções de Controle</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-widest">SQL Functions</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            A função <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-amber-800 dark:text-amber-300 font-mono font-bold">current_user_role()</code> é executada <strong className="text-slate-800 dark:text-slate-200">dentro do próprio banco</strong> a cada operação sensível. Ela consulta a tabela <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-amber-800 dark:text-amber-300 font-mono font-bold">user_profiles</code> e retorna o perfil do usuário autenticado. As políticas RLS chamam essa função em tempo real; a permissão não fica só no front-end.
          </p>
        </div>

        {/* HTTPS + Infraestrutura */}
        <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-emerald-600 text-xl">https</span>
            <h3 className="text-sm font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wide">Transporte Seguro</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-widest">TLS 1.3</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Toda comunicação entre o navegador, a aplicação (Vercel) e o banco (Supabase) trafega exclusivamente por <strong className="text-slate-800 dark:text-slate-200">HTTPS com TLS 1.3</strong>. Tokens JWT e dados operacionais nunca trafegam em texto claro. A chave de serviço do banco fica armazenada em variáveis de ambiente do servidor — jamais exposta no código-fonte ou no cliente.
          </p>
        </div>

        {/* LGPD */}
        <div className="rounded-2xl border border-rose-100 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-rose-600 text-xl">gpp_good</span>
            <h3 className="text-sm font-black text-rose-900 dark:text-rose-300 uppercase tracking-wide">Conformidade LGPD</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 tracking-widest">Lei 13.709/2018</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            O sistema coleta <strong className="text-slate-800 dark:text-slate-200">apenas dados operacionais necessários</strong>: nome, e-mail corporativo e nível de acesso. Não há coleta de dados pessoais sensíveis. Registros de consentimento são mantidos e o usuário pode consultar seus dados a qualquer momento pela seção <em>LGPD</em> no menu (visível para supervisores).
          </p>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] text-slate-400 font-medium">Infraestrutura: Supabase (PostgreSQL 15) + Vercel Edge Network</p>
          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
            Sistema Protegido
          </span>
        </div>
      </div>
    </div>
  </div>,
  document.body
);

const Header = ({ onOpenSidebar, unreadCount, onOpenChat, onOpenSecurity }: { onOpenSidebar: () => void; unreadCount: number; onOpenChat: () => void; onOpenSecurity: () => void }) => {
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
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
            aria-label="Segurança do sistema"
            data-tooltip="Segurança do sistema"
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
          Há {unreadCount} mensagem{unreadCount > 1 ? 's' : ''} do Chat da Qualidade para o turno visualizar
        </button>
      )}
    </header>
  );
};

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;

    // 1. Lê sessão local do storage imediatamente (sem rede)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!settled) {
        settled = true;
        setSession(session);
        setLoading(false);
      }
    });

    // 2. Fica ouvindo mudanças (login/logout)
    const { data: { subscription } } = authService.onAuthStateChange(async (_event, session) => {
      settled = true;
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <LoginView />
        </ToastProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <UserProvider userId={session.user.id}>
          <AppShell session={session} />
        </UserProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

const AppShell = ({ session }: { session: Session }) => {
  const { isSupervisor, profile, loading: profileLoading } = useUser();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('kg_sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const toggleSidebar = (v: boolean) => {
    setIsSidebarCollapsed(v);
    localStorage.setItem('kg_sidebar_collapsed', String(v));
  };

  // Shift log unread counter
  useEffect(() => {
    if (!session?.user) return;

    const fetchUnread = async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data: logs } = await supabase
        .from('shift_logs')
        .select('id')
        .gte('created_at', threeDaysAgo.toISOString());

      const { data: reads } = await supabase
        .from('shift_log_reads')
        .select('log_id')
        .eq('user_id', session.user.id);

      if (logs && reads) {
        const readIds = new Set(reads.map((r: { log_id: string }) => r.log_id));
        setUnreadCount(logs.filter((l: { id: string }) => !readIds.has(l.id)).length);
      }
    };

    fetchUnread();

    const logsSub = supabase
      .channel('app_unread_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shift_logs' }, fetchUnread)
      .subscribe();

    const readsSub = supabase
      .channel('app_unread_reads')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shift_log_reads' }, fetchUnread)
      .subscribe();

    return () => {
      logsSub.unsubscribe();
      readsSub.unsubscribe();
    };
  }, [session, isChatOpen]);

  // Pending edit requests counter (supervisor only)
  useEffect(() => {
    if (!isSupervisor) return;

    const fetchPending = async () => {
      const { count } = await supabase
        .from('edit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingRequests(count ?? 0);
    };

    fetchPending();

    const sub = supabase
      .channel('app_pending_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'edit_requests' }, fetchPending)
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [isSupervisor]);

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const userRole = profile?.role ?? 'consulta_auditoria';
  const normalizedRole = normalizeRole(userRole);
  const fallbackPath =
    ['administrador', 'direcao', 'supervisao'].includes(normalizedRole) ? '/' :
    normalizedRole === 'revisao_escolha' ? '/acabamento-escolhas' :
    normalizedRole === 'expedicao' ? '/pallets' :
    normalizedRole === 'consulta_auditoria' ? '/rastreabilidade' :
    '/inspections';
  const protectedElement = (roles: string[], child: React.ReactElement) =>
    roles.includes(normalizedRole) ? child : <Navigate to={fallbackPath} replace />;

  return (
    <HashRouter>
      <div className={`flex h-screen w-full min-w-0 bg-background-light dark:bg-background-dark overflow-hidden transition-colors duration-300 ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar
          user={session.user}
          onLogout={() => authService.signOut()}
          onOpenChat={() => setIsChatOpen(true)}
          unreadCount={unreadCount}
          pendingRequests={pendingRequests}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={toggleSidebar}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Header
            onOpenSidebar={() => setIsMobileSidebarOpen(true)}
            unreadCount={unreadCount}
            onOpenChat={() => setIsChatOpen(true)}
            onOpenSecurity={() => setIsSecurityOpen(true)}
          />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={protectedElement(['administrador', 'direcao', 'supervisao'], <DashboardView />)} />
              <Route path="/inspections" element={protectedElement(['administrador', 'analista_qualidade'], <InspectionView />)} />
              <Route path="/finishing-analysis" element={protectedElement(['administrador', 'analista_qualidade'], <FinishingAnalysisView />)} />
              <Route path="/pallet/:id" element={protectedElement(['administrador', 'analista_qualidade', 'expedicao'], <PalletAuditView />)} />
              <Route path="/pallets" element={protectedElement(['administrador', 'analista_qualidade', 'expedicao'], <PalletListView />)} />
              <Route path="/rastreabilidade" element={protectedElement(['administrador', 'direcao', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao', 'consulta_auditoria'], <OPTraceView />)} />
              <Route path="/quality-panel" element={protectedElement(['administrador', 'supervisao'], <QualityPanelView />)} />
              <Route path="/reports" element={protectedElement(['administrador', 'direcao', 'supervisao', 'consulta_auditoria'], <ReportsView />)} />
              <Route path="/ocorrencias-op" element={protectedElement(['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao', 'direcao', 'consulta_auditoria'], <OcorrenciasOpView />)} />
              <Route path="/shift-log" element={protectedElement(['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao'], <ShiftLogView />)} />
              <Route path="/records" element={protectedElement(['administrador', 'supervisao', 'analista_qualidade', 'consulta_auditoria'], <RecordsView />)} />
              <Route path="/escolha-revisao" element={protectedElement(['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'direcao', 'consulta_auditoria'], <EscolhaRevisaoView />)} />
              <Route path="/docs" element={protectedElement(['administrador', 'consulta_auditoria', 'analista_qualidade', 'supervisao'], <DocumentationView />)} />
              <Route path="/lgpd" element={protectedElement(['administrador'], <LgpdView />)} />
              <Route path="/supervisor" element={protectedElement(['administrador', 'supervisao'], <SupervisorView />)} />
              <Route path="/admin" element={protectedElement(['administrador'], <AdminView />)} />
              {/* ── Acabamento ──────────────────────────────────────────────── */}
              <Route path="/acabamento-escolhas" element={protectedElement(['administrador', 'supervisao', 'revisao_escolha'], <AcabamentoEscolhasView />)} />
              <Route path="/acabamento-corte-vinco" element={protectedElement(['administrador', 'supervisao', 'revisao_escolha'], <AcabamentoCortesVincoView />)} />
              <Route path="/acabamento-colagem" element={protectedElement(['administrador', 'supervisao', 'revisao_escolha'], <AcabamentoColagemView />)} />
              <Route path="/acabamento-revisao-final" element={protectedElement(['administrador', 'supervisao', 'revisao_escolha'], <AcabamentoRevisaoFinalView />)} />
              <Route path="*" element={<Navigate to={fallbackPath} replace />} />
            </Routes>
          </main>
        </div>
        <ChatPopup isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        <PrivacyNoticeModal userId={session.user.id} />
        {isSecurityOpen && <SecurityModal onClose={() => setIsSecurityOpen(false)} />}
      </div>
    </HashRouter>
  );
};

export default App;

