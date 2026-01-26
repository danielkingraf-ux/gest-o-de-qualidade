import React, { createContext, useContext, useState, useCallback } from 'react';

// Toast System
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
};

const ToastContainer = ({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) => (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
            <div
                key={toast.id}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg backdrop-blur-md animate-slide-in transition-all ${toast.type === 'success' ? 'bg-emerald-500/95 text-white' :
                    toast.type === 'error' ? 'bg-rose-500/95 text-white' :
                        toast.type === 'warning' ? 'bg-amber-500/95 text-white' :
                            'bg-slate-800/95 text-white'
                    }`}
                onClick={() => onRemove(toast.id)}
            >
                <span className="material-symbols-outlined text-lg">
                    {toast.type === 'success' ? 'check_circle' :
                        toast.type === 'error' ? 'error' :
                            toast.type === 'warning' ? 'warning' : 'info'}
                </span>
                <span className="text-sm font-medium">{toast.message}</span>
            </div>
        ))}
    </div>
);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'success') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
};
