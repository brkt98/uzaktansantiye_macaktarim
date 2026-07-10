import { prisma } from "@/lib/db";

/**
 * Push bildirim gönderimi — FCM (Firebase Cloud Messaging) HTTP v1 üzerinden,
 * firebase-admin SDK ile. Tek entegrasyonla hem Android (FCM) hem iOS (APNs köprüsü).
 *
 * Yapılandırma (iki yoldan biri):
 *   A) FIREBASE_SERVICE_ACCOUNT = service account JSON'unun tamamı (tek satır) — önerilen, en kolay
 *   B) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (\n kaçışlı)
 *
 * Yapılandırılmamışsa sessizce no-op olur (uygulamayı bozmaz).
 */

let messagingPromise: Promise<unknown> | null = null;

async function getMessaging(): Promise<{
  sendEachForMulticast: (msg: unknown) => Promise<{
    responses: Array<{ success: boolean; error?: { code?: string } }>;
  }>;
} | null> {
  if (messagingPromise !== null) return messagingPromise as never;
  messagingPromise = (async () => {
    try {
      // Kimlik: A) tam JSON (FIREBASE_SERVICE_ACCOUNT) veya B) 3 ayrı değişken
      let serviceAccount: Record<string, unknown>;
      const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (saJson && saJson.trim()) {
        try {
          serviceAccount = JSON.parse(saJson);
        } catch {
          console.error("[push] FIREBASE_SERVICE_ACCOUNT geçerli JSON değil.");
          return null;
        }
      } else {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (!projectId || !clientEmail || !privateKey) return null;
        privateKey = privateKey.replace(/\\n/g, "\n");
        serviceAccount = { projectId, clientEmail, privateKey };
      }

      const mod = await import("firebase-admin");
      // CJS/ESM interop
      const admin = (mod as unknown as { default?: unknown }).default ?? mod;
      const a = admin as {
        apps: unknown[];
        initializeApp: (opts: unknown) => void;
        credential: { cert: (svc: unknown) => unknown };
        messaging: () => unknown;
      };
      if (!a.apps.length) {
        a.initializeApp({ credential: a.credential.cert(serviceAccount) });
      }
      return a.messaging();
    } catch (e) {
      console.error("[push] firebase-admin başlatma hatası:", e);
      return null;
    }
  })();
  return messagingPromise as never;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Tıklanınca yönlendirilecek uygulama içi yol vb. */
  data?: Record<string, string>;
  /**
   * true → FCM 'notification' bloğu KONULMAZ (data-only, high-priority).
   * Android: kapalı uygulamada onMessageReceived çağrılır (çalan ekran için ŞART).
   * iOS: content-available ile sessiz uyandırma (banner/ses YOK — mevcut davranış korunur).
   */
  dataOnly?: boolean;
  /**
   * data-only mesajın FCM TTL'i (ms). Verilmezse: call gibi çabuk-eskiyen data-only için 60sn,
   * aksi (örn. sohbet mesajı) için FCM varsayılanı (~4 hafta). Sohbet mesajı 60sn'de düşmemeli.
   */
  ttlMs?: number;
}

/**
 * Bir kullanıcının tüm kayıtlı cihazlarına push gönderir.
 * Geçersiz (kaldırılmış) token'ları otomatik temizler.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const messaging = await getMessaging();
  if (!messaging) {
    console.warn("[push] Firebase yapılandırılmamış — bildirim atlandı.");
    return;
  }

  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { token: true, platform: true },
  });
  if (tokens.length === 0) return;

  const androidTokens = tokens.filter((t) => t.platform === "android").map((t) => t.token);
  const iosTokens = tokens.filter((t) => t.platform === "ios").map((t) => t.token);
  // NOT: platform "ios-voip" (PushKit VoIP token) FCM'e gönderilmez — gelen arama
  // için doğrudan APNs VoIP push ile kullanılır (Faz 2b: src/lib/apnsVoip.ts).

  const stale: string[] = [];
  const collectStale = (
    res: { responses: Array<{ success: boolean; error?: { code?: string } }> },
    list: string[]
  ) => {
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? "";
        // NOT: yalnızca TOKEN'a özel ölü-token kodlarında sil. "invalid-argument"
        // genel (payload) hatası da olabilir → tüm batch aynı kodla düşerse geçerli
        // token'ları da silerdi; o yüzden dahil ETME.
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token")
        ) {
          stale.push(list[i]);
        }
      }
    });
  };

  try {
    // Android — data-only (native MessagingStyle / çalan ekran) davranışı AYNEN korunur.
    if (androidTokens.length > 0) {
      const res = await messaging.sendEachForMulticast({
        tokens: androidTokens,
        // data-only call push'unda notification YOK → Android onMessageReceived (kapalı uygulama).
        ...(payload.dataOnly ? {} : { notification: { title: payload.title, body: payload.body } }),
        data: payload.data ?? {},
        android: {
          priority: "high",
          // data-only mesajın TTL'i: açıkça verilirse onu kullan; verilmezse call gibi
          // çabuk-eskiyenler için 60sn. Sohbet mesajı uzun TTL ister → ttlMs ile geçilir.
          ...(payload.dataOnly
            ? { ttl: typeof payload.ttlMs === "number" ? payload.ttlMs : 60_000 }
            : {}),
        },
      });
      collectStale(res, androidTokens);
    }

    // iOS — HER ZAMAN görünür bildirim. (iOS'ta native gösterici yok; data-only sessiz
    // content-available kalır → banner çıkmazdı.) notification bloğu → aps.alert; data
    // (relatedUrl vs.) userInfo'da taşınır → dokununca doğru sayfaya yönlendirir.
    // NOT (Faz 2): gerçek arama için iOS'ta PushKit/CallKit gelince ayrı dal eklenecek.
    if (iosTokens.length > 0) {
      // Prod'da sohbet/arama DATA-ONLY gönderilir → title/body BOŞ gelir (görünür
      // metin data'da: senderName/callerName + body). iOS'ta banner boş çıkmasın
      // diye title/body boşsa data alanlarından türet.
      const d = payload.data ?? {};
      const iosTitle = payload.title || d.senderName || d.callerName || "Uzaktan Şantiye";
      const iosBody = payload.body || d.body || "";
      const res = await messaging.sendEachForMulticast({
        tokens: iosTokens,
        notification: { title: iosTitle, body: iosBody },
        data: payload.data ?? {},
        apns: {
          headers: { "apns-priority": "10", "apns-push-type": "alert" },
          payload: {
            aps: {
              sound: "default",
              // Sohbet mesaji: kilit ekraninda Yanitla/Okundu aksiyonlari
              // (AppDelegate'te kayitli CHAT_MESSAGE kategorisi) + konusma
              // bazli gruplama (threadId -> apns thread-id).
              ...(d.type === "message"
                ? {
                    category: "CHAT_MESSAGE",
                    ...(d.conversationId ? { threadId: d.conversationId } : {}),
                  }
                : {}),
            },
          },
        },
      });
      collectStale(res, iosTokens);
    }

    if (stale.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: stale } } });
    }
  } catch (e) {
    console.error("[push] gönderim hatası:", e);
  }
}
