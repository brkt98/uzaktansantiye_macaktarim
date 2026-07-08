/* Dokunsal geri bildirim (Capacitor Haptics). Web / eklenti yoksa sessiz no-op.
   impact() bazı cihazlarda çok hafif kalıyor → titreşimi doğrudan vibrate() ile
   veriyoruz (VIBRATE izni eklenti manifest'inden geliyor; daha güvenilir/hissedilir). */

async function impact(style: "Light" | "Medium" | "Heavy"): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle[style] });
  } catch { /* yoksay */ }
}

/** Belirtilen süre (ms) kadar doğrudan titreşim — en güvenilir/hissedilir yol. */
export async function hapticVibrate(ms: number): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.vibrate({ duration: ms });
  } catch { /* yoksay */ }
}

/** Kısa, net dokunuş — mesaj gönder/al. */
export const hapticTap = () => hapticVibrate(45);
/** Daha belirgin titreşim — sesli mesaj başlat, bas-tut menü. */
export const hapticBuzz = () => hapticVibrate(80);

// Geriye uyumlu (impact tabanlı) — bazı yerlerde hâlâ çağrılıyor
export const hapticLight = () => impact("Light");
export const hapticMedium = () => impact("Medium");

export async function hapticSuccess(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch { /* yoksay */ }
}
