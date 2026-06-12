import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
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
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        if (!currentUser || currentUser.id !== userId) {
            showToast('Você só pode excluir suas próprias mensagens.', 'warning');
            return;
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
            const { data: { user } } = await supabase.auth.getUser();
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
        <div className="p-4 md:p-6 max-w-7xl mx-auto h-full flex flex-col gap-4 animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                        Comunicação em Tempo Real • Kingraf
                    </p>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Chat da Qualidade</h1>
                    <p className="text-xs text-slate-500 font-medium">Bate-papo e alertas instantâneos entre analistas.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-[10px] font-black uppercase text-emerald-600 animate-pulse flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-emerald-500"></span>
                        Analistas Online
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
                {/* Input Area */}
                <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 h-fit sticky top-6">
                        <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">edit_note</span>
                            Nova Mensagem
                        </h3>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Prioridade do Alerta</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setType('info')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${type === 'info' ? 'bg-primary/5 border-primary text-primary ring-4 ring-primary/5' : 'border-slate-100 dark:border-slate-800 text-slate-400 hover:bg-slate-50'}`}
                                    >
                                        <span className="material-symbols-outlined mb-1">chat</span>
                                        <span className="text-[9px] font-black uppercase">Chat</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('alert')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${type === 'alert' ? 'bg-amber-500/10 border-amber-500 text-amber-600 ring-4 ring-amber-500/10' : 'border-slate-100 dark:border-slate-800 text-slate-400 hover:bg-slate-50'}`}
                                    >
                                        <span className="material-symbols-outlined mb-1">warning</span>
                                        <span className="text-[9px] font-black uppercase">Alerta</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setType('critical')}
                                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${type === 'critical' ? 'bg-rose-500/10 border-rose-500 text-rose-600 ring-4 ring-rose-500/10' : 'border-slate-100 dark:border-slate-800 text-slate-400 hover:bg-slate-50'}`}
                                    >
                                        <span className="material-symbols-outlined mb-1">report</span>
                                        <span className="text-[9px] font-black uppercase">Urgente</span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Mensagem Técnica</label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Descreva a ocorrência ou mensagem..."
                                    className="w-full rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 text-xs font-medium focus:ring-2 focus:ring-primary/10 outline-none min-h-[140px] resize-none"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full h-11 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 group"
                            >
                                <span>ENVIAR MENSAGEM</span>
                                <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">send</span>
                            </button>
                        </form>
                    </div>
                </div>

                {/* Timeline Feed */}
                <div className="lg:col-span-2 flex flex-col min-h-0">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="p-5 border-b border-slate-50 dark:border-slate-800/50 flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-xl">forum</span>
                                Fluxo de Atividade
                            </h3>
                            <span className="text-[9px] font-black px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg uppercase tracking-widest">
                                Últimas 50 mensagens
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" ref={feedRef}>
                            {loading ? (
                                <div className="flex justify-center p-8">
                                    <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <span className="material-symbols-outlined text-4xl mb-2 opacity-20">forum</span>
                                    <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma mensagem no histórico</p>
                                </div>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} className={`p-4 rounded-2xl border ${getTypeColor(log.type)} animate-fade-in relative transition-all group border-opacity-50`}>
                                        <div className="flex items-start gap-4">
                                            <div className={`size-10 rounded-xl bg-white/40 dark:bg-black/20 flex items-center justify-center shrink-0`}>
                                                <span className="material-symbols-outlined text-xl">{getTypeIcon(log.type)}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black uppercase tracking-tight">{log.user_email?.split('@')[0]}</span>
                                                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 opacity-70">
                                                            {log.shift}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40 flex items-center gap-1 whitespace-nowrap">
                                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDeleteClick(log.id, log.user_id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500 rounded-lg transition-all text-rose-500 hover:text-white"
                                                            aria-label="Excluir"
                                                            data-tooltip="Excluir"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] font-medium whitespace-pre-wrap leading-relaxed opacity-90">{log.content}</p>
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
