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
 * CallActionReceiver — bildirimdeki / çalan ekrandaki "Reddet" aksiyonu.
 *
 *  1) Çalan bildirimi iptal + foreground servisi durdur (ringtone hemen kessin).
 *  2) Açık olabilecek IncomingCallActivity'yi kapat.
 *  3) Arka planda hafif HTTP POST → /api/call/reject  { conversationId, fromUserId }
 *     (Sunucu bunu alınca realtime'a arayana 'call:rejected' yaydırır → ringback kesilir.)
 *
 * HTTP, ağ erişimi engelli ana iş parçacığında yapılamaz → kısa ömürlü Thread.
 * goAsync() ile receiver process'inin işi bitene dek yaşaması sağlanır.
 */
public class CallActionReceiver extends BroadcastReceiver {

    public static final String ACTION_REJECT = "com.mesalegrup.uzaktansantiye.CALL_REJECT";

    private static final String REJECT_URL = "https://uzaktansantiye.com/api/call/reject";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_REJECT.equals(intent.getAction())) return;

        final Context app = context.getApplicationContext();
        final String conversationId = strExtra(intent, CallNotif.EXTRA_CONVERSATION_ID);
        final String fromUserId = strExtra(intent, CallNotif.EXTRA_FROM_USER_ID);

        // 1) Çalmayı durdur
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CallNotif.NOTIFICATION_ID);

        Intent svc = new Intent(app, CallForegroundService.class);
        svc.setAction(CallForegroundService.ACTION_STOP);
        try {
            app.startService(svc);
        } catch (Exception ignored) {
        }

        // 2) Açık çalan ekranı kapat
        Intent finish = new Intent(IncomingCallActivity.ACTION_FINISH);
        finish.setPackage(app.getPackageName());
        app.sendBroadcast(finish);

        // 3) Sunucuya reddi bildir (arka planda)
        if (TextUtils.isEmpty(conversationId)) return;

        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                postReject(conversationId, fromUserId);
            } catch (Exception ignored) {
            } finally {
                pending.finish();
            }
        }).start();
    }

    private void postReject(String conversationId, String fromUserId) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(REJECT_URL);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            JSONObject body = new JSONObject();
            body.put("conversationId", conversationId);
            body.put("fromUserId", fromUserId == null ? "" : fromUserId);

            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }
            // Yanıtı tüket (bağlantı düzgün kapansın)
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
