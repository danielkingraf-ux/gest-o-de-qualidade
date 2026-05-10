import { supabase } from './supabase';

export const LGPD_NOTICE_VERSION = '2026-05-06';

export async function logPrivacyEvent(action: string, resourceType: string, resourceId?: string, metadata: Record<string, unknown> = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('privacy_audit_logs').insert({
      user_id: user.id,
      action,
      resource_type: resourceType,
      resource_id: resourceId || null,
      metadata,
    });
  } catch {
    // Auditoria não deve bloquear o fluxo operacional.
  }
}
