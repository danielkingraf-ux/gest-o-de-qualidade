
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
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black leading-tight tracking-tight text-slate-800 dark:text-white uppercase">Gestão Documental</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">Acesse e envie documentos técnicos vinculados ao processo produtivo.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchDocuments}
            className="flex items-center gap-2 px-5 h-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-all shadow-sm">
            <span className="material-symbols-outlined">sync</span>
            Atualizar
          </button>
          <label className={`cursor-pointer flex items-center gap-2 px-6 h-12 bg-primary text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="material-symbols-outlined">{uploading ? 'progress_activity' : 'cloud_upload'}</span>
            {uploading ? 'Enviando...' : 'Novo Upload'}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">folder_open</span>
                Arquivos Disponíveis
              </h3>
              <span className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider text-slate-600">{documents.length} Arquivos</span>
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
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold border-b border-slate-100 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                      <th className="px-6 py-4">Data/Hora</th>
                      <th className="px-6 py-4">Arquivo</th>
                      <th className="px-6 py-4">Origem</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {filteredDocs.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-medium">
                          {new Date(doc.created_at).toLocaleDateString('pt-BR')} <br />
                          <span className="text-[10px] opacity-70">{new Date(doc.created_at).toLocaleTimeString('pt-BR')}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors">{doc.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{doc.type || 'Geral'} • {doc.size}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-400 text-center">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-[10px] uppercase tracking-wider">
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

          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 flex flex-col items-center justify-center text-center hover:border-primary/50 transition-colors group">
            <div className={`size-16 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4 group-hover:scale-110 transition-transform ${uploading ? 'animate-pulse' : ''}`}>
              <span className="material-symbols-outlined text-4xl text-primary">{uploading ? 'cloud_upload' : 'folder_zip'}</span>
            </div>
            <h4 className="font-bold text-slate-800 dark:text-white mb-2 uppercase tracking-wide">Area de Upload</h4>
            <p className="text-xs text-slate-500 max-w-xs font-medium mb-6">Arraste seus arquivos aqui ou clique no botão acima para adicionar novos documentos.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
            <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">filter_alt</span>
              Filtros
            </h4>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de Documento</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full h-12 bg-slate-50 dark:bg-slate-800 border-transparent focus:border-primary focus:ring-0 rounded-xl text-sm font-bold text-slate-700 dark:text-white transition-all outline-none px-4 appearance-none"
                >
                  <option value="Todas">Todos os tipos</option>
                  <option value="Manual">Manuais</option>
                  <option value="Procedimento">Procedimentos</option>
                  <option value="Tecnico">Desenhos Técnicos</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-transparent rounded-[2rem] border border-primary/20 p-8">
            <h4 className="text-xs font-black text-primary mb-6 flex items-center gap-2 uppercase tracking-widest">
              <span className="material-symbols-outlined text-lg">cloud</span>
              Storage Status
            </h4>
            <div className="space-y-4">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className="text-slate-500">Uso do Disco</span>
                <span className="text-slate-900 dark:text-white">Ilimitado</span>
              </div>
              <div className="h-2 w-full bg-white dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-primary w-[5%] rounded-full"></div>
              </div>
              <p className="text-[10px] text-slate-400 text-center font-medium uppercase tracking-widest">Sincronizado automaticamente</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
