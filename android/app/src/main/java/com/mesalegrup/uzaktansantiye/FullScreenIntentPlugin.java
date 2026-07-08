package com.mesalegrup.uzaktansantiye;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * FullScreenIntentPlugin — Android 14+ (API34) "full-screen intent" özel izninin
 * durumunu kontrol eder ve gerekirse sistem ayar sayfasını açar.
 * &lt;34'te izin her zaman verili sayılır (canUse → true).
 */
@CapacitorPlugin(name = "FullScreenIntent")
public class FullScreenIntentPlugin extends Plugin {

    @PluginMethod
    public void canUse(PluginCall call) {
        boolean ok = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager)
                    getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            ok = nm != null && nm.canUseFullScreenIntent();
        }
        JSObject ret = new JSObject();
        ret.put("granted", ok);
        call.resolve(ret);
    }

    /**
     * Call ekranı kilit ekranı üstünde gösterilsin mi? (active=false → çağrı bitince
     * uygulama yine kilit ALTINA döner, geri kalan ekranlar keyguard+PIN ile korunur.)
     */
    @PluginMethod
    public void setOverLockScreen(PluginCall call) {
        final boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        final Activity act = getActivity();
        if (act != null && Build.VERSION.SDK_INT >= 27) {
            act.runOnUiThread(() -> {
                try {
                    act.setShowWhenLocked(active);
                    act.setTurnScreenOn(active);
                } catch (Exception ignored) {
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception ignored) {
                // bazı OEM'lerde intent yok → sessiz geç
            }
        }
        call.resolve();
    }
}
