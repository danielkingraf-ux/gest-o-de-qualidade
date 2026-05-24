import React from 'react';
import { createPortal } from 'react-dom';

interface SecurityModalProps {
  onClose: () => void;
}

const SecurityModal = ({ onClose }: SecurityModalProps) => createPortal(
  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
    <div
      className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-in"
      onClick={e => e.stopPropagation()}
    >
      {/* Header do modal */}
      <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-8 py-6 rounded-t-3xl flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-emerald-500 text-2xl">verified_user</span>
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Seguranca do Sistema</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium">Como seus dados sao protegidos nesta plataforma</p>
        </div>
        <button onClick={onClose} className="size-10 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors shrink-0">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="px-8 py-6 space-y-5">

        {/* Autenticacao */}
        <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-blue-600 text-xl">lock</span>
            <h3 className="text-sm font-black text-blue-900 dark:text-blue-300 uppercase tracking-wide">Autenticacao JWT</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-[9px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-widest">Supabase Auth</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Todo acesso exige login com e-mail e senha. Apos autenticacao, o sistema gera um <strong className="text-slate-800 dark:text-slate-200">token JWT</strong> assinado digitalmente com validade curta. Cada requisicao ao banco carrega esse token — sem ele, nenhuma operacao e executada. O token e renovado automaticamente enquanto a sessao esta ativa e invalidado imediatamente no logout.
          </p>
        </div>

        {/* RLS */}
        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-indigo-600 text-xl">shield</span>
            <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-wide">RLS — Row Level Security</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-widest">PostgreSQL</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
            O banco de dados aplica <strong className="text-slate-800 dark:text-slate-200">politicas de seguranca linha a linha</strong>. Mesmo que alguem tente acessar diretamente o banco com credenciais validas, o PostgreSQL filtra automaticamente o que cada papel pode ver ou modificar:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            {[
              { label: 'inspections', desc: 'Analistas leem/criam; supervisores tem acesso total' },
              { label: 'orders', desc: 'Leitura aberta para autenticados; escrita restrita' },
              { label: 'user_profiles', desc: 'Cada usuario ve apenas seu proprio perfil' },
              { label: 'edit_requests', desc: 'Aprovacao exclusiva de supervisores' },
              { label: 'nqa_profiles', desc: 'Leitura para todos; gerencia so por supervisor' },
              { label: 'blocklist / LGPD', desc: 'Acesso restrito a funcoes internas do sistema' },
            ].map(item => (
              <div key={item.label} className="flex gap-2 bg-white dark:bg-slate-800/60 rounded-xl p-3 border border-indigo-100 dark:border-indigo-900/30">
                <span className="material-symbols-outlined text-indigo-400 text-base shrink-0 mt-0.5">table_rows</span>
                <div>
                  <p className="font-black text-slate-700 dark:text-slate-200 font-mono">{item.label}</p>
                  <p className="text-slate-500 dark:text-slate-400 leading-snug">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funcoes de controle de acesso */}
        <div className="rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-amber-600 text-xl">functions</span>
            <h3 className="text-sm font-black text-amber-900 dark:text-amber-300 uppercase tracking-wide">Funcoes de Controle</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-widest">SQL Functions</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            A funcao <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-amber-800 dark:text-amber-300 font-mono font-bold">current_user_role()</code> e executada <strong className="text-slate-800 dark:text-slate-200">dentro do proprio banco</strong> a cada operacao sensivel. Ela consulta a tabela <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-amber-800 dark:text-amber-300 font-mono font-bold">user_profiles</code> e retorna o perfil do usuario autenticado. As politicas RLS chamam essa funcao em tempo real; a permissao nao fica so no front-end.
          </p>
        </div>

        {/* HTTPS + Infraestrutura */}
        <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-emerald-600 text-xl">https</span>
            <h3 className="text-sm font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wide">Transporte Seguro</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-widest">TLS 1.3</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Toda comunicacao entre o navegador, a aplicacao (Vercel) e o banco (Supabase) trafega exclusivamente por <strong className="text-slate-800 dark:text-slate-200">HTTPS com TLS 1.3</strong>. Tokens JWT e dados operacionais nunca trafegam em texto claro. A chave de servico do banco fica armazenada em variaveis de ambiente do servidor — jamais exposta no codigo-fonte ou no cliente.
          </p>
        </div>

        {/* LGPD */}
        <div className="rounded-2xl border border-rose-100 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-rose-600 text-xl">gpp_good</span>
            <h3 className="text-sm font-black text-rose-900 dark:text-rose-300 uppercase tracking-wide">Conformidade LGPD</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 tracking-widest">Lei 13.709/2018</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            O sistema coleta <strong className="text-slate-800 dark:text-slate-200">apenas dados operacionais necessarios</strong>: nome, e-mail corporativo e nivel de acesso. Nao ha coleta de dados pessoais sensiveis. Registros de consentimento sao mantidos e o usuario pode consultar seus dados a qualquer momento pela secao <em>LGPD</em> no menu (visivel para supervisores).
          </p>
        </div>

        {/* Rodape */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] text-slate-400 font-medium">Infraestrutura: Supabase (PostgreSQL 15) + Vercel Edge Network</p>
          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
            Sistema Protegido
          </span>
        </div>
      </div>
    </div>
  </div>,
  document.body
);

export default SecurityModal;
