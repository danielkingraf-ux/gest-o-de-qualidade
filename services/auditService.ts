import { supabase } from './supabase';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type AuditLogInput = {
  screen: string;
  action: string;
  recordTable?: string;
  recordId?: string;
  fieldName?: string;
  oldValue?: JsonValue;
  newValue?: JsonValue;
  justification: string;
};

export type CriticalActionRequestInput = {
  actionKey: string;
  screen: string;
  recordTable?: string;
  recordId?: string;
  justification: string;
  payload?: Record<string, JsonValue>;
};

export const auditService = {
  async logChange(input: AuditLogInput) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('permission_audit_logs').insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      screen: input.screen,
      action: input.action,
      record_table: input.recordTable ?? null,
      record_id: input.recordId ?? null,
      field_name: input.fieldName ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      justification: input.justification,
    });
    if (error) throw error;
  },

  async requestCriticalAction(input: CriticalActionRequestInput) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('critical_action_requests')
      .insert({
        action_key: input.actionKey,
        screen: input.screen,
        record_table: input.recordTable ?? null,
        record_id: input.recordId ?? null,
        requested_by: user?.id ?? null,
        justification: input.justification,
        payload: input.payload ?? {},
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
