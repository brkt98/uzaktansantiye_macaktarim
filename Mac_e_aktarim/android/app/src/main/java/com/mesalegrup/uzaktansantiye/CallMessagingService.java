package com.mesalegrup.uzaktansantiye;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.ProcessLifecycleOwner;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * CallMessagingService — @capacitor/push-notifications MessagingService'i EXTEND eder.
 *
 * Manifest'te @capacitor MessagingService tools:node="remove" ile kaldırılır ve onun
 * yerine BU servis MESSAGING_EVENT intent-filter'ına kaydedilir. Böylece TÜM FCM
 * mesajları önce buraya gelir:
 *
 *   data.type == "call"        → CallStyle full-screen-intent çalan bildirim + foreground servis
 *   data.type == "call_cancel" → bildirim iptal + foreground servis durdur
 *   AKSİ HALDE                  → super.onMessageReceived(rm) (sohbet push'u plugine teslim)
 *
 * Uygulama ÖN PLANDA ise (ProcessLifecycleOwner STARTED) çalan bildirim BASTIRILIR;
 * dashboard/layout.tsx zaten 'call:incoming' socket olayıyla IncomingCallModal gösteriyor
 * → çift çalma önlenir. (Socket bağlıyken zaten push gönderilmiyor; bu ikinci bir emniyet.)
 */
public class CallMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;

        if ("call".equals(type)) {
            handleIncomingCall(data, remoteMessage.getPriority());
            return;
        }
        if ("call_cancel".equals(type)) {
            handleCallCancel();
            return;
        }
        if ("message".equals(type)) {
            handleChatMessage(data);
            return;
        }

        // Diğer tüm push'lar (sohbet legacy vb.) → Capacitor plugine devret
        super.onMessageReceived(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // Token kaydını Capacitor plugin yönetsin
        super.onNewToken(token);
    }

    private void handleIncomingCall(Map<String, String> data, int priority) {
        String conversationId = data.get("conversationId");
        String callerName = data.get("callerName");
        String fromUserId = data.get("fromUserId");
        String callType = data.get("callType");
        String relatedUrl = data.get("relatedUrl");
        if (callType == null) callType = "audio";

        // Uygulama ön plandaysa full-screen çalan ekranı bastır (layout zaten modalı gösteriyor)
        if (isAppInForeground()) {
            return;
        }

        // HIGH priority ise foreground servisi dene (kapalı uygulamada güvenilir çalma).
        if (priority == RemoteMessage.PRIORITY_HIGH) {
            try {
                Intent svc = new Intent(this, CallForegroundService.class);
                svc.setAction(CallForegroundService.ACTION_START);
                CallNotif.putExtras(svc, conversationId, callerName, fromUserId, callType, relatedUrl);
                ContextCompat.startForegroundService(this, svc);
                return;
            } catch (Exception e) {
                // FGS başlatma kısıtlandı (Doze/standby) → bildirim fallback'ine düş
            }
        }

        // FGS yok/başarısız → bildirimi DOĞRUDAN göster (full-screen-intent yine kilitli ekranda açar)
        CallNotif.ensureChannel(this);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(CallNotif.NOTIFICATION_ID,
                    CallNotif.build(this, conversationId, callerName, fromUserId, callType, relatedUrl));
        }
    }

    /**
     * data.type=="message" → WhatsApp-tarzı MessagingStyle bildirimi.
     * Uygulama ÖN PLANDA ise BASTIR (in-app sohbet zaten gösteriyor).
     * Aksi → ChatNotif ile konuşma-başına biriken MessagingStyle bildirim.
     */
    private void handleChatMessage(Map<String, String> data) {
        if (data == null) return;
        if (isAppInForeground()) {
            return; // in-app sohbet zaten gösteriyor → çift bildirim önle
        }
        String conversationId = data.get("conversationId");
        if (conversationId == null || conversationId.isEmpty()) return;

        String conversationTitle = data.get("conversationTitle");
        boolean isGroup = "1".equals(data.get("isGroup")) || "true".equals(data.get("isGroup"));
        String senderName = data.get("senderName");
        String senderId = data.get("senderId");
        String body = data.get("body");
        String messageId = data.get("messageId");
        String relatedUrl = data.get("relatedUrl");

        try {
            ChatNotif.show(this, conversationId, conversationTitle, isGroup,
                    senderName, senderId, body, messageId, relatedUrl);
        } catch (Throwable t) {
            // Push teslimini bozma ama SESSİZCE de yutma: logcat'te kök neden görünsün.
            android.util.Log.e("ChatNotif", "Sohbet bildirimi gösterilemedi", t);
        }
    }

    private void handleCallCancel() {
        // Bildirimi iptal et
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CallNotif.NOTIFICATION_ID);

        // Foreground servisi durdur
        Intent svc = new Intent(this, CallForegroundService.class);
        svc.setAction(CallForegroundService.ACTION_STOP);
        try {
            startService(svc);
        } catch (Exception ignored) {
            // servis çalışmıyor olabilir
        }

        // Açık olabilecek çalan ekranı kapat
        Intent finish = new Intent(IncomingCallActivity.ACTION_FINISH);
        finish.setPackage(getPackageName());
        sendBroadcast(finish);
    }

    private boolean isAppInForeground() {
        try {
            return ProcessLifecycleOwner.get().getLifecycle().getCurrentState()
                    .isAtLeast(Lifecycle.State.STARTED);
        } catch (Throwable t) {
            return false;
        }
    }
}
