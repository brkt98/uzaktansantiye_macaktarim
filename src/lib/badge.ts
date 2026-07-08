/* Uygulama ikonu rozeti (okunmamış sohbet sayısı).
   Web Badging API (kurulu PWA / bazı platformlar) varsa onu kullanır; yoksa no-op.
   NOT: Android native sayısal rozet için Capacitor-8 uyumlu bir eklenti gerekir (şimdilik ertelendi;
   push bildirimleri zaten launcher'da nokta-rozeti gösterir). */

export async function setAppBadge(count: number): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0 && nav.setAppBadge) await nav.setAppBadge(count);
    else if (nav.clearAppBadge) await nav.clearAppBadge();
  } catch { /* yoksay */ }
}
