
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useToast } from '../contexts/ToastContext';
import { authService } from '../services/authService';

export default function DocumentationView() {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState('Todas');
  const [storageUsage, setStorageUsage] = useState(0); // Dummy usage for now

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      // Silent fail if table doesn't exist yet, just show empty
      console.error('Error fetching docs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    setUploading(true);
    const file = event.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // 3. Insert into Table
      const user = await authService.getCurrentUser();
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          name: file.name,
          type: 'Manual', // Default for now, could be dynamic
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          url: publicUrl,
          origin: 'Upload Manual',
          uploaded_by: user?.id
        });

      if (dbError) throw dbError;

      showToast('Documento enviado com sucesso!');
      fetchDocuments();
    } catch (error: any) {
      console.error(error);
      showToast('Erro ao enviar documento: ' + error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, url: string) => {
    if (!confirm('Deseja realmente excluir este arquivo?')) return;

    try {
      // Extract file path from URL if needed, or store path in DB. 
      // For now assuming we can just delete row, but ideally delete from storage too.
      // Getting path from URL is tricky if not stored. 
      // Simplified: Just delete DB record for MVP or if permissions allow.

      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;

      showToast('Documento removido.');
      fetchDocuments();
    } catch (error: any) {
      showToast('Erro ao excluir: ' + error.message, 'error');
    }
  };

  const filteredDocs = filterType === 'Todas'
    ? documents
    : documents.filter(d => d.type === filterType);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
            Gestão Documental • Kingraf
          </p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Repositório de Documentos</h1>
          <p className="text-xs text-slate-500 font-medium">Acesse e gerencie documentos técnicos vinculados ao processo produtivo.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchDocuments}
            className="flex items-center gap-2 px-4 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-all">
            <span className="material-symbols-outlined text-lg">sync</span>
            Atualizar
          </button>
          <label className={`cursor-pointer flex items-center gap-2 px-6 h-10 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="material-symbols-outlined text-lg">{uploading ? 'progress_activity' : 'cloud_upload'}</span>
            {uploading ? 'ENVIANDO...' : 'NOVO UPLOAD'}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-6 border-b border-slate-50 dark:border-slate-800/50">
              <div className="space-y-1">
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">folder_open</span>
                  Arquivos Disponíveis
                </h3>
              </div>
              <span className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest text-slate-500">{documents.length} itens</span>
            </div>

            {loading ? (
              <div className="p-12 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : documents.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2">folder_off</span>
                <p className="text-sm font-medium">Nenhum documento encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-400 font-bold border-b border-slate-50 dark:border-slate-800 uppercase text-[10px] tracking-widest">
                      <th className="px-6 py-4">Data Registro</th>
                      <th className="px-6 py-4">Arquivo / Tipo</th>
                      <th className="px-6 py-4 text-center">Origem</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {filteredDocs.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{new Date(doc.created_at).toLocaleTimeString('pt-BR')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-slate-900 dark:text-slate-200 group-hover:text-primary transition-colors uppercase tracking-tight">{doc.name}</span>
                            <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{doc.type || 'Geral'} • {doc.size}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest text-slate-500">
                            {doc.origin || 'Sistema'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 hover:bg-emerald-500/10 rounded-lg text-emerald-500 transition-colors"
                              title="Baixar"
                            >
                              <span className="material-symbols-outlined text-lg">download</span>
                            </a>
                            <button
                              onClick={() => handleDelete(doc.id, doc.url)}
                              className="p-2 hover:bg-rose-500/10 rounded-lg text-rose-500 transition-colors"
                              title="Excluir"
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

          <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center text-center hover:border-primary/50 transition-all group cursor-pointer">
            <div className={`size-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4 group-hover:scale-110 transition-transform ${uploading ? 'animate-pulse' : ''}`}>
              <span className="material-symbols-outlined text-2xl text-primary">{uploading ? 'cloud_upload' : 'folder_zip'}</span>
            </div>
            <h4 className="text-[10px] font-black text-slate-900 dark:text-white mb-2 uppercase tracking-widest">Área de Upload Rápido</h4>
            <p className="text-[10px] text-slate-500 max-w-xs font-bold uppercase tracking-wide">Arraste arquivos ou clique no botão superior</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">filter_alt</span>
              Filtragem Avançada
            </h4>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria de Arquivo</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full h-10 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-white transition-all outline-none px-4"
                >
                  <option value="Todas">TODOS OS TIPOS</option>
                  <option value="Manual">MANUAIS TÉCNICOS</option>
                  <option value="Procedimento">PROCEDIMENTOS OPERACIONAIS</option>
                  <option value="Tecnico">DESENHOS TÉCNICOS</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 dark:bg-slate-950 rounded-3xl border border-slate-800 p-6 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-6xl">cloud</span>
            </div>
            <h4 className="text-[10px] font-black text-primary mb-6 flex items-center gap-2 uppercase tracking-widest relative">
              <span className="material-symbols-outlined text-lg">cloud</span>
              Status do Armazenamento
            </h4>
            <div className="space-y-4 relative">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-slate-500">Uso do Disco</span>
                <span className="text-white">Kingraf Cloud</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[3%] rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]"></div>
              </div>
              <p className="text-[9px] text-slate-500 text-center font-black uppercase tracking-widest">Sincronização Ativa</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
