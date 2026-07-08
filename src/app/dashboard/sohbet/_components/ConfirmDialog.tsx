"use client";

/** Lacivert temalı onay penceresi (sil/ayrıl gibi geri-alınamaz işlemler için). */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "İptal",
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-5" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4">
          <h3 className="font-semibold text-gray-900 text-[15px]">{title}</h3>
          {message && <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{message}</p>}
        </div>
        <div className="flex border-t border-gray-100">
          <button onClick={onCancel} className="flex-1 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 text-sm font-semibold border-l border-gray-100 transition ${
              danger ? "text-red-600 hover:bg-red-50 active:bg-red-100" : "text-[#1e3a5f] hover:bg-[#1e3a5f]/5"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
