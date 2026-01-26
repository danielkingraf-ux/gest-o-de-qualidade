import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';
import { authService } from '../services/authService';
import { Analyst } from '../types';

interface ShiftLog {
    id: string;
    created_at: string;
    user_email: string;
    content: string;
    type: 'info' | 'alert' | 'critical';
    shift: string;
    user_id: string;
}

interface ReadReceipt {
    log_id: string;
    user_id: string;
}

export default function ChatPopup({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [messages, setMessages] = useState<ShiftLog[]>([]);
    const [analysts, setAnalysts] = useState<Analyst[]>([]);
    const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([]);
    const [content, setContent] = useState('');
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        authService.getCurrentUser().then(setCurrentUser);
        fetchAnalysts();
        fetchMessages();
        fetchReadReceipts();

        const logsSubscription = supabase
            .channel('chat_popup_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shift_logs' }, (payload) => {
                const newMessage = payload.new as ShiftLog;
                setMessages((prev) => {
                    if (prev.some(m => m.id === newMessage.id)) return prev;
                    return [...prev, newMessage];
                });
                if (isOpen) {
                    markAsRead(newMessage.id);
                }
            })
            .subscribe();

        const readsSubscription = supabase
            .channel('chat_popup_reads')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shift_log_reads' }, (payload) => {
                setReadReceipts((prev) => [...prev, payload.new as ReadReceipt]);
            })
            .subscribe();

        return () => {
            logsSubscription.unsubscribe();
            readsSubscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            markAllAsRead();
        }
    }, [isOpen, messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchAnalysts = async () => {
        const { data } = await supabase.from('analysts').select('*');
        if (data) setAnalysts(data);
    };

    const fetchMessages = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('shift_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (data) setMessages([...data].reverse());
        setLoading(false);
    };

    const fetchReadReceipts = async () => {
        const { data } = await supabase.from('shift_log_reads').select('log_id, user_id');
        if (data) setReadReceipts(data);
    };

    const markAsRead = async (logId: string) => {
        if (!currentUser) return;
        const alreadyRead = readReceipts.some(r => r.log_id === logId && r.user_id === currentUser.id);
        if (!alreadyRead) {
            await supabase.from('shift_log_reads').insert([{ log_id: logId, user_id: currentUser.id }]);
        }
    };

    const markAllAsRead = async () => {
        if (!currentUser || messages.length === 0) return;
        const unreadLogs = messages.filter(m => !readReceipts.some(r => r.log_id === m.id && r.user_id === currentUser.id));
        if (unreadLogs.length > 0) {
            try {
                const reads = unreadLogs.map(m => ({ log_id: m.id, user_id: currentUser.id }));
                await supabase.from('shift_log_reads').insert(reads);
            } catch (e) {
                console.error('Error marking as read:', e);
            }
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim() || !currentUser) return;

        const tempMessage: any = {
            id: 'temp-' + Date.now(),
            user_id: currentUser.id,
            user_email: currentUser.email,
            content: content.trim(),
            type: 'info',
            shift: getCurrentShift(),
            created_at: new Date().toISOString()
        };

        // Optimistic update
        setMessages(prev => [...prev.filter(m => !m.id.startsWith('temp-')), tempMessage]);
        const originalContent = content;
        setContent('');

        const { error, data } = await supabase.from('shift_logs').insert([
            {
                user_id: currentUser.id,
                user_email: currentUser.email,
                content: originalContent.trim(),
                type: 'info',
                shift: getCurrentShift(),
            },
        ]).select();

        if (error) {
            setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
            setContent(originalContent);
        } else if (data) {
            setMessages(prev => prev.map(m => m.id === tempMessage.id ? data[0] : m));
        }
    };

    const getCurrentShift = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 14) return 'Manhã';
        if (hour >= 14 && hour < 22) return 'Tarde';
        return 'Noite';
    };

    const getAnalystName = (email: string) => {
        const analyst = analysts.find(a => a.email === email);
        return analyst ? analyst.name : email.split('@')[0];
    };

    const getReadStatus = (messageId: string) => {
        const reads = readReceipts.filter(r => r.log_id === messageId && r.user_id !== currentUser?.id);
        if (reads.length === 0) return 'sent';
        return 'seen';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden z-[100] animate-slide-in">
            {/* Header */}
            <div className="bg-primary p-4 text-white flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="material-symbols-outlined">forum</span>
                    </div>
                    <div>
                        <h3 className="font-bold text-sm">Chat da Qualidade</h3>
                        <p className="text-[10px] opacity-80 uppercase tracking-widest font-bold">Equipe Kingraf</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <a href="/#/shift-log" title="Ver Histórico Completo" className="hover:bg-white/10 p-1.5 rounded-lg transition-colors flex items-center">
                        <span className="material-symbols-outlined text-lg">open_in_full</span>
                    </a>
                    <button onClick={onClose} className="hover:bg-white/10 p-1.5 rounded-lg transition-colors flex items-center">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50">
                {loading ? (
                    <div className="flex justify-center p-8">
                        <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">Nenhuma mensagem ainda.</div>
                ) : (
                    messages.map((m) => {
                        const isMine = m.user_id === currentUser?.id;
                        const status = getReadStatus(m.id);
                        return (
                            <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${isMine
                                    ? 'bg-primary text-white rounded-tr-none'
                                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-none border border-slate-100 dark:border-slate-700'
                                    }`}>
                                    {!isMine && <p className="text-[10px] font-black uppercase tracking-wider mb-1 opacity-60">{getAnalystName(m.user_email)}</p>}
                                    <p className="whitespace-pre-wrap">{m.content}</p>
                                    <div className={`flex items-center justify-end gap-1 mt-1 opacity-60 text-[9px] ${isMine ? 'text-white' : 'text-slate-500'}`}>
                                        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        {isMine && (
                                            <span className={`material-symbols-outlined text-[12px] ${status === 'seen' ? 'text-sky-300' : ''}`}>
                                                {status === 'seen' ? 'done_all' : 'done'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-2">
                <input
                    type="text"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className="flex-1 h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <button type="submit" className="size-11 flex items-center justify-center bg-primary text-white rounded-xl hover:bg-primary-dark transition-all disabled:opacity-50" disabled={!content.trim()}>
                    <span className="material-symbols-outlined">send</span>
                </button>
            </form>
        </div>
    );
}
