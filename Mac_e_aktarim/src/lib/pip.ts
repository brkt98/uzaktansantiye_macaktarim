/* Android Picture-in-Picture köprüsü — SADECE görüntülü arama içindir.
   Native PipPlugin'i çağırır. Web/masaüstü/iOS'ta no-op (supported()=false).
   fullScreenIntent.ts kalıbının aynısı. */

import { Capacitor, registerPlugin } from "@capacitor/core";

const Pip = registerPlugin<{
  setPipEligible: (opts: { active: boolean }) => Promise<void>;
  enterPip: () => Promise<void>;
}>("Pip");

export function pipSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** Görüntülü aramaya girince true (ana ekrana çıkışta PiP'e gir), çıkınca false. */
export async function setPipEligible(active: boolean): Promise<void> {
  try {
    if (!pipSupported()) return;
    await Pip.setPipEligible({ active });
  } catch {
    /* yoksay */
  }
}

/** "Küçült" butonu → uygulamayı hemen PiP moduna sok (arama kapanmaz). */
export async function enterPip(): Promise<void> {
  try {
    if (!pipSupported()) return;
    await Pip.enterPip();
  } catch {
    /* yoksay */
  }
}

/** PiP'e girip/çıkma event'ini dinle. cb(isInPip). Temizleyici döner.
   Capacitor triggerWindowJSEvent data'sı sürümlere göre detail VEYA data
   alanında, string VEYA obje gelebilir → her ihtimali tolere et. */
export function onPipModeChanged(cb: (isInPip: boolean) => void): () => void {
  const handler = (e: Event) => {
    // Capacitor triggerWindowJSEvent data anahtarlarını event nesnesinin ÜSTÜNE yayar
    // (e.isInPip), detail/data'ya DEĞİL. Önce onu oku; eski/farklı yolları yedek tut.
    const top = (e as unknown as { isInPip?: boolean }).isInPip;
    if (typeof top === "boolean") {
      cb(top);
      return;
    }
    const raw =
      (e as CustomEvent).detail ?? (e as unknown as { data?: unknown }).data;
    let v: unknown = raw;
    if (typeof raw === "string") {
      try {
        v = JSON.parse(raw);
      } catch {
        v = undefined;
      }
    }
    cb(!!(v as { isInPip?: boolean } | undefined)?.isInPip);
  };
  window.addEventListener("pipModeChanged", handler as EventListener);
  return () => window.removeEventListener("pipModeChanged", handler as EventListener);
}
