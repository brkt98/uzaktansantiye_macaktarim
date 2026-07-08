package com.mesalegrup.uzaktansantiye;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.ServiceCompat;

/**
 * CallForegroundService — gelen arama süresince (kapalı/kilitli uygulamada) foreground
 * servis. type=phoneCall.
 *
 * KRİTİK: onStartCommand'in İLK işi ServiceCompat.startForeground(...) çağırmaktır
 * (Android'in 5 saniyelik ANR deadline'ı). Aksi halde sistem süreci öldürür.
 *
 * ~45 saniye sonra cevap gelmezse (kaçırılan arama) kendini durdurur.
 */
public class CallForegroundService extends Service {

    public static final String ACTION_START = "com.mesalegrup.uzaktansantiye.CALL_FG_START";
    public static final String ACTION_STOP = "com.mesalegrup.uzaktansantiye.CALL_FG_STOP";

    private static final long RING_TIMEOUT_MS = 45_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable timeoutRunnable;

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        final String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            stopRinging();
            return START_NOT_STICKY;
        }

        // --- İLK İŞ: 5sn deadline içinde startForeground ---
        String conversationId = intent != null ? intent.getStringExtra(CallNotif.EXTRA_CONVERSATION_ID) : null;
        String callerName = intent != null ? intent.getStringExtra(CallNotif.EXTRA_CALLER_NAME) : null;
        String fromUserId = intent != null ? intent.getStringExtra(CallNotif.EXTRA_FROM_USER_ID) : null;
        String callType = intent != null ? intent.getStringExtra(CallNotif.EXTRA_CALL_TYPE) : null;
        String relatedUrl = intent != null ? intent.getStringExtra(CallNotif.EXTRA_RELATED_URL) : null;

        Notification notification = CallNotif.build(
                this, conversationId, callerName, fromUserId, callType, relatedUrl);

        int fgType = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            fgType = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL;
        }

        try {
            ServiceCompat.startForeground(this, CallNotif.NOTIFICATION_ID, notification, fgType);
        } catch (Exception e) {
            // startForeground başarısız olursa (ör. kısıtlama) en azından bildirimi göster
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(CallNotif.NOTIFICATION_ID, notification);
        }

        // --- ~45sn cevapsız → kaçırılan arama olarak durdur ---
        cancelTimeout();
        timeoutRunnable = () -> stopRinging();
        handler.postDelayed(timeoutRunnable, RING_TIMEOUT_MS);

        return START_NOT_STICKY;
    }

    private void stopRinging() {
        cancelTimeout();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(CallNotif.NOTIFICATION_ID);
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void cancelTimeout() {
        if (timeoutRunnable != null) {
            handler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }
    }

    @Override
    public void onDestroy() {
        cancelTimeout();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
