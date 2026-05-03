import React, { useState, createContext, useContext, useCallback, useEffect } from 'react';
import { supabase } from './services/supabase';
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import InspectionView from './views/InspectionView';
import RecordsView from './views/RecordsView';
import DocumentationView from './views/DocumentationView';
import HistoryView from './views/HistoryView';
import AdminView from './views/AdminView';
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';
import ShiftLogView from './views/ShiftLogView';
import FinishingView from './views/FinishingView';
import FinishingAnalysisView from './views/FinishingAnalysisView';
import ReportsView from './views/ReportsView';
import HistoricalUploadView from './views/HistoricalUploadView';
import SupervisorView from './views/SupervisorView';
import { authService } from './services/authService';
import ChatPopup from './components/ChatPopup';
import { UserProvider, useUser } from './contexts/UserContext';





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

import { ToastProvider, useToast } from './contexts/ToastContext';




const Sidebar = ({ user, onLogout, onOpenChat, unreadCount, pendingRequests, isCollapsed, setIsCollapsed, isMobileOpen, onCloseMobile }: {
  user: any, onLogout: () => void, onOpenChat: () => void, unreadCount: number, pendingRequests: number,
  isCollapsed: boolean, setIsCollapsed: (v: boolean) => void,
  isMobileOpen: boolean, onCloseMobile: () => void
}) => {
  const location = useLocation();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { isSupervisor, profile } = useUser();
  const [alertCount, setAlertCount] = useState(0);

  // Subscribe to new alerts in Shift Log
  useEffect(() => {
    const subscription = supabase
      .channel('sidebar_shift_alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shift_logs' }, (payload) => {
        const newLog = payload.new as any;
        if (newLog.type === 'alert' || newLog.type === 'critical') {
          setAlertCount(prev => prev + 1);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Clear alerts when visiting the page
  useEffect(() => {
    if (location.pathname === '/shift-log') {
      setAlertCount(0);
    }
  }, [location.pathname]);

  const allMenuItems = [
    { path: '/', label: 'Dashboard', icon: 'dashboard', roles: ['analista', 'supervisor'] },
    { path: '/inspections', label: 'Inspeções', icon: 'assignment_turned_in', roles: ['analista', 'supervisor'] },
    { path: '/finishing', label: 'Laudo de Acabamento', icon: 'verified', roles: ['analista', 'supervisor'] },
    { path: '/finishing-analysis', label: 'Análise de Amostragem', icon: 'table_chart', roles: ['analista', 'supervisor'] },
    { path: '/reports', label: 'Relatórios', icon: 'insert_chart', roles: ['analista', 'supervisor'] },
    { path: 'chat', label: 'Chat da Qualidade', icon: 'forum', badge: unreadCount, isAction: true, roles: ['analista', 'supervisor'] },
    { path: '/records', label: 'Registros', icon: 'analytics', roles: ['analista', 'supervisor'] },
    { path: '/historical-import', label: 'Importação ODS', icon: 'history', roles: ['supervisor'] },
    { path: '/supervisor', label: 'Aprovações', icon: 'rule', badge: pendingRequests, roles: ['supervisor'] },
    { path: '/admin', label: 'Administração', icon: 'admin_panel_settings', roles: ['supervisor'] },
    { path: '/docs', label: 'Documentação', icon: 'description', roles: ['analista', 'supervisor'] },
  ];

  const userRole = profile?.role ?? 'analista';
  const menuItems = allMenuItems.filter(item => item.roles.includes(userRole));

  const handleLogout = async () => {
    const { error } = await authService.signOut();
    if (!error) {
      showToast('Sessão encerrada', 'info');
      onLogout();
    }
  };

  return (
    <aside
      className={`${isCollapsed ? 'w-20' : 'w-64'} border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between p-4 shrink-0 h-full transition-all duration-300 relative z-40 fixed md:static inset-y-0 left-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
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

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-center px-4 py-6 border-b border-slate-100 dark:border-slate-800/50 mb-2">
          {isCollapsed ? (
            <img src="/logo-symbol.png" alt="K" className="h-20 w-20 object-contain transition-all" />
          ) : (
            <img src="/logo-full.png" alt="Kingraf" className="h-12 w-auto object-contain transition-all" />
          )}
        </div>
        <nav className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const badgeCount = (item as any).badge;

            return item.isAction ? (
              <button
                key={item.path}
                onClick={() => {
                  onOpenChat();
                  onCloseMobile();
                }}
                title={isCollapsed ? item.label : ''}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 ${isCollapsed ? 'justify-center' : ''}`}
              >
                <div className="relative flex items-center justify-center">
                  <span className="material-symbols-outlined">{item.icon}</span>
                  {badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </div>
                {!isCollapsed && <p className={`text-sm font-medium`}>{item.label}</p>}
              </button>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                title={isCollapsed ? item.label : ''}
                onClick={onCloseMobile}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${isCollapsed ? 'justify-center' : ''} ${isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                <div className="relative flex items-center justify-center">
                  <span className="material-symbols-outlined">{item.icon}</span>
                  {badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white animate-bounce-slow">
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </div>
                {!isCollapsed && <p className={`text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</p>}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-800 pt-4">

        <button
          onClick={toggleTheme}
          title={isCollapsed ? `Modo ${theme === 'dark' ? 'Claro' : 'Escuro'}` : ''}
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
          title={isCollapsed ? 'Sair do Sistema' : ''}
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
              <p className={`text-[10px] uppercase font-black tracking-widest leading-none ${isSupervisor ? 'text-amber-500' : 'text-emerald-500'}`}>
                {isSupervisor ? 'Supervisão' : 'Analista'}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

const Header = ({ onOpenSidebar }: { onOpenSidebar: () => void }) => {
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 md:px-8 py-3 transition-colors duration-300">
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
        <button className="size-10 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="size-10 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
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
    </header>
  );
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;

    // Fallback: if Supabase doesn't respond (paused project, network issue), unblock the UI
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setLoading(false);
      }
    }, 5000);

    const { data: { subscription } } = authService.onAuthStateChange((_event, session) => {
      if (!settled) settled = true;
      clearTimeout(timeout);
      setSession(session);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <img src="/logo-symbol.png" alt="Carregando..." className="w-24 h-24 object-contain animate-bounce" />
        </div>
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

function AppShell({ session }: { session: any }) {
  const { isSupervisor, loading: profileLoading } = useUser();
  const [isChatOpen, setIsChatOpen] = useState(false);
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
        const readIds = new Set(reads.map((r: any) => r.log_id));
        setUnreadCount(logs.filter((l: any) => !readIds.has(l.id)).length);
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
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <img src="/logo-symbol.png" alt="Carregando..." className="w-24 h-24 object-contain animate-bounce" />
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className={`flex h-full w-full bg-background-light dark:bg-background-dark overflow-hidden transition-colors duration-300 ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
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
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header onOpenSidebar={() => setIsMobileSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<DashboardView />} />
              <Route path="/inspections" element={<InspectionView />} />
              <Route path="/finishing" element={<FinishingView />} />
              <Route path="/finishing-analysis" element={<FinishingAnalysisView />} />
              <Route path="/reports" element={<ReportsView />} />
              <Route path="/shift-log" element={<ShiftLogView />} />
              <Route path="/records" element={<RecordsView />} />
              <Route path="/docs" element={<DocumentationView />} />
              {/* Supervisor-only routes */}
              <Route path="/historical-import" element={isSupervisor ? <HistoricalUploadView /> : <Navigate to="/" replace />} />
              <Route path="/supervisor" element={isSupervisor ? <SupervisorView /> : <Navigate to="/" replace />} />
              <Route path="/admin" element={isSupervisor ? <AdminView /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
        <ChatPopup isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </div>
    </HashRouter>
  );
}
