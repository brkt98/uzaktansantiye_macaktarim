package com.mesalegrup.uzaktansantiye;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * PipPlugin — GÖRÜNTÜLÜ aramada Android Picture-in-Picture köprüsü.
 *
 *  - setPipEligible(active): web (CallRoom) görüntülü aramaya girince true,
 *    çıkınca false. Bayrak STATIC tutulur ki MainActivity.onUserLeaveHint
 *    (ana ekrana çıkış) plugin instance'ı olmadan da okuyabilsin. SESLİ arama
 *    (NativeAudioCallRoom) bu metodu çağırmaz → pipEligible=false → PiP'e girmez.
 *  - enterPip(): "Küçült" butonu → uygulamayı hemen PiP moduna sok (arama sürer).
 *
 * Tüm native PiP işi MainActivity'de (API26+ guard + try/catch). Bu plugin sadece
 * köprü; mevcut FullScreenIntent/LiveKit/sesli akışlara DOKUNMAZ (additive).
 */
@CapacitorPlugin(name = "Pip")
public class PipPlugin extends Plugin {

    /** onUserLeaveHint'in plugin instance'ı olmadan okuyabilmesi için STATIC. */
    private static volatile boolean pipEligible = false;

    public static boolean isPipEligible() {
        return pipEligible;
    }

    @PluginMethod
    public void setPipEligible(PluginCall call) {
        pipEligible = Boolean.TRUE.equals(call.getBoolean("active", false));
        call.resolve();
    }

    @PluginMethod
    public void enterPip(PluginCall call) {
        final Activity act = getActivity();
        if (act instanceof MainActivity) {
            act.runOnUiThread(() -> ((MainActivity) act).enterPipNow());
        }
        call.resolve();
    }
}
