import React, { useState, useRef, useCallback } from 'react';
import type { PendingPhoto, DefectPhoto } from '../services/defectPhotoService';
import { defectPhotoService } from '../services/defectPhotoService';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface DefectPhotoUploadProps {
  /** Fotos pendentes (ainda nao salvas — mantidas no state do formulario pai) */
  pendingPhotos: PendingPhoto[];
  onPendingChange: (photos: PendingPhoto[]) => void;
  /** Fotos ja salvas (quando exibindo inspecao existente) */
  savedPhotos?: DefectPhoto[];
  onSavedRemove?: (photo: DefectPhoto) => void;
  /** Limites */
  maxPhotos?: number;
  maxSizeMb?: number;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DEFAULT_MAX_PHOTOS = 10;
const DEFAULT_MAX_SIZE_MB = 5;

// ─── Componente principal ────────────────────────────────────────────────────
const DefectPhotoUpload: React.FC<DefectPhotoUploadProps> = ({
  pendingPhotos,
  onPendingChange,
  savedPhotos = [],
  onSavedRemove,
  maxPhotos = DEFAULT_MAX_PHOTOS,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalPhotos = pendingPhotos.length + savedPhotos.length;
  const canAdd = totalPhotos < maxPhotos && !disabled;

  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const remaining = maxPhotos - totalPhotos;
    if (remaining <= 0) {
      setError(`Limite de ${maxPhotos} fotos atingido`);
      return;
    }

    const newPhotos: PendingPhoto[] = [];
    const maxBytes = maxSizeMb * 1024 * 1024;

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`Formato nao aceito: ${file.name}. Use JPEG, PNG ou WebP.`);
        continue;
      }

      if (file.size > maxBytes) {
        setError(`Arquivo muito grande: ${file.name} (max ${maxSizeMb}MB)`);
        continue;
      }

      newPhotos.push({
        id: `pending_${Date.now()}_${i}`,
        file,
        preview: URL.createObjectURL(file),
        defectType: '',
        caption: '',
      });
    }

    if (newPhotos.length > 0) {
      onPendingChange([...pendingPhotos, ...newPhotos]);
    }
  }, [pendingPhotos, onPendingChange, totalPhotos, maxPhotos, maxSizeMb]);

  const removePending = useCallback((id: string) => {
    const photo = pendingPhotos.find(p => p.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    onPendingChange(pendingPhotos.filter(p => p.id !== id));
  }, [pendingPhotos, onPendingChange]);

  const updatePendingCaption = useCallback((id: string, caption: string) => {
    onPendingChange(pendingPhotos.map(p => p.id === id ? { ...p, caption } : p));
  }, [pendingPhotos, onPendingChange]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-slate-400">photo_camera</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            Fotos do Defeito
          </span>
          {totalPhotos > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black">
              {totalPhotos}/{maxPhotos}
            </span>
          )}
        </div>
        <span className="text-[9px] text-slate-400">Opcional</span>
      </div>

      {/* Botoes de adicionar */}
      {canAdd && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-primary hover:bg-primary/5 text-slate-500 hover:text-primary transition-all"
          >
            <span className="material-symbols-outlined text-lg">photo_camera</span>
            <span className="text-xs font-bold">Camera</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-primary hover:bg-primary/5 text-slate-500 hover:text-primary transition-all"
          >
            <span className="material-symbols-outlined text-lg">upload_file</span>
            <span className="text-xs font-bold">Galeria</span>
          </button>

          {/* Inputs invisveis */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            multiple
            className="hidden"
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
          <span className="material-symbols-outlined text-rose-500 text-sm">warning</span>
          <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-600">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Grid de thumbnails */}
      {totalPhotos > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {/* Fotos ja salvas */}
          {savedPhotos.map(photo => (
            <div key={photo.id} className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
              <img
                src={photo.signedUrl || ''}
                alt={photo.caption || photo.file_name}
                className="w-full aspect-square object-cover cursor-pointer"
                onClick={() => setPreviewUrl(photo.signedUrl || null)}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                {photo.caption && (
                  <p className="text-[9px] text-white font-medium truncate">{photo.caption}</p>
                )}
                {photo.defect_type && (
                  <p className="text-[8px] text-white/70 font-bold uppercase tracking-wider truncate">{photo.defect_type}</p>
                )}
              </div>
              {/* Badge salvo */}
              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-emerald-500 text-[8px] font-black text-white uppercase">
                Salva
              </div>
              {/* Botao remover */}
              {onSavedRemove && !disabled && (
                <button
                  type="button"
                  onClick={() => onSavedRemove(photo)}
                  className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600"
                >
                  <span className="material-symbols-outlined text-xs">close</span>
                </button>
              )}
            </div>
          ))}

          {/* Fotos pendentes (ainda nao salvas) */}
          {pendingPhotos.map(photo => (
            <div key={photo.id} className="group relative rounded-xl overflow-hidden border border-amber-200 dark:border-amber-700 bg-slate-100 dark:bg-slate-800">
              <img
                src={photo.preview}
                alt={photo.caption || 'Foto pendente'}
                className="w-full aspect-square object-cover cursor-pointer"
                onClick={() => setPreviewUrl(photo.preview)}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                <input
                  type="text"
                  value={photo.caption}
                  onChange={e => updatePendingCaption(photo.id, e.target.value)}
                  placeholder="Descricao..."
                  className="w-full bg-transparent text-[9px] text-white placeholder-white/50 outline-none border-b border-white/20 focus:border-white/60 pb-0.5"
                  disabled={disabled}
                />
              </div>
              {/* Badge pendente */}
              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-500 text-[8px] font-black text-white uppercase">
                Pendente
              </div>
              {/* Botao remover */}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removePending(photo.id)}
                  className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600"
                >
                  <span className="material-symbols-outlined text-xs">close</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de preview ampliado */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={previewUrl}
              alt="Preview ampliado"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 size-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shadow-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DefectPhotoUpload;
