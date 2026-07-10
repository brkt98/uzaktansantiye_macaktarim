"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backStackPop } from "@/lib/backStack";
import { setupCallKitVoip } from "@/lib/callKitVoip";

/**
 * NativeBridge — Capacitor native kabuğu ile web uygulaması arasındaki köprü.
 *
 * Remote-URL deseninde tüm uygulama web olarak çalışır; native özellikler bu
 * bileşendeki JS tarafından, native kabuğun enjekte ettiği Capacitor bridge'i
 * üzerinden tetiklenir. Tarayıcıda (native olmayan) çalışırken hiçbir şey yapmaz.
 *
 * Görevleri:
 *  - Açılışta splash ekranını gizler
 *  - Status bar stilini ayarlar (koyu tema arka planına uygun)
 *  - Ağ durumunu izler, çevrimdışıyken üst bant gösterir
 *  - Android donanım "geri" tuşunu yönetir
 *  - Derin bağlantıları (deep link) ilgili sayfaya yönlendirir
 */
export default function NativeBridge() {
  const [offline, setOffline] = useState(false);
  const router = useRouter();

  // Deep link / paylaşım / push-tap yönlendirmesi: tam-sayfa yüklemesi (location.assign)
  // SPA history yığınını sıfırlayıp geri-gesture'ı bozuyordu → SPA push (history korunur),
  // router hazır değilse location.assign'e düş.
  const goTo = (pathOrUrl: string) => {
    let path = pathOrUrl;
    try {
      if (/^https?:\/\//i.test(pathOrUrl)) {
        const u = new URL(pathOrUrl);
        path = u.pathname + u.search + u.hash; // tam URL → SPA path'i
      }
    } catch { /* yoksay */ }
    try {
      router.push(path);
    } catch {
      try { window.location.assign(pathOrUrl); } catch { /* yoksay */ }
    }
  };

  useEffect(() => {
    let cleanups: Array<() => void> = [];
    let mounted = true;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return; // Tarayıcıda no-op

      // Native sesli arama motoru (gerçek mi, eski stub mu) — açılışta bir kez (capability gate)
      try {
        const { checkNativeAudioEngine } = await import("@/lib/liveKitCall");
        await checkNativeAudioEngine();
      } catch {
        /* yoksay */
      }

      // --- Status bar (koyu #1a1a2e arka plan → açık renk içerik) ---
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#1a1a2e" });
        }
      } catch {
        /* eklenti yoksa yoksay */
      }

      // --- Splash ekranını gizle ---
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        /* yoksay */
      }

      // --- Ağ durumu izleme ---
      try {
        const { Network } = await import("@capacitor/network");
        const status = await Network.getStatus();
        if (mounted) setOffline(!status.connected);
        const handle = await Network.addListener("networkStatusChange", (s) => {
          if (mounted) setOffline(!s.connected);
        });
        cleanups.push(() => handle.remove());
      } catch {
        /* yoksay */
      }

      // --- Android geri tuşu + deep link ---
      try {
        const { App } = await import("@capacitor/app");

        const backHandle = await App.addListener("backButton", ({ canGoBack }) => {
          // 1) Açık bir overlay/modal varsa ÖNCE onu kapat — alttaki sayfayı pop etme.
          if (backStackPop()) return;
          // 2) Köke/login'e "overshoot" engelle: home/login'de geri = uygulamadan çık.
          const raw = window.location.pathname || "/";
          const p = raw.length > 1 ? raw.replace(/\/+$/, "") : raw; // sondaki "/"yi at (kök hariç)
          if (!canGoBack || p === "/dashboard" || p === "/login" || p === "/") {
            App.exitApp();
            return;
          }
          // 3) Tam bir adım önceki sayfaya git.
          window.history.back();
        });
        cleanups.push(() => backHandle.remove());

        const urlHandle = await App.addListener("appUrlOpen", ({ url }) => {
          // https://uzaktansantiye.com/<path> veya özel şema → path'e git
          try {
            const u = new URL(url);
            const path = u.pathname + u.search;
            if (path && path !== "/") goTo(path);
          } catch {
            /* geçersiz url yoksay */
          }
        });
        cleanups.push(() => urlHandle.remove());
      } catch {
        /* yoksay */
      }

      // --- Paylaşım hedefi (başka uygulamadan/görüntüleyiciden gelen içerik → sohbete ilet) ---
      try {
        const { ShareTarget } = await import("@/lib/shareTarget");
        const goShare = (data?: { id?: number }) => {
          try {
            const id = data?.id || 0;
            if (id <= 0) return;
            if (sessionStorage.getItem("lastShareId") === String(id)) return; // aynı paylaşım — tekrarlama
            sessionStorage.setItem("lastShareId", String(id));
            if (!window.location.pathname.startsWith("/dashboard/sohbet/paylas")) {
              goTo("/dashboard/sohbet/paylas");
            }
          } catch {
            /* yoksay */
          }
        };
        // cold-start: uygulamayı bir paylaşım açtıysa
        try {
          goShare(await ShareTarget.getPendingShare());
        } catch {
          /* yoksay */
        }
        // warm-start: uygulama açıkken gelen paylaşım
        const shareHandle = await ShareTarget.addListener("shareReceived", (d) => goShare(d));
        cleanups.push(() => shareHandle.remove());
      } catch {
        /* eklenti yoksa yoksay */
      }

      // --- Push bildirimleri (kayıt + tıklama yönlendirmesi) ---
      // iOS: @capacitor/push-notifications ham APNs token verir; sunucumuz FCM'e
      // gönderdiği için iOS'ta FCM token GEREKİR → @capacitor-firebase/messaging.
      // Android: mevcut @capacitor/push-notifications akışı (FCM token) AYNEN korunur.
      try {
        const { Preferences } = await import("@capacitor/preferences");

        // Saklanan token'ı sunucuya gönder (giriş yapılmışsa kaydedilir).
        const syncToken = async () => {
          const { value } = await Preferences.get({ key: "push_token" });
          if (!value) return;
          try {
            await fetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ token: value, platform: Capacitor.getPlatform() }),
            });
          } catch {
            /* offline/401 -> sonraki acilista tekrar denenir */
          }
        };

        if (Capacitor.getPlatform() === "ios") {
          // iOS → Firebase Cloud Messaging (FCM token; APNs'i altında kullanır)
          const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
          // İzin verilmeden token kaydetme (Android'le tutarlı). Plugin izinsiz de
          // token üretebiliyor → izin yokken sunucuya yollamayalım.
          let granted = false;
          const applyToken = async (token?: string | null) => {
            if (!granted || !token) return;
            await Preferences.set({ key: "push_token", value: token });
            await syncToken();
          };

          const tokH = await FirebaseMessaging.addListener("tokenReceived", (e) => {
            void applyToken(e.token);
          });
          cleanups.push(() => tokH.remove());

          // Bildirim aksiyonu isleme (tap / REPLY / MARK_READ) — ORTAK handler.
          // KRITIK: iOS'ta iki push plugin'i (firebase-messaging + push-notifications)
          // Capacitor'un TEK notification-handler slotunu paylasir; hangisinin
          // kazanacagi yukleme sirasina baglidir. Bu yuzden aksiyonlar HANGI
          // dinleyiciye duserse dussun ayni sekilde islenmeli. Slot tekil oldugundan
          // ayni yanit iki dinleyiciye BIRDEN gelmez; yine de dedup ile koruyoruz.
          let lastActionKey = "";
          const handleNotifAction = (
            actionId: string | undefined,
            inputValue: string | undefined,
            data: Record<string, string> | undefined
          ) => {
            const key = `${actionId}|${data?.messageId || data?.relatedUrl || ""}|${inputValue || ""}`;
            if (key && key === lastActionKey) return; // ayni aksiyonu iki kez isleme
            lastActionKey = key;
            const convId = data?.conversationId;
            // Kilit ekrani "Yanitla": yazilan metni dogrudan sohbet API'sine gonder
            // (cerez oturum; iOS uygulamayi arka planda baslatir, WebView boot eder).
            if (actionId === "REPLY" && convId && inputValue) {
              void fetch(`/api/chat/conversations/${convId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ body: inputValue }),
              }).catch(() => {});
              return;
            }
            // "Okundu": konusmayi okundu isaretle (rozet/unread sifirlanir)
            if (actionId === "MARK_READ" && convId) {
              void fetch(`/api/chat/conversations/${convId}/read`, {
                method: "POST",
                credentials: "include",
              }).catch(() => {});
              return;
            }
            // Bildirime dokunma (default) -> ilgili sayfaya git
            if (actionId === "tap" && data?.relatedUrl) goTo(String(data.relatedUrl));
          };

          const tapH = await FirebaseMessaging.addListener("notificationActionPerformed", (e) => {
            handleNotifAction(
              e.actionId,
              e.inputValue,
              e.notification?.data as Record<string, string> | undefined
            );
          });
          cleanups.push(() => tapH.remove());

          // push-notifications plugin'i slotu kazanirsa aksiyonlar BU event'e duser
          // (yukleme sirasina gore genelde boyle olur) -> ayni ortak handler.
          try {
            const { PushNotifications } = await import("@capacitor/push-notifications");
            const tapH2 = await PushNotifications.addListener(
              "pushNotificationActionPerformed",
              (action) => {
                handleNotifAction(
                  action.actionId,
                  action.inputValue,
                  action.notification?.data as Record<string, string> | undefined
                );
              }
            );
            cleanups.push(() => tapH2.remove());
          } catch {
            /* yoksay */
          }

          let perm = await FirebaseMessaging.checkPermissions();
          if (perm.receive !== "granted") perm = await FirebaseMessaging.requestPermissions();
          granted = perm.receive === "granted";
          if (granted) {
            try {
              const { token } = await FirebaseMessaging.getToken();
              await applyToken(token);
            } catch {
              /* APNs henuz hazir degil -> tokenReceived / resume'da uygulanir */
            }
          }
        } else {
          // Android → @capacitor/push-notifications (FCM token)
          const { PushNotifications } = await import("@capacitor/push-notifications");

          const regHandle = await PushNotifications.addListener("registration", async (t) => {
            await Preferences.set({ key: "push_token", value: t.value });
            await syncToken();
          });
          cleanups.push(() => regHandle.remove());

          const tapHandle = await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            (action) => {
              const url = action.notification?.data?.relatedUrl;
              if (url) goTo(url);
            }
          );
          cleanups.push(() => tapHandle.remove());

          // İzin iste, sonra FCM/APNs'e kaydol
          let perm = await PushNotifications.checkPermissions();
          if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
            perm = await PushNotifications.requestPermissions();
          }
          if (perm.receive === "granted") {
            await PushNotifications.register();
          }
        }

        // Uygulama öne geldiğinde token'ı tekrar senkronla (giriş sonrası garanti)
        const { App: AppPlugin } = await import("@capacitor/app");
        const resumeHandle = await AppPlugin.addListener("resume", () => {
          void syncToken();
        });
        cleanups.push(() => resumeHandle.remove());
      } catch (e) {
        console.error("[push] kurulum hatasi", e);
      }

      // --- iOS gelen arama (CallKit + PushKit köprüsü) ---
      // Native çalan ekran (CallKitManager.swift) → JS. Kabul edilince mevcut web
      // arama odasına deep-link atarız (Android IncomingCallActivity.accept ile aynı).
      const callKitCleanup = setupCallKitVoip({
        onAnswered: (d) => {
          const url = d.relatedUrl || "/dashboard/sohbet";
          goTo(url.includes("?") ? `${url}&accept=1` : `${url}?accept=1`);
        },
        onEnded: () => {
          // Faz 2c: çalarken reddedilirse /api/call/reject; şimdilik ek işlem yok.
        },
      });
      cleanups.push(callKitCleanup);

      // --- Pil optimizasyonu muafiyeti (Android): arka planda push güvenilirliği ---
      try {
        if (Capacitor.getPlatform() === "android") {
          const { registerPlugin } = await import("@capacitor/core");
          const BatteryOpt = registerPlugin<{
            isExempt: () => Promise<{ exempt: boolean }>;
            request: () => Promise<void>;
          }>("BatteryOpt");
          const asked = typeof localStorage !== "undefined" && localStorage.getItem("batteryOptPromptShown") === "1";
          if (!asked) {
            const { exempt } = await BatteryOpt.isExempt();
            if (!exempt) {
              try { localStorage.setItem("batteryOptPromptShown", "1"); } catch { /* yoksay */ }
              await BatteryOpt.request(); // sistem "pil optimizasyonunu yoksay" diyaloğu
            }
          }
        }
      } catch {
        /* eklenti yoksa (eski APK) yoksay */
      }

      // --- Full-screen intent izni (Android 14+): kilitli ekranda çalan arama için ---
      try {
        if (Capacitor.getPlatform() === "android") {
          const { registerPlugin } = await import("@capacitor/core");
          const FSI = registerPlugin<{
            canUse: () => Promise<{ granted: boolean }>;
            openSettings: () => Promise<void>;
          }>("FullScreenIntent");
          const asked = typeof localStorage !== "undefined" && localStorage.getItem("fsiPromptShown") === "1";
          if (!asked) {
            const { granted } = await FSI.canUse();
            if (!granted) {
              try { localStorage.setItem("fsiPromptShown", "1"); } catch { /* yoksay */ }
              await FSI.openSettings(); // kullanıcıyı "Tam ekran bildirimler" ayarına götür
            }
          }
        }
      } catch {
        /* eklenti yoksa / izin akışı yoksay */
      }
    })();

    return () => {
      mounted = false;
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          /* yoksay */
        }
      });
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px",
        background: "#c0392b",
        color: "#fff",
        textAlign: "center",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      İnternet bağlantısı yok — çevrimdışısınız
    </div>
  );
}
