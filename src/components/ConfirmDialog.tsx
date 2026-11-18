import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#111827] p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className={danger ? 'w-5 h-5 text-rose-400 shrink-0' : 'w-5 h-5 text-amber-400 shrink-0'} />
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-slate-100">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="p-1 text-slate-400 hover:text-slate-200 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">{description}</p>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-xs font-medium rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-xs font-semibold rounded-md text-white transition-colors disabled:opacity-50 ${
              danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
