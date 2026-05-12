import React, { useState } from 'react';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';

export default function LoginView() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { error } = await authService.signIn(email, password);

            if (error) {
                throw error;
            }

            showToast('Bem-vindo ao Sistema Kingraf', 'success');
        } catch (error: any) {
            showToast(`Erro de autenticacao: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="flex h-[100vh] overflow-hidden bg-slate-950 px-4 py-5 text-slate-900">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#020617_0%,#0f172a_45%,#082f49_100%)]" />
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-cyan-300 to-blue-600" />

            <section className="relative m-auto flex w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-black/30 md:min-h-[620px] md:flex-row dark:bg-slate-900">
                <aside className="flex bg-slate-950 px-6 py-6 text-white md:w-[38%] md:flex-col md:justify-between md:p-8">
                    <div className="flex w-full items-center justify-between gap-4 md:block">
                        <img src="/logo-full.png" alt="Kingraf" className="h-14 w-auto object-contain brightness-0 invert md:h-16" />
                        <div className="rounded-full border border-cyan-300/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
                            Qualidade
                        </div>
                    </div>

                    <div className="mt-8 hidden md:block">
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Sistema interno</p>
                        <h1 className="mt-4 max-w-xs text-3xl font-black leading-tight">
                            Gestao de qualidade e rastreabilidade.
                        </h1>
                        <p className="mt-4 max-w-xs text-sm font-medium leading-6 text-slate-300">
                            Acesso seguro para lancamentos, revisoes, relatorios e controle por OP.
                        </p>
                    </div>

                    <div className="mt-8 hidden grid-cols-1 gap-2 text-xs font-bold text-slate-300 md:grid">
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <span className="material-symbols-outlined text-base text-cyan-300">verified_user</span>
                            Login individual
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <span className="material-symbols-outlined text-base text-cyan-300">history</span>
                            Auditoria e historico
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <span className="material-symbols-outlined text-base text-cyan-300">qr_code_2</span>
                            Rastreabilidade por OP
                        </div>
                    </div>
                </aside>

                <section className="flex min-h-0 flex-1 flex-col bg-slate-50 dark:bg-slate-900">
                    <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-8 sm:px-10">
                        <div className="w-full max-w-md">
                            <div className="mb-8">
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">
                                    Acesso ao sistema
                                </p>
                                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                                    Entrar
                                </h2>
                                <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
                                    Informe suas credenciais para continuar.
                                </p>
                            </div>

                            <form className="space-y-5" onSubmit={handleLogin}>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        E-mail corporativo
                                    </label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">mail</span>
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                            placeholder="nome@kingraf.com.br"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        Senha
                                    </label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">lock</span>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                            placeholder="Digite sua senha"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-semibold leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                                    Acesso individual registrado para seguranca, auditoria e conformidade LGPD.
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="flex h-12 w-full items-center justify-center rounded-lg bg-sky-600 px-4 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isLoading ? (
                                        <span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span>
                                    ) : (
                                        <>
                                            Entrar
                                            <span className="material-symbols-outlined ml-2 text-lg">arrow_forward</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>

                    <footer className="border-t border-slate-200 bg-white px-6 py-4 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                        Desenvolvedor Daniel Oliveira | versao 1
                    </footer>
                </section>
            </section>
        </main>
    );
}
