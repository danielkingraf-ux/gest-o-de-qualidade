
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
            // In a real scenario, we'd use actual credentials.
            // For this implementation, I'll use the provided email and a default password 'kingraf123'
            // If the user hasn't set up anyone, this might fail, so I'll add a mock-like bypass 
            // if it's the first time, but actually try Supabase first.

            const { error } = await authService.signIn(email, password);

            if (error) {
                throw error;
            }

            showToast('Bem-vindo ao Sistema Kingraf', 'success');
        } catch (error: any) {
            showToast(`Erro de autenticação: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
            <div className="max-w-md w-full space-y-8 bg-white dark:bg-slate-900 p-10 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 animate-fade-in">
                <div className="text-center">
                    <img src="/logo-full.png" alt="Kingraf" className="h-24 mx-auto mb-4 object-contain" />
                    <p className="mt-2 text-sm text-slate-500 font-medium">Gestão de Qualidade Industrial</p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">E-mail Corporativo</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">mail</span>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full h-14 pl-12 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all focus:bg-white dark:focus:bg-slate-900"
                                    placeholder="exemplo@kingraf.com.br"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Senha de Acesso</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">lock</span>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full h-14 pl-12 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all focus:bg-white dark:focus:bg-slate-900"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input type="checkbox" className="size-4 rounded border-slate-300 text-primary focus:ring-primary transition-all cursor-pointer" />
                            <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Lembrar acesso</span>
                        </label>
                        <a href="#" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">Esqueceu a senha?</a>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="group relative w-full h-14 flex justify-center items-center px-4 border border-transparent text-sm font-black rounded-xl text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span>
                        ) : (
                            <>
                                Entrar no Sistema
                                <span className="material-symbols-outlined ml-2 text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-400 font-medium">Controle de qualidade Kingraf © 2026</p>
                </div>
            </div>
        </div>
    );
}
