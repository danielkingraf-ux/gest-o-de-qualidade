import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { logPrivacyEvent } from '../services/privacyService';

type DocCategory = 'Manual' | 'Procedimento' | 'Tecnico' | 'Formulario' | 'Instrucao' | 'Outro';

type DocumentRecord = {
  id: string;
  name: string;
  type: DocCategory | string;
  size?: string;
  url: string;
  origin?: string;
  description?: string;
  file_path?: string;
  signed_url?: string;
  created_at: string;
};

const CATEGORIES: Array<{ value: DocCategory | 'Todas'; label: string }> = [
  { value: 'Todas', label: 'Todos os tipos' },
  { value: 'Manual', label: 'Manual técnico' },
  { value: 'Procedimento', label: 'Procedimento operacional' },
  { value: 'Tecnico', label: 'Desenho técnico' },
  { value: 'Formulario', label: 'Formulário' },
  { value: 'Instrucao', label: 'Instrução de trabalho' },
  { value: 'Outro', label: 'Outro' },
];

const INITIAL_FORM = {
  name: '',
  type: 'Procedimento' as DocCategory,
  origin: '',
  description: '',
};

const fileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const fileKind = (doc: DocumentRecord) => {
  const target = `${doc.file_path || doc.url || ''} ${doc.name || ''}`.toLowerCase();
  if (target.includes('.pdf')) return 'pdf';
  if (/\.(png|jpg|jpeg|webp|gif|bmp)(\?|$|\s)/.test(target)) return 'image';
  return 'other';
};

