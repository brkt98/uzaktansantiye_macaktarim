/* Tam ekran bildirim (full-screen intent) izni köprüsü — Android 14+ (API34) için.
   Kilitli ekranda çalan gelen-arama bu izne bağlı. Native FullScreenIntentPlugin'i çağırır. */

import { Capacitor, registerPlugin } from "@capacitor/core";

const FSI = registerPlugin<{
  canUse: () => Promise<{ granted: boolean }>;
  openSettings: () => Promise<void>;
  setOverLockScreen: (opts: { active: boolean }) => Promise<void>;
}>("FullScreenIntent");

/** Çağrı boyunca uygulamayı kilit ekranı üstünde göster (active=false → kilit altına döner). */
export async function setCallOverLock(active: boolean): Promise<void> {
  try {
    if (!fsiSupported()) return;
    await FSI.setOverLockScreen({ active });
  } catch {
    /* yoksay */
  }
}

export function fsiSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function fsiCanUse(): Promise<boolean> {
  try {
    const r = await FSI.canUse();
    return !!r.granted;
  } catch {
    return true; // eklenti yoksa engelleme
  }
}

export async function fsiOpenSettings(): Promise<void> {
  try {
    await FSI.openSettings();
  } catch {
    /* yoksay */
  }
}
