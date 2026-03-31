'use client';

import { CloseIcon } from './Icons';

type ConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  variant?: 'danger' | 'default';
};

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  isLoading = false,
  variant = 'default',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const confirmClassName =
    variant === 'danger'
      ? 'bg-gradient-to-r from-red-500 to-rose-500 shadow-lg shadow-red-500/30'
      : 'bg-gradient-to-r from-indigo-500 to-sky-500 shadow-lg shadow-sky-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-6">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 disabled:opacity-50"
          aria-label="닫기"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h3 className="mb-3 text-lg font-bold text-white">{title}</h3>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">{message}</p>

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed ${confirmClassName}`}
          >
            {isLoading ? '처리 중...' : confirmLabel}
          </button>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
