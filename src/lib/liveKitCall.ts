/* Native LiveKit sesli arama köprüsü (FAZ A) — Android LiveKitCallPlugin.
   SADECE native + SESLİ aramada kullanılır. Görüntülü/web/masaüstü WebView LiveKitRoom'da kalır.
   Web'de / eklenti yoksa native değil → çağıran taraf zaten NativeAudioCallRoom render etmez. */

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface LiveKitCallPlugin {
  getSdkInfo(): Promise<{ engine?: string; screenShare?: boolean }>;
  connect(options: { token: string; url: string }): Promise<{ connected: boolean }>;
  setMicrophoneEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  setSpeaker(options: { on: boolean }): Promise<{ on: boolean; selected: string }>;
  disconnect(): Promise<void>;
  // Ekran paylaşımı (native MediaProjection + AYRI "-screen" Room). token/url AYRI screen token'ı.
  startScreenShare(options: { token: string; url: string }): Promise<{ active: boolean }>;
  stopScreenShare(): Promise<void>;
  addListener(
    eventName:
      | "connected"
      | "disconnected"
      | "participantConnected"
      | "participantDisconnected"
      | "activeSpeakers"
      | "connectionState"
      | "screenShareState",
    listenerFunc: (data: Record<string, unknown>) => void,
  ): Promise<PluginListenerHandle>;
}

const LiveKitCall = registerPlugin<LiveKitCallPlugin>("LiveKitCall");

const ENGINE_FLAG = "lkAudioEngine"; // localStorage: "1" = gerçek native sesli motor mevcut
const SCREEN_FLAG = "lkScreenShare"; // localStorage: "1" = native ekran paylaşımı (startScreenShare) mevcut

/** Açılışta bir kez çağrılır: native plugin GERÇEK sesli motoru + ekran paylaşımını içeriyor mu
   (yoksa eski stub/eski APK). Eski APK'da (metod yok) WebView'e düşülür / buton gizlenir → kırılmaz. */
export async function checkNativeAudioEngine(): Promise<void> {
  const set = (k: string, v: string) => { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); };
  try {
    if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android")) return;
    const info = await LiveKitCall.getSdkInfo();
    set(ENGINE_FLAG, info?.engine === "audio-v1" ? "1" : "0");
    set(SCREEN_FLAG, info?.screenShare === true ? "1" : "0");
  } catch {
    set(ENGINE_FLAG, "0");
    set(SCREEN_FLAG, "0");
  }
}

/** Native sesli arama motoru bu cihazda HAZIR mı (Android native + gerçek motor doğrulandı). */
export function nativeAudioCallSupported(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android" &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem(ENGINE_FLAG) === "1"
  );
}

export async function nativeConnect(token: string, url: string): Promise<void> {
  await LiveKitCall.connect({ token, url });
}

export async function nativeSetMic(enabled: boolean): Promise<void> {
  try {
    await LiveKitCall.setMicrophoneEnabled({ enabled });
  } catch {
    /* yoksay */
  }
}

export async function nativeSetSpeaker(on: boolean): Promise<void> {
  try {
    await LiveKitCall.setSpeaker({ on });
  } catch {
    /* yoksay */
  }
}

export async function nativeDisconnect(): Promise<void> {
  try {
    await LiveKitCall.disconnect();
  } catch {
    /* yoksay */
  }
}

export function nativeAddListener(
  eventName: Parameters<LiveKitCallPlugin["addListener"]>[0],
  cb: (data: Record<string, unknown>) => void,
): Promise<PluginListenerHandle> {
  return LiveKitCall.addListener(eventName, cb);
}

// ===================== EKRAN PAYLAŞIMI (additive) =====================

/** Bu cihazda native ekran paylaşımı köprüsü kullanılabilir mi (Android native).
   getDisplayMedia Android WebView'de YOK → ekran paylaşımı için native şart. */
export function nativeScreenShareSupported(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android" &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("lkScreenShare") === "1"
  );
}

/** Ekran paylaşımı için AYRI "-screen" identity'li token al (DUPLICATE_IDENTITY'yi önler). */
export async function fetchScreenToken(
  conversationId: string,
): Promise<{ token: string; url: string }> {
  const r = await fetch("/api/rtc/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, screen: true }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || "Ekran paylaşımı token'ı alınamadı");
  }
  const d = await r.json();
  return { token: d.token, url: d.url };
}

/** Ekran paylaşımını başlat: önce screen token al, sonra native MediaProjection consent + publish. */
export async function nativeStartScreenShare(conversationId: string): Promise<void> {
  const { token, url } = await fetchScreenToken(conversationId);
  await LiveKitCall.startScreenShare({ token, url });
}

export async function nativeStopScreenShare(): Promise<void> {
  try {
    await LiveKitCall.stopScreenShare();
  } catch {
    /* yoksay */
  }
}