export default function DocumentationView() {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('Todas');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(INITIAL_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [viewerDoc, setViewerDoc] = useState<DocumentRecord | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const withSignedUrls = await Promise.all(((data || []) as DocumentRecord[]).map(async (doc) => {
        if (!doc.file_path) return doc;
        const { data: signed } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 60 * 60);
        return { ...doc, signed_url: signed?.signedUrl || doc.url };
      }));
      setDocuments(withSignedUrls);
    } catch (error: any) {
      showToast(`Erro ao carregar documentos: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const filteredDocs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents.filter((doc) => {
      if (filterType !== 'Todas' && doc.type !== filterType) return false;
      if (!term) return true;
      return [doc.name, doc.type, doc.origin, doc.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [documents, filterType, search]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      showToast('Selecione um arquivo para cadastrar', 'warning');
      return;
    }

    const documentName = form.name.trim() || file.name;
    const extension = file.name.split('.').pop() || 'arquivo';
    const safeName = documentName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 60);
    const filePath = `${Date.now()}-${safeName || 'documento'}.${extension}`;

    setSaving(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          name: documentName,
          type: form.type,
          size: fileSize(file.size),
          url: filePath,
          origin: form.origin.trim() || 'Cadastro documental',
          description: form.description.trim(),
          file_path: filePath,
          uploaded_by: user?.id,
        });

      if (dbError) throw dbError;

      setForm(INITIAL_FORM);
      setFile(null);
      const input = document.getElementById('document-file') as HTMLInputElement | null;
      if (input) input.value = '';
      showToast('Documento cadastrado para visualização', 'success');
      await logPrivacyEvent('document_upload', 'documents', undefined, { name: documentName, type: form.type });
      fetchDocuments();
    } catch (error: any) {
      showToast(`Erro ao cadastrar documento: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc: DocumentRecord) => {
    if (!confirm('Deseja realmente excluir este documento?')) return;

    try {
      if (doc.file_path) {
        await supabase.storage.from('documents').remove([doc.file_path]);
      }

      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;

      showToast('Documento removido', 'success');
      await logPrivacyEvent('document_delete', 'documents', doc.id, { name: doc.name, type: doc.type });
      fetchDocuments();
    } catch (error: any) {
      showToast(`Erro ao excluir: ${error.message}`, 'error');
    }
  };

  return (
    <div className="mx-auto max-w-7xl animate-fade-in space-y-4 p-4 pb-20 md:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <span className="size-1.5 rounded-full bg-primary" />
          Gestão documental Kingraf
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Documentação</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Cadastre documentos, procedimentos, desenhos e formulários para consulta pela equipe.
            </p>
          </div>
          <button
            onClick={fetchDocuments}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
          >
            <span className="material-symbols-outlined text-lg">sync</span>
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Cadastrar Documento</h2>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nome para visualização</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Ex: Procedimento de inspeção final"
                className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Categoria</span>
              <select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as DocCategory })}
                className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {CATEGORIES.filter((item) => item.value !== 'Todas').map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Origem / setor</span>
              <input
                value={form.origin}
                onChange={(event) => setForm({ ...form, origin: event.target.value })}
                placeholder="Ex: Qualidade, Produção, Engenharia"
                className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Descrição</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={4}
                placeholder="Observações para ajudar a equipe a encontrar o documento"
                className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>

            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-center transition hover:border-primary dark:border-slate-700 dark:bg-slate-950">
              <input
                id="document-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ods,.csv"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <span className="material-symbols-outlined mb-2 text-3xl text-primary">upload_file</span>
              <span className="max-w-full truncate text-xs font-black uppercase tracking-widest text-slate-500">
                {file ? file.name : 'Selecionar arquivo'}
              </span>
              {file && <span className="mt-1 text-[10px] font-bold text-slate-400">{fileSize(file.size)}</span>}
            </label>

            <button
              type="submit"
              disabled={saving}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-base ${saving ? 'animate-spin' : ''}`}>
                {saving ? 'progress_activity' : 'save'}
              </span>
              {saving ? 'Cadastrando...' : 'Cadastrar para Visualização'}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]">
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">search</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome, origem ou descrição"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <select
                value={filterType}
                onChange={(event) => setFilterType(event.target.value)}
                className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
              <div className="flex h-11 items-center justify-center rounded-lg bg-slate-100 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800">
                {filteredDocs.length} itens
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {loading ? (
              <div className="flex justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <span className="material-symbols-outlined mb-2 text-4xl">folder_off</span>
                <p className="text-sm font-medium">Nenhum documento encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-800/30">
                      <th className="px-5 py-4">Documento</th>
                      <th className="px-5 py-4">Categoria</th>
                      <th className="px-5 py-4">Cadastro</th>
                      <th className="px-5 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {filteredDocs.map((doc) => (
                      <tr key={doc.id} className="group transition hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                        <td className="px-5 py-4">
                          <p className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">{doc.name}</p>
                          <p className="mt-1 max-w-xl truncate text-[11px] font-bold text-slate-400">{doc.description || doc.url}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                            {doc.type || 'Geral'}
                          </span>
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{doc.origin || 'Sistema'} • {doc.size || '-'}</p>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{new Date(doc.created_at).toLocaleTimeString('pt-BR')}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setViewerDoc(doc);
                                logPrivacyEvent('document_view', 'documents', doc.id, { name: doc.name, type: doc.type });
                              }}
                              className="rounded-lg p-2 text-primary transition hover:bg-primary/10"
                              aria-label="Visualizar"
                              data-tooltip="Visualizar"
                            >
                              <span className="material-symbols-outlined text-lg">visibility</span>
                            </button>
                            <a
                              href={doc.signed_url || doc.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => logPrivacyEvent('document_open', 'documents', doc.id, { name: doc.name, type: doc.type })}
                              className="rounded-lg p-2 text-emerald-500 transition hover:bg-emerald-500/10"
                              aria-label="Abrir em nova aba"
                              data-tooltip="Abrir"
                            >
                              <span className="material-symbols-outlined text-lg">open_in_new</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc)}
                              className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-500/10"
                              aria-label="Excluir"
                              data-tooltip="Excluir"
                            >
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {viewerDoc && (
        <DocumentViewer doc={viewerDoc} onClose={() => setViewerDoc(null)} />
      )}
    </div>
  );
}

function DocumentViewer({ doc, onClose }: { doc: DocumentRecord; onClose: () => void }) {
  const kind = fileKind(doc);
  const displayUrl = doc.signed_url || doc.url;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase tracking-tight text-white">{doc.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{doc.type || 'Documento'} • {doc.origin || 'Sistema'}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={displayUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-white/20"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              Abrir
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Fechar"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-slate-900">
          {kind === 'image' ? (
            <div className="flex h-full items-center justify-center p-4">
              <img src={displayUrl} alt={doc.name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : kind === 'pdf' ? (
            <iframe title={doc.name} src={displayUrl} className="h-full w-full bg-white" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <span className="material-symbols-outlined mb-3 text-5xl text-slate-500">draft</span>
              <p className="text-sm font-black uppercase tracking-widest text-white">Pré-visualização indisponível para este formato</p>
              <p className="mt-2 max-w-md text-xs font-medium text-slate-400">
                Use o botão Abrir para visualizar ou baixar o arquivo no aplicativo compatível.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
