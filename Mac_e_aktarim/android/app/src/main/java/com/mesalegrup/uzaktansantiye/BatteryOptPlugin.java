package com.mesalegrup.uzaktansantiye;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pil optimizasyonu muafiyeti — arka planda data-only FCM push tesliminin
 * güvenilirliği için (Doze/OEM kısıtları bildirimleri geciktirebilir/düşürebilir).
 *
 * isExempt(): uygulama pil optimizasyonundan muaf mı?
 * request(): sistem muafiyet diyaloğunu açar (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS izni ile).
 */
@CapacitorPlugin(name = "BatteryOpt")
public class BatteryOptPlugin extends Plugin {

    @PluginMethod
    public void isExempt(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            boolean exempt = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            ret.put("exempt", exempt);
        } catch (Throwable t) {
            ret.put("exempt", true); // bilinemiyorsa kullanıcıyı rahatsız etme
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void request(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Throwable t) {
            // Bazı OEM'lerde doğrudan diyalog yok → genel pil optimizasyonu ayarları
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Throwable t2) {
                call.reject("Pil optimizasyonu ayarı açılamadı");
            }
        }
    }
}
