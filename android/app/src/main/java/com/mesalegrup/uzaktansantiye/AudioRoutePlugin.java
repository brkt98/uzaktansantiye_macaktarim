package com.mesalegrup.uzaktansantiye;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * AudioRoute — sesli/görüntülü aramada ses çıkışını (hoparlör ↔ ahize) native yönlendirir.
 * MODE_IN_COMMUNICATION + audio focus (USAGE_VOICE_COMMUNICATION) + setCommunicationDevice (API31+).
 * JS: src/lib/audioRoute.ts
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private AudioFocusRequest focusRequest;

    private AudioManager am() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private void requestFocus(AudioManager am) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(attrs)
                        .build();
                am.requestAudioFocus(focusRequest);
            }
        } catch (Exception ignored) { }
    }

    private void abandonFocus(AudioManager am) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                am.abandonAudioFocusRequest(focusRequest);
                focusRequest = null;
            }
        } catch (Exception ignored) { }
    }

    /** Arama başında: iletişim moduna geç, focus al, başlangıç çıkışını ayarla. */
    @PluginMethod
    public void startCall(PluginCall call) {
        boolean speaker = Boolean.TRUE.equals(call.getBoolean("speaker", Boolean.FALSE));
        try {
            AudioManager am = am();
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            requestFocus(am);
            applyRoute(am, speaker);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Hoparlör (true) ↔ ahize (false) geçişi. */
    @PluginMethod
    public void setSpeaker(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", Boolean.TRUE));
        try {
            AudioManager am = am();
            if (am.getMode() != AudioManager.MODE_IN_COMMUNICATION) {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            }
            applyRoute(am, on);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Arama bitince normal moda dön + focus bırak. */
    @PluginMethod
    public void endCall(PluginCall call) {
        try {
            AudioManager am = am();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.clearCommunicationDevice();
            } else {
                am.setSpeakerphoneOn(false);
            }
            abandonFocus(am);
            am.setMode(AudioManager.MODE_NORMAL);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    private void applyRoute(AudioManager am, boolean speaker) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int target = speaker ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
            AudioDeviceInfo found = null;
            for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                if (d.getType() == target) { found = d; break; }
            }
            if (found != null) {
                am.setCommunicationDevice(found);
            } else if (!speaker) {
                am.clearCommunicationDevice(); // ahize bulunamazsa sistemin varsayılanına (ahize) bırak
            } else {
                am.setSpeakerphoneOn(true);
            }
        } else {
            am.setSpeakerphoneOn(speaker);
        }
    }
}
