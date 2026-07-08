"use client";

// Satış sayfaları için modern (tarayıcı yerine uygulama-içi) uyarı/onay pop-up'ları.
// useDialog().alert(...) ve useDialog().confirm(...) — Promise döndürür.
// Provider yoksa (örn. başka bir bağlamda) tarayıcının yerleşik alert/confirm'ine düşer,
// böylece bu hook'u kullanan bileşenler her yerde güvenle çalışır.

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type Variant = "info" | "success" | "warning" | "danger";

export type AlertOptions = {
  title?: string;
  message: string;
  variant?: Variant;
  okText?: string;
};

export type ConfirmOptions = {
  title?: string;
  message: string;
  variant?: Variant;
  confirmText?: string;
  cancelText?: string;
};

type DialogApi = {
  alert: (opts: string | AlertOptions) => Promise<void>;
  confirm: (opts: string | ConfirmOptions) => Promise<boolean>;
};

const fallback: DialogApi = {
  alert: async (o) => {
    if (typeof window !== "undefined") window.alert(typeof o === "string" ? o : o.message);
  },
  confirm: async (o) =>
    typeof window !== "undefined" ? window.confirm(typeof o === "string" ? o : o.message) : false,
};

const DialogContext = createContext<DialogApi>(fallback);

export const useDialog = (): DialogApi => useContext(DialogContext);

type DialogState =
  | { kind: "alert"; opts: AlertOptions; resolve: () => void }
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | null;

const VARIANT_STYLES: Record<Variant, { icon: ReactNode; ring: string; btn: string }> = {
  info: {
    icon: <Info size={28} className="text-blue-500" />,
    ring: "border-blue-300",
    btn: "bg-blue-600 hover:bg-blue-700",
  },
  success: {
    icon: <CheckCircle2 size={28} className="text-emerald-500" />,
    ring: "border-emerald-300",
    btn: "bg-emerald-600 hover:bg-emerald-700",
  },
  warning: {
    icon: <AlertTriangle size={28} className="text-amber-500" />,
    ring: "border-amber-400",
    btn: "bg-[#c0392b] hover:bg-[#a93226]",
  },
  danger: {
    icon: <AlertTriangle size={28} className="text-rose-500" />,
    ring: "border-rose-400",
    btn: "bg-rose-600 hover:bg-rose-700",
  },
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);

  const alert = useCallback((o: string | AlertOptions) => {
    const opts: AlertOptions = typeof o === "string" ? { message: o } : o;
    return new Promise<void>((resolve) => setState({ kind: "alert", opts, resolve }));
  }, []);

  const confirm = useCallback((o: string | ConfirmOptions) => {
    const opts: ConfirmOptions = typeof o === "string" ? { message: o } : o;
    return new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve }));
  }, []);

  const finish = (result: boolean) => {
    setState((s) => {
      if (s) {
        if (s.kind === "confirm") s.resolve(result);
        else s.resolve();
      }
      return null;
    });
  };

  const isConfirm = state?.kind === "confirm";
  const variant: Variant =
    state?.opts.variant ?? (isConfirm ? "warning" : "info");
  const styles = VARIANT_STYLES[variant];

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      {state &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => finish(false)}
          >
            <div
              className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center border-[4px] ${styles.ring}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-end -mt-2 -mr-2">
                <button
                  onClick={() => finish(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  aria-label="Kapat"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 -mt-2">
                {styles.icon}
              </div>
              {state.opts.title && (
                <h3 className="text-lg font-bold text-gray-800 mb-1.5">{state.opts.title}</h3>
              )}
              <p className="text-sm text-gray-600 whitespace-pre-line mb-5">{state.opts.message}</p>
              <div className="flex items-center justify-center gap-3">
                {isConfirm && (
                  <button
                    onClick={() => finish(false)}
                    className="px-5 py-2.5 text-sm font-semibold border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50"
                  >
                    {(state.opts as ConfirmOptions).cancelText || "İptal"}
                  </button>
                )}
                <button
                  onClick={() => finish(true)}
                  autoFocus
                  className={`px-6 py-2.5 text-sm font-semibold text-white rounded-xl ${styles.btn}`}
                >
                  {isConfirm
                    ? (state.opts as ConfirmOptions).confirmText || "Onayla"
                    : (state.opts as AlertOptions).okText || "Tamam"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </DialogContext.Provider>
  );
}
