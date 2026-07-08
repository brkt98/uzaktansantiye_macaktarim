package com.mesalegrup.uzaktansantiye;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AudioRoutePlugin.class);
        registerPlugin(BiometricPlugin.class);
        registerPlugin(ShareTargetPlugin.class);
        registerPlugin(FullScreenIntentPlugin.class);
        // Arka plan push güvenilirliği: pil optimizasyonu muafiyeti
        registerPlugin(BatteryOptPlugin.class);
        // SPIKE: Native LiveKit (Kotlin sınıfı; Java'dan .class ile erişilir)
        registerPlugin(LiveKitCallPlugin.class);
        // GÖRÜNTÜLÜ arama Picture-in-Picture köprüsü
        registerPlugin(PipPlugin.class);
        // Bildirimden "Kabul" ile gelindiyse call ekranını kilit ÜSTÜNDE göster (telefon PIN'i istenmesin)
        applyCallScreenFlags(getIntent());
        super.onCreate(savedInstanceState);
    }

    // Arka plana her geçişte WebView çerezlerini (auth-token) diske yaz → kapalı uygulamada
    // bildirimden cevap/okundu yapan BroadcastReceiver'lar oturum çerezini okuyabilsin.
    @Override
    public void onPause() {
        super.onPause();
        try { CookieManager.getInstance().flush(); } catch (Throwable ignored) {}
    }

    // Çalışan uygulamaya yeni intent (paylaşım / arama kabul) gelirse
    @Override
    public void onNewIntent(Intent intent) {
        setIntent(intent);
        applyCallScreenFlags(intent);
        super.onNewIntent(intent);
    }

    /** Arama kabul intent'i (accept=1) ise kilit ekranı üstünde göster + ekranı uyandır. */
    private void applyCallScreenFlags(Intent intent) {
        boolean isCallAccept = intent != null && "1".equals(intent.getStringExtra("accept"));
        if (isCallAccept && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }

    // ===== Picture-in-Picture (SADECE görüntülü arama) =====

    /**
     * Kullanıcı ana ekrana / başka uygulamaya çıkarsa (geri tuşunda DEĞİL) tetiklenir.
     * GÖRÜNTÜLÜ arama aktifse (PipPlugin bayrağı) PiP moduna gir, arama devam etsin.
     */
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (PipPlugin.isPipEligible()) {
            enterPipNow();
        }
    }

    /** "Küçült" butonu / onUserLeaveHint ortak girişi. API26+ + cihaz desteği + try/catch. */
    public void enterPipNow() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(16, 9))
                        .build();
                enterPictureInPictureMode(params);
            } catch (Exception ignored) {
                // OEM/cihaz reddederse sessiz geç (kör-build güvenliği)
            }
        }
    }

    /**
     * PiP'e girip/çıkınca WebView'e "pipModeChanged" event'i köprüle → web kontrolleri gizler/gösterir.
     * super ÇAĞRISI ZORUNLU (fragment dağıtımı). getBridge() null olabilir → kontrol et.
     */
    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (getBridge() != null) {
            getBridge().triggerWindowJSEvent(
                    "pipModeChanged",
                    "{\"isInPip\":" + isInPictureInPictureMode + "}"
            );
        }
    }
}
