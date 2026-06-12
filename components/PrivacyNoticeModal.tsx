import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { LGPD_NOTICE_VERSION, logPrivacyEvent } from '../services/privacyService';

export default function PrivacyNoticeModal({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
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
    check();
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
    // bottom-24 deixa livre a barra de ações sticky (Salvar/Finalizar) das telas de produção
    <div className="fixed bottom-24 left-1/2 z-[120] w-full max-w-lg -translate-x-1/2 px-4">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <span className="material-symbols-outlined shrink-0 text-base text-primary">verified_user</span>
        <p className="flex-1 text-[10px] font-semibold leading-snug text-slate-500 dark:text-slate-400">
          Este sistema trata dados operacionais (nome, e-mail, registros) para controle de qualidade e rastreabilidade.{' '}
          <a href="/#/lgpd" className="underline hover:text-primary">Saiba mais</a>
        </p>
        <button
          type="button"
          onClick={acceptNotice}
          disabled={saving}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {saving
            ? <span className="material-symbols-outlined animate-spin text-sm leading-none">progress_activity</span>
            : 'Ciente'}
        </button>
      </div>
    </div>
  );
}
