import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../services/supabase';
import { auditService } from '../services/auditService';
import {
  calculateReviewTotals,
  DESTINO_MATERIAL_OPTIONS,
  escolhaRevisaoService,
  ESCOLHA_STATUS_OPTIONS,
  validateEscolhaRevisao,
} from '../services/escolhaRevisaoService';
import type { DestinoMaterialBom, EscolhaRevisaoRegistro, EscolhaRevisaoStatus, Order } from '../types';

const STATUS_BADGE: Record<EscolhaRevisaoStatus, string> = {
  aberta: 'bg-blue-50 text-blue-700 border-blue-100',
  em_revisao: 'bg-amber-50 text-amber-700 border-amber-100',
  parcialmente_revisada: 'bg-orange-50 text-orange-700 border-orange-100',
  finalizada: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  bloqueada: 'bg-rose-50 text-rose-700 border-rose-100',
  liberada: 'bg-cyan-50 text-cyan-700 border-cyan-100',
};

const emptyEntrada = {
  op: '',
  cliente: '',
  produto: '',
  origem_escolha: '',
  setor_detectado: '',
  motivo_escolha: '',
  tipo_defeito: '',
  classificacao_defeito: 'maior',
  quantidade_enviada: 0,
  status: 'aberta' as EscolhaRevisaoStatus,
};

const numberValue = (value: string) => Math.max(0, Number(value) || 0);
const fmt = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const statusLabel = (status: EscolhaRevisaoStatus) =>
  ESCOLHA_STATUS_OPTIONS.find(option => option.value === status)?.label ?? status;

