import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

interface ShiftLog {
    id: string;
    created_at: string;
    user_email: string;
    content: string;
    type: 'info' | 'alert' | 'critical';
    shift: string;
    user_id: string;
}

export default function ShiftLogView() {
    const [logs, setLogs] = useState<ShiftLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState('');
    const [type, setType] = useState<'info' | 'alert' | 'critical'>('info');
    const { showToast } = useToast();
    const feedRef = useRef<HTMLDivElement>(null);

    // Delete Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [logToDelete, setLogToDelete] = useState<string | null>(null);

    useEffect(() => {
        fetchLogs();

        const subscription = supabase
            .channel('shift_logs_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_logs' }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    const newLog = payload.new as ShiftLog;
                    setLogs((prev) => [newLog, ...prev]);
                    if (newLog.type === 'critical') {
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                        audio.play().catch(() => { });
                        showToast('Novo Alerta Crítico Recebido!', 'warning');
                    }
                } else if (payload.eventType === 'DELETE') {
                    const deletedId = payload.old.id;
                    setLogs((prev) => prev.filter(log => log.id !== deletedId));
                }
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const handleDeleteClick = async (id: string, userId: string) => {
        const currentUser = await authService.getCurrentUser();

        if (!currentUser || (currentUser.id !== userId && !currentUser.email?.includes('admin'))) {
            if (currentUser?.id !== userId) {
                showToast('Você só pode excluir suas próprias mensagens.', 'warning');
                return;
            }
        }

        setLogToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!logToDelete) return;

        try {
            const { error } = await supabase.from('shift_logs').delete().eq('id', logToDelete);
            if (error) throw error;
            showToast('Mensagem excluída.', 'info');
        } catch (error) {
            console.error('Erro ao excluir:', error);
            showToast('Erro ao excluir mensagem.', 'error');
        } finally {
            setLogToDelete(null);
        }
    };

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            const { data, error } = await supabase
                .from('shift_logs')
                .select('*')
                .gte('created_at', threeDaysAgo.toISOString())
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error('Erro ao buscar logs:', error);
            showToast('Erro ao carregar diário.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;

        try {
            const user = await authService.getCurrentUser();
            if (!user) throw new Error('Usuário não autenticado');

            const { error } = await supabase.from('shift_logs').insert([
                {
                    user_id: user.id,
                    user_email: user.email,
                    content: content.trim(),
                    type,
                    shift: getCurrentShift(),
                },
            ]);

            if (error) throw error;

            setContent('');
            showToast('Mensagem enviada!', 'success');
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            showToast('Erro ao enviar mensagem.', 'error');
        }
    };

    const getCurrentShift = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 14) return 'Manhã';
        if (hour >= 14 && hour < 22) return 'Tarde';
        return 'Noite';
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'critical': return 'bg-rose-100 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200';
            case 'alert': return 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200';
            default: return 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'critical': return 'warning';
            case 'alert': return 'info';
            default: return 'chat';
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto h-full flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg text-primary">
                        <span className="material-symbols-outlined text-2xl">forum</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Chat da Qualidade</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Bate-papo e alertas entre analistas</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Input Area */}
                <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 h-fit sticky top-6">
                        <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">edit_note</span>
                            Nova Mensagem
                        </h3>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Mensagem</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setType('info')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${type === 'info' ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-500 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                    >
                                        <span className="material-symbols-outlined mb-1">chat</span>
                                        <span className="text-xs font-bold">Chat</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('alert')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${type === 'alert' ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-500 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                    >
                                        <span className="material-symbols-outlined mb-1">warning</span>
                                        <span className="text-xs font-bold">Alerta</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('critical')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${type === 'critical' ? 'bg-rose-50 dark:bg-rose-900/30 border-rose-500 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                    >
                                        <span className="material-symbols-outlined mb-1">report</span>
                                        <span className="text-xs font-bold">Urgente</span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mensagem</label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Digite sua mensagem para a equipe..."
                                    className="w-full rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-primary focus:border-primary min-h-[150px] resize-none"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 group"
                            >
                                <span>Enviar Mensagem</span>
                                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">send</span>
                            </button>
                        </form>
                    </div>
                </div>

                {/* Timeline Feed */}
                <div className="lg:col-span-2 flex flex-col min-h-0">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined">forum</span>
                                Conversas Recentes
                            </h3>
                            <span className="text-xs font-medium px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full flex items-center gap-1 animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Ao Vivo
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={feedRef}>
                            {loading ? (
                                <div className="flex justify-center p-8">
                                    <span className="material-symbols-outlined text-4xl animate-spin text-slate-300">progress_activity</span>
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <span className="material-symbols-outlined text-5xl mb-2 opacity-50">forum</span>
                                    <p>Nenhuma mensagem no chat.</p>
                                </div>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} className={`p-4 rounded-2xl border ${getTypeColor(log.type)} animate-fade-in relative transition-all hover:shadow-md group`}>
                                        <div className="flex items-start gap-4">
                                            <div className={`p-2 rounded-xl bg-white/50 dark:bg-black/20 shrink-0`}>
                                                <span className="material-symbols-outlined">{getTypeIcon(log.type)}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm">{log.user_email?.split('@')[0]}</span>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10">
                                                            Turno {log.shift}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs opacity-70 flex items-center gap-1 whitespace-nowrap" title={new Date(log.created_at).toLocaleString()}>
                                                            <span className="material-symbols-outlined text-[10px]">schedule</span>
                                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            <span className="hidden sm:inline"> - {new Date(log.created_at).toLocaleDateString()}</span>
                                                        </span>
                                                        <button
                                                            onClick={() => handleDeleteClick(log.id, log.user_id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 dark:hover:bg-white/20 rounded-lg transition-all text-red-500"
                                                            title="Excluir mensagem"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{log.content}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Excluir Mensagem"
                message="Tem certeza que deseja excluir esta mensagem? Esta ação não pode ser desfeita."
                confirmText="Excluir"
                type="danger"
            />
        </div>
    );
}
