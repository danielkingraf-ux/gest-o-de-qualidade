import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabase';
import { authService } from './services/authService';
import { UserProvider, useUser } from './contexts/UserContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SecurityModal from './components/SecurityModal';
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
import ManagementReportView from './views/ManagementReportView';
import { normalizeRole } from './utils/permissions';

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!settled) {
        settled = true;
        setSession(session);
        setLoading(false);
      }
    });

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
};

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
              {/* /reports redirecionado para quality-panel (fusão) */}
              <Route path="/reports" element={<Navigate to="/quality-panel" replace />} />
              <Route path="/management-report" element={protectedElement(['administrador', 'direcao', 'supervisao'], <ManagementReportView />)} />
              <Route path="/ocorrencias-op" element={protectedElement(['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao', 'direcao', 'consulta_auditoria'], <OcorrenciasOpView />)} />
              <Route path="/shift-log" element={protectedElement(['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao'], <ShiftLogView />)} />
              <Route path="/records" element={protectedElement(['administrador', 'supervisao', 'analista_qualidade', 'consulta_auditoria'], <RecordsView />)} />
              <Route path="/escolha-revisao" element={protectedElement(['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'direcao', 'consulta_auditoria'], <EscolhaRevisaoView />)} />
              <Route path="/docs" element={protectedElement(['administrador', 'consulta_auditoria', 'analista_qualidade', 'supervisao'], <DocumentationView />)} />
              <Route path="/lgpd" element={protectedElement(['administrador'], <LgpdView />)} />
              <Route path="/supervisor" element={protectedElement(['administrador', 'supervisao'], <SupervisorView />)} />
              <Route path="/admin" element={protectedElement(['administrador'], <AdminView />)} />
              {/* Acabamento */}
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
