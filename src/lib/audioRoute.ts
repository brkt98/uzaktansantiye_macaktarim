/* Native ses yönlendirme (hoparlör ↔ ahize) — Android AudioRoute eklentisi.
   Web'de / eklenti yoksa sessizce no-op. APK rebuild gerektirir (Kotlin/Java plugin). */

interface AudioRoute {
  startCall(o: { speaker: boolean }): Promise<void>;
  setSpeaker(o: { on: boolean }): Promise<void>;
  endCall(): Promise<void>;
}

async function plugin(): Promise<AudioRoute | null> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    return registerPlugin<AudioRoute>("AudioRoute");
  } catch {
    return null;
  }
}

export async function callStart(speaker: boolean): Promise<void> {
  try { await (await plugin())?.startCall({ speaker }); } catch { /* yoksay */ }
}

export async function callSetSpeaker(on: boolean): Promise<void> {
  try { await (await plugin())?.setSpeaker({ on }); } catch { /* yoksay */ }
}

export async function callEnd(): Promise<void> {
  try { await (await plugin())?.endCall(); } catch { /* yoksay */ }
}
