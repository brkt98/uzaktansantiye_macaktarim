// Tarayıcı tam ekran (Fullscreen API) yalnızca user-activation gesture'ın
// SENKRON call-stack'i içinde çağrıldığında çalışır. Bu helper, bir onClick
// içinden setState'i çağırmadan ÖNCE invoke edilmek üzere tasarlandı.
export function requestPageFullscreen(): void {
  if (typeof document === "undefined") return;
  if (
    document.fullscreenElement ||
    (document as unknown as { webkitFullscreenElement?: Element })
      .webkitFullscreenElement
  ) {
    return;
  }
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (el.requestFullscreen) {
      const p = el.requestFullscreen();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {});
      }
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } catch {
    // sessizce yok say
  }
}
