
import React, { useState, useEffect, useRef } from 'react';
import { X, Check, AlertTriangle, Info, HelpCircle } from 'lucide-react';
import clsx from 'clsx';

export type DialogType = 'alert' | 'confirm' | 'prompt';
export type DialogVariant = 'default' | 'danger' | 'success' | 'warning';

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    type: DialogType;
    title: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
    onConfirm: (value?: string) => void;
    confirmText?: string;
    cancelText?: string;
    variant?: DialogVariant;
}

export const Dialog: React.FC<DialogProps> = ({
    isOpen,
    onClose,
    type,
    title,
    message,
    defaultValue = '',
    placeholder = '',
    onConfirm,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default'
}) => {
    const [inputValue, setInputValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setInputValue(defaultValue);
            // Focus input on prompt
            if (type === 'prompt') {
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        }
    }, [isOpen, defaultValue, type]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm(type === 'prompt' ? inputValue : undefined);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleConfirm();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const getIcon = () => {
        switch (variant) {
            case 'danger': return <AlertTriangle className="w-6 h-6 text-red-600" />;
            case 'success': return <Check className="w-6 h-6 text-emerald-600" />;
            case 'warning': return <AlertTriangle className="w-6 h-6 text-orange-600" />;
            default: return <Info className="w-6 h-6 text-brand-600" />;
        }
    };

    const getConfirmBtnClass = () => {
        switch (variant) {
            case 'danger': return "bg-red-600 hover:bg-red-700 shadow-red-500/20";
            case 'success': return "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20";
            case 'warning': return "bg-orange-600 hover:bg-orange-700 shadow-orange-500/20";
            default: return "bg-brand-600 hover:bg-brand-700 shadow-brand-500/20";
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
        >
            <div
                className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
                    <div className={clsx("p-2 rounded-full shadow-sm bg-white border border-slate-100",
                        variant === 'danger' ? 'bg-red-50 border-red-100' :
                            variant === 'success' ? 'bg-emerald-50 border-emerald-100' :
                                'bg-brand-50 border-brand-100'
                    )}>
                        {getIcon()}
                    </div>
                    <h3 id="dialog-title" className="text-lg font-bold text-slate-900">{title}</h3>
                </div>

                {/* Body */}
                <div className="p-6">
                    {message && <p className="text-slate-600 text-sm leading-relaxed mb-4">{message}</p>}

                    {type === 'prompt' && (
                        <div>
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholder}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all shadow-sm"
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    {type !== 'alert' && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={handleConfirm}
                        className={clsx(
                            "px-4 py-2 text-sm font-bold text-white rounded-lg transition-all shadow-md",
                            getConfirmBtnClass()
                        )}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
