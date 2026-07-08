package com.mesalegrup.uzaktansantiye;

import android.app.Activity;
import android.os.Build;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Biometric — parmak izi / yüz ile doğrulama (uygulama kilidi).
 * BIOMETRIC_WEAK (yüz + parmak izini kapsar) + "İptal" butonu — en uyumlu, her sürümde düzgün açılan akış.
 * (DEVICE_CREDENTIAL/keyguard akışı WebView üzerinde render sorunları yaptığı için kullanılmıyor.)
 * JS: src/lib/biometric.ts
 */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {

    private static final int ALLOWED = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        try {
            BiometricManager bm = BiometricManager.from(getContext());
            int code = bm.canAuthenticate(ALLOWED);
            JSObject ret = new JSObject();
            ret.put("available", code == BiometricManager.BIOMETRIC_SUCCESS);
            ret.put("code", code);
            ret.put("sdk", Build.VERSION.SDK_INT);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject(t.getMessage() != null ? t.getMessage() : "isAvailable error");
        }
    }

    @PluginMethod
    public void authenticate(final PluginCall call) {
        final String title = call.getString("title", "Kimlik doğrulama");
        final String subtitle = call.getString("subtitle", "Parmak izi veya yüz ile doğrulayın");

        final Activity act = getActivity();
        if (!(act instanceof FragmentActivity)) {
            call.reject("Aktivite FragmentActivity değil (" + (act == null ? "null" : act.getClass().getSimpleName()) + ")");
            return;
        }
        final FragmentActivity activity = (FragmentActivity) act;

        activity.runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt(
                        activity,
                        ContextCompat.getMainExecutor(activity),
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                JSObject ret = new JSObject();
                                ret.put("success", true);
                                call.resolve(ret);
                            }

                            @Override
                            public void onAuthenticationError(int errorCode, CharSequence errString) {
                                // Kullanıcı "İptal"e basarsa da buraya düşer — başarısız say
                                call.reject((errString != null ? errString.toString() : "Hata") + " [" + errorCode + "]", String.valueOf(errorCode));
                            }
                        });

                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setSubtitle(subtitle)
                        .setAllowedAuthenticators(ALLOWED) // sadece biyometrik (yüz + parmak izi)
                        .setNegativeButtonText("İptal")    // DEVICE_CREDENTIAL yokken zorunlu
                        .setConfirmationRequired(false)
                        .build();
                prompt.authenticate(info);
            } catch (Throwable t) {
                call.reject("Prompt hatası: " + (t.getMessage() != null ? t.getMessage() : t.toString()));
            }
        });
    }
}
