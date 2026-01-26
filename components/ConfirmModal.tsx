import React from 'react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'danger'
}: ConfirmModalProps) {
    if (!isOpen) return null;

    const getColors = () => {
        switch (type) {
            case 'danger':
                return {
                    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
                    iconText: 'text-rose-600 dark:text-rose-400',
                    buttonBg: 'bg-rose-600 hover:bg-rose-700',
                    icon: 'warning'
                };
            case 'warning':
                return {
                    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
                    iconText: 'text-amber-600 dark:text-amber-400',
                    buttonBg: 'bg-amber-600 hover:bg-amber-700',
                    icon: 'priority_high'
                };
            default:
                return {
                    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
                    iconText: 'text-blue-600 dark:text-blue-400',
                    buttonBg: 'bg-blue-600 hover:bg-blue-700',
                    icon: 'info'
                };
        }
    };

    const colors = getColors();

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/20 dark:bg-slate-900/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 animate-scale-in">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className={`p-3 rounded-full ${colors.iconBg} ${colors.iconText} mb-2`}>
                        <span className="material-symbols-outlined text-3xl">{colors.icon}</span>
                    </div>

                    <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed text-balance">
                            {message}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 w-full mt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`flex-1 px-4 py-2.5 rounded-xl text-white font-medium shadow-lg shadow-current/20 transition-all ${colors.buttonBg}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
