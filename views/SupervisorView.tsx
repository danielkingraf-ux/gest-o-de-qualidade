import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import { InspectionStatus, ProcessType } from '../types';

interface EditRequestItem {
  id: string;
  inspection_id: string;
  requested_by: string;
  reason: string;
  proposed_changes: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  requester_name?: string;
  inspection_op?: string;
  inspection_process?: string;
  inspection_status?: string;
  inspection_timestamp?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  APPROVED:   { label: 'Aprovado',            color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  RESTRICTED: { label: 'Aprovado c/ Restrição', color: 'text-amber-600 bg-amber-50 border-amber-100' },
  REJECTED:   { label: 'Reprovado',           color: 'text-rose-600 bg-rose-50 border-rose-100' },
};

const PROCESS_LABELS: Record<string, string> = {
  OFFSET:        'Offset',
  UV:            'UV',
  HOT_STAMPING:  'Hot Stamping',
  ESCOLHAS:      'Escolhas',
  ACABAMENTO:    'Acabamento',
};

export default function SupervisorView() {
  const [requests, setRequests] = useState<EditRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [processing, setProcessing] = useState<string | null>(null);
  const { showToast } = useToast();
  const { profile } = useUser();

  const fetchRequests = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('edit_requests')
      .select(`
        *,
        inspections (op, process_type, status, timestamp),
        user_profiles!edit_requests_requested_by_fkey (name)
      `)
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

    if (error) {
      showToast('Erro ao carregar solicitações', 'error');
    } else {
      setRequests((data ?? []).map((r: any) => ({
        ...r,
        requester_name: r.user_profiles?.name ?? 'Analista',
        inspection_op: r.inspections?.op ?? '—',
        inspection_process: r.inspections?.process_type ?? '—',
        inspection_status: r.inspections?.status ?? '—',
        inspection_timestamp: r.inspections?.timestamp ?? r.inspections?.created_at ?? null,
      })));
    }

    setLoading(false);
  }, [filter, showToast]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleDecision = async (requestId: string, decision: 'approved' | 'rejected') => {
    setProcessing(requestId);
    try {
      // 1. Atualiza o status da solicitação
      const { error: reqError } = await supabase
        .from('edit_requests')
        .update({
          status: decision,
          reviewed_by: profile?.user_id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (reqError) throw reqError;

      // 2. Se aprovado, aplica as mudanças propostas na inspeção
      if (decision === 'approved') {
        const req = requests.find(r => r.id === requestId);
        if (req && Object.keys(req.proposed_changes).length > 0) {
          const { error: inspError } = await supabase
            .from('inspections')
            .update({
              ...req.proposed_changes,
              edited_at: new Date().toISOString(),
              edited_by_user_id: profile?.user_id,
            })
            .eq('id', req.inspection_id);

          if (inspError) throw inspError;
        }
      }

      showToast(
        decision === 'approved' ? 'Alteração aprovada e aplicada' : 'Solicitação recusada',
        decision === 'approved' ? 'success' : 'info'
      );
      fetchRequests();
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Supervisão • Kingraf
          </p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
            Aprovações
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Solicitações de alteração em análises registradas.
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-5 py-3 rounded-2xl">
            <span className="material-symbols-outlined text-amber-500 text-2xl">pending_actions</span>
            <div>
              <p className="text-2xl font-black text-amber-600">{pendingCount}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Aguardando revisão</p>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800/50 w-fit">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f
              ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            {f === 'pending' ? 'Pendentes' : f === 'approved' ? 'Aprovadas' : f === 'rejected' ? 'Recusadas' : 'Todas'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-slate-400">
          <span className="material-symbols-outlined text-5xl">rule</span>
          <p className="text-sm font-bold uppercase tracking-widest">
            {filter === 'pending' ? 'Nenhuma solicitação pendente' : 'Nenhuma solicitação encontrada'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div
              key={req.id}
              className={`bg-white dark:bg-slate-900 rounded-3xl border shadow-sm overflow-hidden transition-all ${
                req.status === 'pending'
                  ? 'border-amber-200 dark:border-amber-800/40'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="p-5 flex flex-col md:flex-row md:items-center gap-4">
                {/* Inspection info */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">
                      OP {req.inspection_op}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {PROCESS_LABELS[req.inspection_process ?? ''] ?? req.inspection_process}
                    </span>
                    {req.inspection_status && STATUS_LABELS[req.inspection_status] && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${STATUS_LABELS[req.inspection_status].color}`}>
                        {STATUS_LABELS[req.inspection_status].label}
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-sm mt-0.5">chat_bubble</span>
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">{req.reason}</p>
                  </div>

                  <div className="flex items-center gap-4 text-[10px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">person</span>
                      {req.requester_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">schedule</span>
                      {new Date(req.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Proposed changes summary */}
                  {Object.keys(req.proposed_changes).length > 0 && (
                    <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Alterações propostas</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(req.proposed_changes).map(([key, val]) => (
                          <span key={key} className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-md">
                            {key}: {String(val)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {req.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => handleDecision(req.id, 'approved')}
                        disabled={processing === req.id}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                      >
                        {processing === req.id ? (
                          <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                        )}
                        Aprovar
                      </button>
                      <button
                        onClick={() => handleDecision(req.id, 'rejected')}
                        disabled={processing === req.id}
                        className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-sm">cancel</span>
                        Recusar
                      </button>
                    </>
                  ) : (
                    <span className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${
                      req.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        : 'bg-rose-50 text-rose-600 border-rose-100'
                    }`}>
                      <span className="material-symbols-outlined text-sm">
                        {req.status === 'approved' ? 'check_circle' : 'cancel'}
                      </span>
                      {req.status === 'approved' ? 'Aprovada' : 'Recusada'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
