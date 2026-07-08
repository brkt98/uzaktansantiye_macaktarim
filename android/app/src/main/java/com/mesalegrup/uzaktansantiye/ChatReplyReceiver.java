package com.mesalegrup.uzaktansantiye;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.webkit.CookieManager;

import androidx.core.app.RemoteInput;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * ChatReplyReceiver — bildirimden DİREKT CEVAP (RemoteInput).
 *
 *  1) RemoteInput.getResultsFromIntent ile yazılan metni al.
 *  2) WebView CookieManager'dan auth-token çerezini oku → Cookie header'a koy.
 *  3) Arka planda POST → /api/chat/conversations/<id>/messages  { body, type:"text" }
 *  4) Başarılıysa MessagingStyle bildirimine kendi cevabımızı ekle (yanıtlandı hissi).
 *
 * exported=false ŞART (sahte RemoteInput önlenir). HTTP, ağı engelli main thread'de
 * yapılamaz → goAsync() + kısa ömürlü Thread (CallActionReceiver kalıbı).
 *
 * NOT: FLAG_MUTABLE olmadan getResultsFromIntent NULL döner — ChatNotif mutableFlags() kullanır.
 */
public class ChatReplyReceiver extends BroadcastReceiver {

    public static final String ACTION_REPLY = "com.mesalegrup.uzaktansantiye.CHAT_REPLY";

    private static final String BASE = "https://uzaktansantiye.com";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_REPLY.equals(intent.getAction())) return;

        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence replyCs = results != null ? results.getCharSequence(ChatNotif.KEY_REPLY) : null;
        final String reply = replyCs != null ? replyCs.toString().trim() : "";

        final Context app = context.getApplicationContext();
        final String conversationId = strExtra(intent, ChatNotif.EXTRA_CONVERSATION_ID);
        final String conversationTitle = strExtra(intent, ChatNotif.EXTRA_CONVERSATION_TITLE);
        final boolean isGroup = intent.getBooleanExtra(ChatNotif.EXTRA_IS_GROUP, false);
        final String senderId = strExtra(intent, ChatNotif.EXTRA_SENDER_ID);
        final String relatedUrl = strExtra(intent, ChatNotif.EXTRA_RELATED_URL);
        final String channelId = strExtra(intent, "channelId");
        final int notifId = intent.getIntExtra(ChatNotif.EXTRA_NOTIF_ID, ChatNotif.notifId(conversationId));

        if (TextUtils.isEmpty(conversationId) || TextUtils.isEmpty(reply)) return;

        // ÖNCE gönder, SONRA sonuca göre bildirimi güncelle. (Eskiden appendOwnReply POST'tan
        // önce çağrılıyordu → başarısız gönderimde bile "gönderildi" görünüyordu = SESSİZ KAYIP.)
        final PendingResult pending = goAsync();
        new Thread(() -> {
            boolean ok = false;
            try {
                ok = postMessage(conversationId, reply);
            } catch (Throwable ignored) {
            } finally {
                try {
                    if (ok) {
                        // Başarılı → kendi cevabını bildirime ekle (yanıtlandı hissi).
                        ChatNotif.appendOwnReply(app, notifId, channelId, conversationId,
                                conversationTitle, isGroup, senderId, relatedUrl, reply);
                    } else {
                        // Başarısız (oturum çerezi yok / ağ / sunucu) → kullanıcıyı uyar, metni kaybetme.
                        ChatNotif.showReplyFailed(app, notifId, channelId, conversationId,
                                conversationTitle, isGroup, senderId, relatedUrl, reply);
                    }
                } catch (Throwable ignored) {
                }
                pending.finish();
            }
        }).start();
    }

    /** POST /messages. 2xx → true; oturum çerezi yok / hata kodu / istisna → false (sessiz kayıp olmaz). */
    private boolean postMessage(String conversationId, String text) throws Exception {
        String cookie = readAuthCookie();
        if (cookie == null || cookie.isEmpty()) return false; // oturum yok → başarısız say
        HttpURLConnection conn = null;
        try {
            URL url = new URL(BASE + "/api/chat/conversations/" + conversationId + "/messages");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Cookie", cookie);

            JSONObject body = new JSONObject();
            body.put("body", text);
            body.put("type", "text");

            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                conn.getInputStream().close();
                return true;
            }
            try {
                if (conn.getErrorStream() != null) conn.getErrorStream().close();
            } catch (Exception ignored) {
            }
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * WebView CookieManager'dan auth-token çerezini oku ve "Cookie: auth-token=..." değeri döndür.
     * HttpOnly çerezler de native CookieManager'da görünür (HttpOnly sadece JS'i engeller).
     * getCookie tüm çerezleri "a=1; b=2" tek string döndürür → auth-token'ı ayıkla.
     */
    static String readAuthCookie() {
        try {
            CookieManager cm = CookieManager.getInstance();
            String all = cm.getCookie(BASE);
            if (all == null || all.isEmpty()) return null;
            for (String part : all.split(";")) {
                String p = part.trim();
                if (p.startsWith("auth-token=")) {
                    return p; // "auth-token=...."
                }
            }
        } catch (Throwable ignored) {
        }
        return null;
    }

    private static String strExtra(Intent i, String key) {
        if (i == null) return "";
        String v = i.getStringExtra(key);
        return v == null ? "" : v;
    }
}
