/* iOS gelen-arama köprüsü (Faz 2) — native CallKitVoipPlugin (CallKitManager) ile web.
 * Android'de bu işi native CallMessagingService + IncomingCallActivity yapıyordu; iOS'ta
 * çalan ekran/kabul/reddet native (CallKit), medya ise mevcut web LiveKit odasında akar.
 *
 * Akış:
 *  - voipToken   → sunucuya `/api/push/register` (platform "ios-voip") kaydet (Faz 2b VoIP push için)
 *  - callAnswered→ arama odasına deep-link (`?...&accept=1`) → web LiveKit bağlanır
 *  - callEnded   → çalarken reddedildiyse temizlik (Faz 2c: /api/call/reject)
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface CallAnsweredData {
  conversationId: string;
  callType: string; // "audio" | "video"
  relatedUrl: string; // /dashboard/arama/<id>?video=<0|1>
  callerName?: string;
}
export interface CallEndedData {
  conversationId: string;
  relatedUrl?: string;
}

interface CallKitVoipPlugin {
  getVoipToken(): Promise<{ token: string }>;
  endCall(): Promise<void>;
  testRing(opts: { callerName?: string; video?: boolean; conversationId?: string; relatedUrl?: string }): Promise<void>;
  addListener(event: "voipToken", cb: (d: { token: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "callAnswered", cb: (d: CallAnsweredData) => void): Promise<PluginListenerHandle>;
  addListener(event: "callEnded", cb: (d: CallEndedData) => void): Promise<PluginListenerHandle>;
}

const CallKitVoip = registerPlugin<CallKitVoipPlugin>("CallKitVoip");

function isIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

async function registerVoipToken(token: string) {
  if (!token) return;
  try {
    await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, platform: "ios-voip" }),
    });
  } catch {
    /* offline/401 → sonraki açılışta tekrar denenir */
  }
}

/** Web arama odasını bitince CallKit UI'ını kapat (CallRoom endCall'da çağrılır). */
export async function endNativeCallUi() {
  if (!isIos()) return;
  try {
    await CallKitVoip.endCall();
  } catch {
    /* plugin yok → yoksay */
  }
}

/**
 * iOS gelen-arama köprüsünü kur (NativeBridge açılışında bir kez).
 * onAnswered/onEnded çağrıları NativeBridge tarafından sağlanır (deep-link/reject).
 * Temizlik fonksiyonu döner.
 */
export function setupCallKitVoip(handlers: {
  onAnswered: (d: CallAnsweredData) => void;
  onEnded: (d: CallEndedData) => void;
}): () => void {
  if (!isIos()) return () => {};
  const handles: PluginListenerHandle[] = [];
  (async () => {
    try {
      handles.push(
        await CallKitVoip.addListener("voipToken", ({ token }) => {
          void registerVoipToken(token);
        })
      );
      handles.push(await CallKitVoip.addListener("callAnswered", (d) => handlers.onAnswered(d)));
      handles.push(await CallKitVoip.addListener("callEnded", (d) => handlers.onEnded(d)));

      // Event kaçtıysa mevcut token'ı çek + kaydet
      try {
        const { token } = await CallKitVoip.getVoipToken();
        if (token) void registerVoipToken(token);
      } catch {
        /* yoksay */
      }

      // DEV/Faz 2a: gerçek VoIP push olmadan çalan ekranı test et.
      // Mac Safari Web Inspector konsolundan: window.__testCallRing()
      (window as unknown as { __testCallRing?: (name?: string, video?: boolean) => void }).__testCallRing = (
        name = "Test Arayan",
        video = false
      ) => {
        void CallKitVoip.testRing({ callerName: name, video, conversationId: "test", relatedUrl: "/dashboard/sohbet" });
      };
    } catch {
      /* plugin yok (eski build) → yoksay */
    }
  })();
  return () => handles.forEach((h) => h.remove());
}
