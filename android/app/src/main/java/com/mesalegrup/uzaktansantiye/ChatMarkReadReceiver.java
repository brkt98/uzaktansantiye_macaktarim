package com.mesalegrup.uzaktansantiye;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.text.TextUtils;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * ChatMarkReadReceiver — bildirimdeki "Okundu yap" aksiyonu.
 *
 *  1) Bildirimi hemen kapat (notifId).
 *  2) Arka planda POST → /api/chat/conversations/<id>/read (auth-token çerezi ile).
 *
 * exported=false ŞART. CallActionReceiver kalıbı (goAsync + Thread + HttpURLConnection).
 * Auth çerezini ChatReplyReceiver.readAuthCookie() ile ortak okur.
 */
public class ChatMarkReadReceiver extends BroadcastReceiver {

    public static final String ACTION_MARK_READ = "com.mesalegrup.uzaktansantiye.CHAT_MARK_READ";

    private static final String BASE = "https://uzaktansantiye.com";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_MARK_READ.equals(intent.getAction())) return;

        final Context app = context.getApplicationContext();
        final String conversationId = strExtra(intent, ChatNotif.EXTRA_CONVERSATION_ID);
        final int notifId = intent.getIntExtra(ChatNotif.EXTRA_NOTIF_ID, ChatNotif.notifId(conversationId));

        // 1) Bildirimi kapat
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(notifId);

        if (TextUtils.isEmpty(conversationId)) return;

        // 2) Sunucuya okundu bildir (arka planda)
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                postRead(conversationId);
            } catch (Exception ignored) {
            } finally {
                pending.finish();
            }
        }).start();
    }

    private void postRead(String conversationId) throws Exception {
        String cookie = ChatReplyReceiver.readAuthCookie();
        HttpURLConnection conn = null;
        try {
            URL url = new URL(BASE + "/api/chat/conversations/" + conversationId + "/read");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            if (cookie != null && !cookie.isEmpty()) {
                conn.setRequestProperty("Cookie", cookie);
            }

            // Boş gövde (uç gövde okumuyor) — yine de geçerli JSON gönder
            byte[] payload = new JSONObject().toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                conn.getInputStream().close();
            } else {
                try {
                    if (conn.getErrorStream() != null) conn.getErrorStream().close();
                } catch (Exception ignored) {
                }
            }
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String strExtra(Intent i, String key) {
        if (i == null) return "";
        String v = i.getStringExtra(key);
        return v == null ? "" : v;
    }
}
