package com.mesalegrup.uzaktansantiye;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

/**
 * CallNotif — gelen arama bildiriminin (CallStyle full-screen-intent) tek elden üretimi.
 *
 * Hem {@link CallMessagingService} (FCM data push) hem {@link CallForegroundService}
 * (foreground service zorunlu bildirimi) AYNI bildirimi (aynı id + aynı kanal) kullanır.
 * Böylece tek bir "çalan" bildirim olur; servis onu foreground'a alır.
 *
 * Tasarım kararı: full-screen-intent doğrudan {@link IncomingCallActivity}'ye bağlanır
 * (kilit ekranı üstünde güvenilir gösterim için). Activity, Kabul'de MainActivity'yi
 * deep-link + accept=1 ile açar; Reddet'i CallActionReceiver'a yönlendirir.
 */
public final class CallNotif {

    private CallNotif() {}

    public static final String CHANNEL_ID = "incoming_calls";
    public static final int NOTIFICATION_ID = 4711;

    /** Bildirim + servis için arama verisini taşıyan extra anahtarları (String extralar). */
    public static final String EXTRA_CONVERSATION_ID = "conversationId";
    public static final String EXTRA_CALLER_NAME = "callerName";
    public static final String EXTRA_FROM_USER_ID = "fromUserId";
    public static final String EXTRA_CALL_TYPE = "callType"; // "audio" | "video"
    public static final String EXTRA_RELATED_URL = "relatedUrl";

    /** Kanalı (yüksek önem + ringtone + titreşim) idempotent oluştur. */
    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "Gelen aramalar",
                NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("Sesli ve görüntülü gelen arama bildirimleri");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 1000, 800, 1000, 800});
        ch.setBypassDnd(true);

        Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ring != null) {
            AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            ch.setSound(ring, aa);
        }
        nm.createNotificationChannel(ch);
    }

    /**
     * Gelen arama bildirimini (CallStyle.forIncomingCall + full-screen-intent) oluşturur.
     * Hem servis hem messaging service bunu kullanır.
     */
    public static Notification build(Context ctx,
                                     String conversationId,
                                     String callerName,
                                     String fromUserId,
                                     String callType,
                                     String relatedUrl) {
        ensureChannel(ctx);

        String name = (callerName != null && !callerName.trim().isEmpty()) ? callerName : "Gelen arama";
        boolean isVideo = "video".equals(callType);

        // --- Full-screen intent → IncomingCallActivity (kilit ekranı üstünde) ---
        Intent fsi = new Intent(ctx, IncomingCallActivity.class);
        fsi.setAction(IncomingCallActivity.ACTION_INCOMING);
        fsi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        putExtras(fsi, conversationId, callerName, fromUserId, callType, relatedUrl);
        PendingIntent fsiPi = PendingIntent.getActivity(
                ctx, 1001, fsi, piFlags());

        // --- Kabul → IncomingCallActivity (kabul yolunu da activity yönetir) ---
        Intent acceptIntent = new Intent(ctx, IncomingCallActivity.class);
        acceptIntent.setAction(IncomingCallActivity.ACTION_ACCEPT);
        acceptIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        putExtras(acceptIntent, conversationId, callerName, fromUserId, callType, relatedUrl);
        PendingIntent acceptPi = PendingIntent.getActivity(
                ctx, 1002, acceptIntent, piFlags());

        // --- Reddet → CallActionReceiver (HTTP reject + bildirim/servis durdur) ---
        Intent rejectIntent = new Intent(ctx, CallActionReceiver.class);
        rejectIntent.setAction(CallActionReceiver.ACTION_REJECT);
        putExtras(rejectIntent, conversationId, callerName, fromUserId, callType, relatedUrl);
        PendingIntent rejectPi = PendingIntent.getBroadcast(
                ctx, 1003, rejectIntent, piFlags());

        Person caller = new Person.Builder().setName(name).setImportant(true).build();

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle(name)
                .setContentText(isVideo ? "Görüntülü arama" : "Sesli arama")
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setFullScreenIntent(fsiPi, true)
                .setContentIntent(fsiPi);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // API31+ : zengin CallStyle çalan ekranı (Kabul/Reddet düğmeleri)
            b.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, rejectPi, acceptPi));
        } else {
            // <31 : klasik aksiyon düğmeleri
            b.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Reddet", rejectPi);
            b.addAction(android.R.drawable.sym_action_call, "Kabul", acceptPi);
        }

        Notification n = b.build();
        // NOT: FLAG_INSISTENT KULLANILMIYOR. INSISTENT + CallStyle + full-screen-intent ile
        // çalan Activity açıldıktan SONRA ringtone susmaz/çakışır. Kanal IMPORTANCE_HIGH +
        // ringtone sesi çalmayı sağlar; accept/reject'te NotificationManager.cancel ile ses kesilir.
        return n;
    }

    /** String extralarını intent'e ekler (Serializable HashMap DEĞİL). */
    public static void putExtras(Intent i,
                                 String conversationId,
                                 String callerName,
                                 String fromUserId,
                                 String callType,
                                 String relatedUrl) {
        i.putExtra(EXTRA_CONVERSATION_ID, conversationId == null ? "" : conversationId);
        i.putExtra(EXTRA_CALLER_NAME, callerName == null ? "" : callerName);
        i.putExtra(EXTRA_FROM_USER_ID, fromUserId == null ? "" : fromUserId);
        i.putExtra(EXTRA_CALL_TYPE, callType == null ? "audio" : callType);
        i.putExtra(EXTRA_RELATED_URL, relatedUrl == null ? "" : relatedUrl);
    }

    private static int piFlags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            f |= PendingIntent.FLAG_IMMUTABLE;
        }
        return f;
    }
}
