import { supabase } from './supabase';

export type RecordTable = 'inspections' | 'acabamento_registros' | 'pallet_inspections';

export interface DefectPhoto {
  id: string;
  record_id: string;
  record_table: RecordTable;
  file_path: string;
  file_name: string;
  file_size: number | null;
  defect_type: string | null;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
  signedUrl?: string;
}

export interface PendingPhoto {
  id: string;
  file: File;
  preview: string;
  defectType: string;
  caption: string;
}

const BUCKET = 'defect-photos';
const SIGNED_URL_EXPIRY = 3600; // 1 hora

function buildFilePath(recordTable: RecordTable, recordId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${recordTable}/${recordId}/${timestamp}_${sanitized}`;
}

export const defectPhotoService = {
  /**
   * Faz upload de uma foto e registra os metadados no banco.
   */
  async upload(params: {
    recordId: string;
    recordTable: RecordTable;
    file: File;
    defectType?: string;
    caption?: string;
    userId?: string;
  }): Promise<DefectPhoto> {
    const filePath = buildFilePath(params.recordTable, params.recordId, params.file.name);

    // Upload do arquivo para o storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, params.file, { upsert: false });

    if (uploadError) throw uploadError;

    // Registrar metadados na tabela
    const { data, error: insertError } = await supabase
      .from('defect_photos')
      .insert([{
        record_id: params.recordId,
        record_table: params.recordTable,
        file_path: filePath,
        file_name: params.file.name,
        file_size: params.file.size,
        defect_type: params.defectType || null,
        caption: params.caption || null,
        uploaded_by: params.userId || null,
      }])
      .select()
      .single();

    if (insertError) {
      // Rollback: remove arquivo do storage se o insert falhar
      await supabase.storage.from(BUCKET).remove([filePath]);
      throw insertError;
    }

    return data as DefectPhoto;
  },

  /**
   * Faz upload de multiplas fotos de uma vez (apos salvar o registro).
   */
  async uploadMany(params: {
    recordId: string;
    recordTable: RecordTable;
    photos: PendingPhoto[];
    userId?: string;
  }): Promise<DefectPhoto[]> {
    const results: DefectPhoto[] = [];

    for (const photo of params.photos) {
      const uploaded = await defectPhotoService.upload({
        recordId: params.recordId,
        recordTable: params.recordTable,
        file: photo.file,
        defectType: photo.defectType || undefined,
        caption: photo.caption || undefined,
        userId: params.userId,
      });
      results.push(uploaded);
    }

    return results;
  },

  /**
   * Lista fotos de um registro com URLs assinadas temporarias.
   */
  async listByRecord(recordId: string, recordTable: RecordTable): Promise<DefectPhoto[]> {
    const { data, error } = await supabase
      .from('defect_photos')
      .select('*')
      .eq('record_id', recordId)
      .eq('record_table', recordTable)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Gerar URLs assinadas em lote
    const paths = data.map((p: DefectPhoto) => p.file_path);
    const { data: signedData, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_EXPIRY);

    if (signError) throw signError;

    return data.map((photo: DefectPhoto, i: number) => ({
      ...photo,
      signedUrl: signedData?.[i]?.signedUrl || '',
    }));
  },

  /**
   * Remove uma foto (storage + registro).
   */
  async remove(photoId: string, filePath: string): Promise<void> {
    const { error: deleteError } = await supabase
      .from('defect_photos')
      .delete()
      .eq('id', photoId);

    if (deleteError) throw deleteError;

    await supabase.storage.from(BUCKET).remove([filePath]);
  },

  /**
   * Conta fotos de um registro (para badges/indicadores).
   */
  async countByRecord(recordId: string, recordTable: RecordTable): Promise<number> {
    const { count, error } = await supabase
      .from('defect_photos')
      .select('id', { count: 'exact', head: true })
      .eq('record_id', recordId)
      .eq('record_table', recordTable);

    if (error) throw error;
    return count ?? 0;
  },
};
