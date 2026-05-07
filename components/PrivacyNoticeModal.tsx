import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { LGPD_NOTICE_VERSION, logPrivacyEvent } from '../services/privacyService';

export default function PrivacyNoticeModal({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const checkAcceptance = async () => {
      const { data, error } = await supabase
        .from('privacy_acknowledgements')
        .select('id')
        .eq('user_id', userId)
        .eq('notice_version', LGPD_NOTICE_VERSION)
        .maybeSingle();

      if (!active) return;
      setNeedsAcceptance(Boolean(error || !data));
      setLoading(false);
    };

    checkAcceptance();
    return () => { active = false; };
  }, [userId]);

  const acceptNotice = async () => {
    setSaving(true);
    try {
      await supabase.from('privacy_acknowledgements').insert({
        user_id: userId,
        notice_version: LGPD_NOTICE_VERSION,
        accepted_at: new Date().toISOString(),
      });
      await logPrivacyEvent('privacy_notice_accept', 'privacy_notice', LGPD_NOTICE_VERSION);
      setNeedsAcceptance(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !needsAcceptance) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined">verified_user</span>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aviso de privacidade LGPD</p>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
              Uso de dados pessoais no sistema
            </h2>
          </div>
        </div>

        <div className="space-y-3 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
          <p>
            Este sistema registra dados necessários para controle de qualidade, rastreabilidade operacional,
            auditoria de alterações, documentos internos e comunicação entre turnos.
          </p>
          <p>
            Podem ser tratados nome, e-mail corporativo, função, registros de acesso, autoria de cadastros,
            mensagens operacionais, vínculos com OPs, máquinas, análises e documentos.
          </p>
          <p>
            O acesso deve ser feito somente por usuários autorizados e para finalidade profissional. Evite inserir
            dados pessoais desnecessários em observações, mensagens ou documentos.
          </p>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-xs font-bold text-slate-500 dark:bg-slate-950">
          Versão do aviso: {LGPD_NOTICE_VERSION}. O aceite será registrado para fins de conformidade e auditoria.
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <a
            href="/#/lgpd"
            className="flex h-11 items-center justify-center rounded-lg border border-slate-200 px-5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Ver detalhes
          </a>
          <button
            type="button"
            onClick={acceptNotice}
            disabled={saving}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
            Li e estou ciente
          </button>
        </div>
      </div>
    </div>
  );
}