export default function EscolhaRevisaoView() {
  const { showToast } = useToast();
  const { profile, normalizedRole } = useUser();
  const canCreate = normalizedRole === 'administrador' || normalizedRole === 'analista_qualidade';
  const canReview = normalizedRole === 'administrador' || normalizedRole === 'revisao_escolha';

  const [records, setRecords] = useState<EscolhaRevisaoRegistro[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEntrada, setSavingEntrada] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [entrada, setEntrada] = useState(emptyEntrada);
  const [opFilter, setOpFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState({
    quantidade_boa_recuperada: 0,
    quantidade_refugada: 0,
    status: 'em_revisao' as EscolhaRevisaoStatus,
    destino_material_bom: '' as DestinoMaterialBom | '',
    outro_destino: '',
    observacao: '',
  });

  const selected = useMemo(
    () => records.find(record => record.id === selectedId) ?? null,
    [records, selectedId],
  );

  const reviewTotals = useMemo(() => {
    const enviada = selected?.quantidade_enviada ?? 0;
    return calculateReviewTotals(enviada, review.quantidade_boa_recuperada, review.quantidade_refugada);
  }, [review.quantidade_boa_recuperada, review.quantidade_refugada, selected?.quantidade_enviada]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsData, ordersRes] = await Promise.all([
        escolhaRevisaoService.list(),
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(300),
      ]);
      setRecords(recordsData);
      setOrders((ordersRes.data ?? []) as Order[]);
    } catch (error: any) {
      showToast(`Erro ao carregar escolha/revisão: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const applyOrder = (op: string) => {
    const order = orders.find(item => item.op.toLowerCase() === op.trim().toLowerCase());
    setEntrada(prev => ({
      ...prev,
      op,
      cliente: order?.cliente ?? prev.cliente,
      produto: order?.produto ?? prev.produto,
    }));
  };

  const applyFilterOp = (op: string) => {
    setOpFilter(op);
    const normalized = op.trim().toLowerCase();
    const firstMatch = records.find(record => record.op.toLowerCase() === normalized);
    if (firstMatch) selectRecord(firstMatch);
    else setSelectedId(null);
  };

  const resetEntrada = () => setEntrada(emptyEntrada);

  const selectRecord = (record: EscolhaRevisaoRegistro) => {
    setSelectedId(record.id);
    setReview({
      quantidade_boa_recuperada: record.quantidade_boa_recuperada,
      quantidade_refugada: record.quantidade_refugada,
      status: record.status === 'aberta' ? 'em_revisao' : record.status,
      destino_material_bom: record.destino_material_bom ?? '',
      outro_destino: record.outro_destino ?? '',
      observacao: record.observacao ?? '',
    });
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      showToast('Seu perfil não pode criar envio para escolha.', 'warning');
      return;
    }

    const quantidadeEnviada = Number(entrada.quantidade_enviada) || 0;
    const payload = {
      op: entrada.op.trim().toUpperCase(),
      cliente: entrada.cliente.trim() || null,
      produto: entrada.produto.trim() || null,
      origem_escolha: entrada.origem_escolha.trim(),
      setor_detectado: entrada.setor_detectado.trim(),
      motivo_escolha: entrada.motivo_escolha.trim(),
      tipo_defeito: entrada.tipo_defeito.trim(),
      classificacao_defeito: entrada.classificacao_defeito.trim(),
      quantidade_enviada: quantidadeEnviada,
      responsavel_envio_id: profile?.user_id ?? null,
      responsavel_envio_nome: profile?.name ?? null,
      entrada_at: new Date().toISOString(),
      status: entrada.status,
      responsavel_revisao_id: null,
      responsavel_revisao_nome: null,
      quantidade_revisada: 0,
      quantidade_boa_recuperada: 0,
      quantidade_refugada: 0,
      quantidade_pendente: quantidadeEnviada,
      revisao_at: null,
      observacao: null,
      destino_material_bom: null,
      outro_destino: null,
      origem_registro_tabela: null,
      origem_registro_id: null,
      origem_tela: null,
      origem_problema: null,
      created_by: profile?.user_id ?? null,
      updated_by: profile?.user_id ?? null,
    };

    if (!payload.op || !payload.origem_escolha || !payload.setor_detectado || !payload.motivo_escolha || !payload.tipo_defeito) {
      showToast('Preencha OP, origem, setor, motivo e tipo de defeito.', 'warning');
      return;
    }

    const validation = validateEscolhaRevisao(payload);
    if (validation) {
      showToast(validation, 'warning');
      return;
    }

    setSavingEntrada(true);
    try {
      const created = await escolhaRevisaoService.create(payload);
      setRecords(prev => [created, ...prev]);
      resetEntrada();
      showToast('Envio para escolha criado.', 'success');
    } catch (error: any) {
      showToast(`Erro ao criar envio: ${error.message}`, 'error');
    } finally {
      setSavingEntrada(false);
    }
  };

  const handleSaveReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    if (!canReview) {
      showToast('Seu perfil pode consultar, mas não editar revisão.', 'warning');
      return;
    }

    const payload = {
      quantidade_boa_recuperada: review.quantidade_boa_recuperada,
      quantidade_refugada: review.quantidade_refugada,
      quantidade_revisada: reviewTotals.quantidadeRevisada,
      quantidade_pendente: reviewTotals.quantidadePendente,
      status: review.status,
      destino_material_bom: review.destino_material_bom || null,
      outro_destino: review.destino_material_bom === 'outro' ? review.outro_destino.trim() || null : null,
      observacao: review.observacao.trim() || null,
      responsavel_revisao_id: profile?.user_id ?? null,
      responsavel_revisao_nome: profile?.name ?? null,
      revisao_at: new Date().toISOString(),
      updated_by: profile?.user_id ?? null,
      quantidade_enviada: selected.quantidade_enviada,
    };

    const validation = validateEscolhaRevisao(payload);
    if (validation) {
      showToast(validation, 'warning');
      return;
    }

    setSavingReview(true);
    try {
      const updated = await escolhaRevisaoService.update(selected.id, payload);
      if (['finalizada', 'liberada', 'bloqueada'].includes(updated.status)) {
        await auditService.logChange({
          screen: 'Controle de Escolha/Revisão',
          action: `status_${updated.status}`,
          recordTable: 'escolha_revisao_registros',
          recordId: updated.id,
          fieldName: 'status',
          oldValue: selected.status,
          newValue: updated.status,
          justification: review.observacao.trim() || `Alteração de status para ${statusLabel(updated.status)}`,
        }).catch(() => undefined);
      }
      setRecords(prev => prev.map(record => record.id === updated.id ? updated : record));
      setSelectedId(updated.id);
      showToast('Revisão salva.', 'success');
    } catch (error: any) {
      showToast(`Erro ao salvar revisão: ${error.message}`, 'error');
    } finally {
      setSavingReview(false);
    }
  };

  const visibleRecords = useMemo(() => {
    const normalized = opFilter.trim().toLowerCase();
    if (!normalized) return records;
    return records.filter(record => record.op.toLowerCase().includes(normalized));
  }, [opFilter, records]);
  const summaryRecords = visibleRecords;

  return (
    <div className="responsive-page mx-auto max-w-7xl p-4 pb-24 md:p-6 space-y-5 animate-fade-in">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lançamentos</p>
          <h1 className="responsive-mobile-title text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
            Controle de Escolha/Revisão
          </h1>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 text-center sm:grid-cols-3 md:w-auto">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Abertas</p>
            <p className="text-lg font-black text-blue-600">{summaryRecords.filter(r => r.status === 'aberta').length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pendentes</p>
            <p className="text-lg font-black text-amber-600">{fmt(summaryRecords.reduce((sum, r) => sum + r.quantidade_pendente, 0))}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Refugo</p>
            <p className="text-lg font-black text-rose-600">{fmt(summaryRecords.reduce((sum, r) => sum + r.quantidade_refugada, 0))}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Entrada na escolha</h2>
            {!canCreate && <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Somente consulta</span>}
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="OP">
                <input list="escolha-op-list" value={entrada.op} onChange={e => applyOrder(e.target.value)} disabled={!canCreate} className="input" />
                <datalist id="escolha-op-list">
                  {orders.map(order => <option key={order.id} value={order.op}>{order.cliente}</option>)}
                </datalist>
              </Field>
              <Field label="Quantidade enviada">
                <input type="number" min={1} value={entrada.quantidade_enviada || ''} onChange={e => setEntrada(prev => ({ ...prev, quantidade_enviada: numberValue(e.target.value) }))} disabled={!canCreate} className="input" />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Origem da escolha">
                <input value={entrada.origem_escolha} onChange={e => setEntrada(prev => ({ ...prev, origem_escolha: e.target.value }))} disabled={!canCreate} className="input" />
              </Field>
              <Field label="Setor detectado">
                <input value={entrada.setor_detectado} onChange={e => setEntrada(prev => ({ ...prev, setor_detectado: e.target.value }))} disabled={!canCreate} className="input" />
              </Field>
            </div>
            <Field label="Motivo da escolha">
              <textarea value={entrada.motivo_escolha} onChange={e => setEntrada(prev => ({ ...prev, motivo_escolha: e.target.value }))} disabled={!canCreate} className="input min-h-20 py-3" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tipo de defeito">
                <input value={entrada.tipo_defeito} onChange={e => setEntrada(prev => ({ ...prev, tipo_defeito: e.target.value }))} disabled={!canCreate} className="input" />
              </Field>
              <Field label="Classificação">
                <select value={entrada.classificacao_defeito} onChange={e => setEntrada(prev => ({ ...prev, classificacao_defeito: e.target.value }))} disabled={!canCreate} className="input">
                  <option value="critico">Crítico</option>
                  <option value="maior">Maior</option>
                  <option value="menor">Menor</option>
                </select>
              </Field>
            </div>
            <Field label="Status">
              <select value={entrada.status} onChange={e => setEntrada(prev => ({ ...prev, status: e.target.value as EscolhaRevisaoStatus }))} disabled={!canCreate} className="input">
                <option value="aberta">Aberta</option>
                <option value="bloqueada">Bloqueada</option>
              </select>
            </Field>

            <button disabled={!canCreate || savingEntrada} className="h-11 w-full rounded-lg bg-primary text-xs font-black uppercase tracking-widest text-white transition hover:bg-primary/90 disabled:opacity-50">
              {savingEntrada ? 'Salvando...' : 'Criar envio'}
            </button>
          </form>
        </section>

        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 p-4 dark:border-slate-800">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rastreio por OP</p>
                  <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Registros de escolha/revisão</h2>
                </div>
                <div className="w-full md:w-72">
                  <Field label="Filtrar OP">
                    <input
                      list="escolha-filter-op-list"
                      value={opFilter}
                      onChange={e => applyFilterOp(e.target.value)}
                      className="input"
                      placeholder="Digite a OP"
                    />
                    <datalist id="escolha-filter-op-list">
                      {[...new Set(records.map(record => record.op))].map(op => <option key={op} value={op} />)}
                    </datalist>
                  </Field>
                </div>
              </div>
            </div>
            <div className="responsive-table-wrap">
              <table className="responsive-table w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3">OP</th>
                    <th className="px-4 py-3">Defeito</th>
                    <th className="px-4 py-3">Enviado</th>
                    <th className="px-4 py-3">Bom</th>
                    <th className="px-4 py-3">Refugo</th>
                    <th className="px-4 py-3">Pendente</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Carregando...</td></tr>
                  ) : visibleRecords.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Nenhum registro criado.</td></tr>
                  ) : visibleRecords.map(record => (
                    <tr key={record.id} className={selectedId === record.id ? 'bg-primary/5' : ''}>
                      <td className="px-4 py-3 text-sm font-black text-slate-900 dark:text-white">{record.op}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-500">{record.tipo_defeito}</td>
                      <td className="px-4 py-3 text-xs font-black">{fmt(record.quantidade_enviada)}</td>
                      <td className="px-4 py-3 text-xs font-black text-emerald-600">{fmt(record.quantidade_boa_recuperada)}</td>
                      <td className="px-4 py-3 text-xs font-black text-rose-600">{fmt(record.quantidade_refugada)}</td>
                      <td className="px-4 py-3 text-xs font-black text-amber-600">{fmt(record.quantidade_pendente)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_BADGE[record.status]}`}>
                          {statusLabel(record.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => selectRecord(record)} className="rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10">
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selected && (
            <form onSubmit={handleSaveReview} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Revisão</p>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">OP {selected.op}</h2>
                </div>
                {!canReview && <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Somente leitura</span>}
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                <Info label="Enviado" value={fmt(selected.quantidade_enviada)} />
                <Info label="Revisado" value={fmt(reviewTotals.quantidadeRevisada)} />
                <Info label="Bom recuperado" value={fmt(review.quantidade_boa_recuperada)} />
                <Info label="Pendente" value={fmt(reviewTotals.quantidadePendente)} />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Quantidade boa recuperada">
                  <input type="number" min={0} value={review.quantidade_boa_recuperada || ''} onChange={e => setReview(prev => ({ ...prev, quantidade_boa_recuperada: numberValue(e.target.value) }))} disabled={!canReview} className="input" />
                </Field>
                <Field label="Quantidade refugada">
                  <input type="number" min={0} value={review.quantidade_refugada || ''} onChange={e => setReview(prev => ({ ...prev, quantidade_refugada: numberValue(e.target.value) }))} disabled={!canReview} className="input" />
                </Field>
                <Field label="Status">
                  <select value={review.status} onChange={e => setReview(prev => ({ ...prev, status: e.target.value as EscolhaRevisaoStatus }))} disabled={!canReview} className="input">
                    {ESCOLHA_STATUS_OPTIONS.filter(option => option.value !== 'aberta').map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Destino do material bom">
                  <select value={review.destino_material_bom} onChange={e => setReview(prev => ({ ...prev, destino_material_bom: e.target.value as DestinoMaterialBom | '' }))} disabled={!canReview} className="input">
                    <option value="">Selecione</option>
                    {DESTINO_MATERIAL_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {review.destino_material_bom === 'outro' && (
                <div className="mt-3">
                  <Field label="Outro destino">
                    <input value={review.outro_destino} onChange={e => setReview(prev => ({ ...prev, outro_destino: e.target.value }))} disabled={!canReview} className="input" />
                  </Field>
                </div>
              )}

              <div className="mt-3">
                <Field label="Observação">
                  <textarea value={review.observacao} onChange={e => setReview(prev => ({ ...prev, observacao: e.target.value }))} disabled={!canReview} className="input min-h-24 py-3" />
                </Field>
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 md:flex-row md:items-center md:justify-between">
                <p className="text-xs font-bold text-slate-500">
                  Pendente é calculado automaticamente: enviada - bom recuperado - refugo.
                </p>
                <button disabled={!canReview || savingReview} className="h-11 rounded-lg bg-emerald-600 px-6 text-xs font-black uppercase tracking-widest text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  {savingReview ? 'Salvando...' : 'Salvar revisão'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
