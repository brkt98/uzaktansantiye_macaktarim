package com.mesalegrup.uzaktansantiye;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * MicCallService — NATIVE SESLİ arama süresince (FAZ A) çalışan, type=microphone foreground servis.
 *
 * Neden ayrı servis: {@link CallForegroundService} type=phoneCall (gelen arama ÇALMA aşaması).
 * Native LiveKit sesli arama aktif olarak MİKROFON kaydeder → Android 14+ (API34) microphone
 * tipli FGS ister + RECORD_AUDIO runtime izninin verili olmasını ZORUNLU kılar.
 *
 * KRİTİK: onStartCommand'in İLK işi ServiceCompat.startForeground(...) çağırmaktır (5 sn ANR
 * deadline). LiveKitCallPlugin bu servisi SADECE Activity RESUMED iken (kabul akışında MainActivity
 * öne gelmiş olur) başlatır; aksi halde Android while-in-use kuralı SecurityException verir.
 */
public class MicCallService extends Service {

    public static final String ACTION_START = "com.mesalegrup.uzaktansantiye.MIC_CALL_START";
    public static final String ACTION_STOP = "com.mesalegrup.uzaktansantiye.MIC_CALL_STOP";

    private static final String CHANNEL_ID = "ongoing_call";
    private static final int NOTIFICATION_ID = 4712;

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        final String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            stopCall();
            return START_NOT_STICKY;
        }

        // --- İLK İŞ: 5sn deadline içinde startForeground (type=microphone) ---
        ensureChannel();
        Notification notification = buildNotification();

        int fgType = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            fgType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            fgType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        }

        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, fgType);
        } catch (Exception e) {
            // Başlatılamazsa servisi durdur (native arama yine WebRTC ile sürer; sadece FGS koruması olmaz)
            stopSelf();
        }

        return START_NOT_STICKY;
    }

    private void stopCall() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "Devam eden arama",
                NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("Sesli arama sürerken gösterilen bildirim");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle("Sesli arama")
                .setContentText("Görüşme sürüyor")
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setAutoCancel(false)
                .build();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
