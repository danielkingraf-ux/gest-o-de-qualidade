import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { normalizeRole } from '../utils/permissions';
import type { OcorrenciaOp, OcorrenciaOpPrioridade, OcorrenciaOpStatus, OcorrenciaOpTipo } from '../types';
import {
  OCORRENCIA_PRIORIDADE_OPTIONS,
  OCORRENCIA_STATUS_OPTIONS,
  OCORRENCIA_TIPO_OPTIONS,
  ocorrenciasService,
} from '../services/ocorrenciasService';

type Draft = {
  op: string;
  titulo: string;
  tipo: OcorrenciaOpTipo;
  setor_origem: string;
  prioridade: OcorrenciaOpPrioridade;
  status: OcorrenciaOpStatus;
  responsavel_user_id: string;
  descricao: string;
};

const EMPTY_DRAFT: Draft = {
  op: '',
  titulo: '',
  tipo: 'qualidade',
  setor_origem: 'qualidade',
  prioridade: 'media',
  status: 'aberta',
  responsavel_user_id: '',
  descricao: '',
};

const statusClass: Record<OcorrenciaOpStatus, string> = {
  aberta: 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300',
  em_analise: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300',
  aguardando_decisao: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  resolvida: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  cancelada: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const prioridadeClass: Record<OcorrenciaOpPrioridade, string> = {
  baixa: 'text-slate-500',
  media: 'text-sky-600',
  alta: 'text-amber-600',
  critica: 'text-rose-600',
};

const optionLabel = <T extends string>(options: ReadonlyArray<{ value: T; label: string }>, value: T) =>
  options.find(option => option.value === value)?.label ?? value;

export default function OcorrenciasOpView() {
  const { profile } = useUser();
  const { showToast } = useToast();
  const role = normalizeRole(profile?.role);
  const canCreate = ['administrador', 'supervisao', 'analista_qualidade', 'revisao_escolha', 'expedicao'].includes(role);
  const canManage = ['administrador', 'supervisao'].includes(role);

  const [records, setRecords] = useState<OcorrenciaOp[]>([]);
  const [selected, setSelected] = useState<OcorrenciaOp | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [filterOp, setFilterOp] = useState('');
  const [filterStatus, setFilterStatus] = useState<'todos' | OcorrenciaOpStatus>('todos');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await ocorrenciasService.list();
      setRecords(data);
      if (selected) {
        const fresh = data.find(item => item.id === selected.id) ?? null;
        setSelected(fresh);
      }
    } catch (error: any) {
      showToast(`Erro ao carregar ocorrências: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) { setComments([]); return; }
    ocorrenciasService.listComments(selected.id)
      .then(setComments)
      .catch((error: any) => showToast(`Erro ao carregar comentários: ${error.message}`, 'error'));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const op = filterOp.trim().toUpperCase();
    return records.filter(record => {
      if (op && !record.op.toUpperCase().includes(op)) return false;
      if (filterStatus !== 'todos' && record.status !== filterStatus) return false;
      return true;
    });
  }, [records, filterOp, filterStatus]);

  const counters = useMemo(() => ({
    abertas: records.filter(r => r.status !== 'resolvida' && r.status !== 'cancelada').length,
    criticas: records.filter(r => r.prioridade === 'critica').length,
    resolvidas: records.filter(r => r.status === 'resolvida').length,
  }), [records]);

  const resetDraft = () => setDraft(EMPTY_DRAFT);

  const handleCreate = async () => {
    if (!canCreate) {
      showToast('Seu perfil não pode criar ocorrência.', 'warning');
      return;
    }
    if (!draft.op.trim() || !draft.titulo.trim() || !draft.setor_origem.trim() || !draft.descricao.trim()) {
      showToast('Informe OP, título, setor e descrição.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const created = await ocorrenciasService.create({
        op: draft.op.trim().toUpperCase(),
        titulo: draft.titulo.trim(),
        tipo: draft.tipo,
        setor_origem: draft.setor_origem.trim(),
        prioridade: draft.prioridade,
        status: 'aberta',
        responsavel_user_id: draft.responsavel_user_id || null,
        descricao: draft.descricao.trim(),
        created_by: profile?.user_id ?? null,
      });
      setRecords(prev => [created, ...prev]);
      setSelected(created);
      resetDraft();
      showToast('Ocorrência criada.', 'success');
    } catch (error: any) {
      showToast(`Erro ao criar ocorrência: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSelected = async (patch: Partial<Draft>) => {
    if (!selected) return;
    if (!canManage && selected.created_by !== profile?.user_id) {
      showToast('Seu perfil não pode alterar esta ocorrência.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await ocorrenciasService.update(selected.id, {
        ...patch,
        responsavel_user_id: patch.responsavel_user_id === '' ? null : patch.responsavel_user_id,
      });
      setSelected(updated);
      setRecords(prev => prev.map(item => item.id === updated.id ? updated : item));
    } catch (error: any) {
      showToast(`Erro ao atualizar ocorrência: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const addComment = async () => {
    if (!selected || !commentText.trim()) return;
    setIsSaving(true);
    try {
      const created = await ocorrenciasService.addComment(selected.id, commentText.trim(), profile?.user_id ?? null);
      setComments(prev => [...prev, created]);
      setCommentText('');
      await load();
      showToast('Comentário registrado.', 'success');
    } catch (error: any) {
      showToast(`Erro ao comentar: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-5 animate-slide-in pb-20">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Comunicação rastreável</p>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Ocorrências da OP</h1>
          <p className="mt-1 text-xs font-bold text-slate-400">Registro estruturado por OP, prioridade, status e histórico.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-sky-50 px-4 py-3 dark:bg-sky-950/20"><p className="text-[9px] font-black uppercase text-sky-500">Abertas</p><p className="text-xl font-black text-sky-700">{counters.abertas}</p></div>
          <div className="rounded-2xl bg-rose-50 px-4 py-3 dark:bg-rose-950/20"><p className="text-[9px] font-black uppercase text-rose-500">Críticas</p><p className="text-xl font-black text-rose-700">{counters.criticas}</p></div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/20"><p className="text-[9px] font-black uppercase text-emerald-500">Resolvidas</p><p className="text-xl font-black text-emerald-700">{counters.resolvidas}</p></div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          {canCreate && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Nova ocorrência</h2>
              <div className="mt-4 space-y-3">
                <input value={draft.op} onChange={e => setDraft(p => ({ ...p, op: e.target.value.toUpperCase() }))} placeholder="OP" className="input" />
                <input value={draft.titulo} onChange={e => setDraft(p => ({ ...p, titulo: e.target.value }))} placeholder="Título" className="input" />
                <select value={draft.tipo} onChange={e => setDraft(p => ({ ...p, tipo: e.target.value as OcorrenciaOpTipo }))} className="input">
                  {OCORRENCIA_TIPO_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input value={draft.setor_origem} onChange={e => setDraft(p => ({ ...p, setor_origem: e.target.value }))} placeholder="Setor origem" className="input" />
                  <select value={draft.prioridade} onChange={e => setDraft(p => ({ ...p, prioridade: e.target.value as OcorrenciaOpPrioridade }))} className="input">
                    {OCORRENCIA_PRIORIDADE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <textarea value={draft.descricao} onChange={e => setDraft(p => ({ ...p, descricao: e.target.value }))} placeholder="Descreva a ocorrência..." className="input min-h-28 py-3" />
                <button type="button" onClick={handleCreate} disabled={isSaving} className="h-11 w-full rounded-xl bg-indigo-600 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-700 disabled:opacity-50">
                  Criar ocorrência
                </button>
              </div>
            </section>
          )}

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Filtros</h2>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <input value={filterOp} onChange={e => setFilterOp(e.target.value)} placeholder="Filtrar por OP" className="input" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="input">
                <option value="todos">Todos os status</option>
                {OCORRENCIA_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </section>
        </aside>

        <main className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(360px,480px)_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Lista</h2>
            </div>
            <div className="max-h-[680px] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-sm font-bold text-slate-400">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm font-bold text-slate-400">Nenhuma ocorrência encontrada.</div>
              ) : filtered.map(record => (
                <button key={record.id} type="button" onClick={() => setSelected(record)} className={`w-full border-b border-slate-100 p-4 text-left transition-all hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${selected?.id === record.id ? 'bg-indigo-50 dark:bg-indigo-950/20' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">OP {record.op}</p>
                      <p className="truncate text-sm font-black text-slate-800 dark:text-white">{record.titulo}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${statusClass[record.status]}`}>{optionLabel(OCORRENCIA_STATUS_OPTIONS, record.status)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                    <span className={prioridadeClass[record.prioridade]}>{optionLabel(OCORRENCIA_PRIORIDADE_OPTIONS, record.prioridade)}</span>
                    <span className="text-slate-400">{optionLabel(OCORRENCIA_TIPO_OPTIONS, record.tipo)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            {!selected ? (
              <div className="flex min-h-[520px] items-center justify-center p-8 text-center">
                <div>
                  <span className="material-symbols-outlined text-5xl text-slate-300">forum</span>
                  <p className="mt-2 text-sm font-black uppercase tracking-widest text-slate-400">Selecione uma ocorrência</p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[680px] flex-col">
                <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">OP {selected.op}</p>
                      <h2 className="text-xl font-black text-slate-900 dark:text-white">{selected.titulo}</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${statusClass[selected.status]}`}>{optionLabel(OCORRENCIA_STATUS_OPTIONS, selected.status)}</span>
                      <span className={`rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase dark:bg-slate-800 ${prioridadeClass[selected.prioridade]}`}>{optionLabel(OCORRENCIA_PRIORIDADE_OPTIONS, selected.prioridade)}</span>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm font-medium text-slate-600 dark:text-slate-300">{selected.descricao}</p>
                </div>

                <div className="grid gap-3 border-b border-slate-100 p-5 dark:border-slate-800 md:grid-cols-3">
                  <div><p className="text-[9px] font-black uppercase text-slate-400">Tipo</p><p className="text-sm font-bold text-slate-700 dark:text-slate-200">{optionLabel(OCORRENCIA_TIPO_OPTIONS, selected.tipo)}</p></div>
                  <div><p className="text-[9px] font-black uppercase text-slate-400">Setor</p><p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selected.setor_origem}</p></div>
                  <div><p className="text-[9px] font-black uppercase text-slate-400">Atualizada</p><p className="text-sm font-bold text-slate-700 dark:text-slate-200">{new Date(selected.updated_at).toLocaleString('pt-BR')}</p></div>
                  {canManage && (
                    <>
                      <select value={selected.status} onChange={e => updateSelected({ status: e.target.value as OcorrenciaOpStatus })} className="input">
                        {OCORRENCIA_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <select value={selected.prioridade} onChange={e => updateSelected({ prioridade: e.target.value as OcorrenciaOpPrioridade })} className="input">
                        {OCORRENCIA_PRIORIDADE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </>
                  )}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Histórico</h3>
                  {comments.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400 dark:bg-slate-800/50">Sem comentários ainda.</p>
                  ) : comments.map(comment => (
                    <div key={comment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{comment.comentario}</p>
                      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{new Date(comment.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100 p-5 dark:border-slate-800">
                  <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Adicionar comentário ao histórico..." className="input min-h-24 py-3" />
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={addComment} disabled={isSaving || !commentText.trim()} className="h-10 rounded-xl bg-indigo-600 px-5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-700 disabled:opacity-50">
                      Comentar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

