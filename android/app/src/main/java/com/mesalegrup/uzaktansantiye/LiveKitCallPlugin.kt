package com.mesalegrup.uzaktansantiye

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.PowerManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.AudioOptions
import io.livekit.android.RoomOptions
import io.livekit.android.audio.AudioSwitchHandler
import io.livekit.android.audio.NoAudioHandler
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import com.twilio.audioswitch.AudioDevice
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import io.livekit.android.events.collect

/**
 * LiveKitCallPlugin — FAZ A: SADECE SESLİ (audio-only) aramayı native LiveKit Android SDK ile yürütür.
 *
 * Görüntülü/web/masaüstü arama DEĞİŞMEZ (orası WebView LiveKitRoom + livekit-client'ta kalır).
 * Sinyalizasyon ORTAK: JS token'ı /api/rtc/token'dan alır, native connect(token,url)'a verir
 * (native auth YAPMAZ).
 *
 * KRİTİK ses yönlendirmesi: TÜM yönlendirme AudioSwitchHandler ile yapılır (preferredDeviceList
 * ahize-öncelikli + runtime selectDevice). AudioRoutePlugin/audioRoute.ts native dalda HİÇ
 * çağrılmaz (çift ses-motoru çakışmasını önlemek için). Manuel setMode YAPILMAZ.
 *
 * Mikrofon FGS'i (MicCallService) connect anında, Activity RESUMED iken başlatılır (Android 14+
 * while-in-use kuralı) ve disconnect'te durdurulur.
 */
@CapacitorPlugin(
    name = "LiveKitCall",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")]
)
class LiveKitCallPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var room: Room? = null
    private var eventsJob: Job? = null
    private var micServiceStarted = false
    // Yakınlık sensörü (sesli aramada ahize modunda kulağa tutunca ekran söner) wake lock'u.
    private var proximityWakeLock: PowerManager.WakeLock? = null

    // ===== EKRAN PAYLAŞIMI (additive) — ana sesli/görüntülü aramadan BAĞIMSIZ ayrı Room =====
    // Görüntülü aramada ana bağlantı WebView'dedir (identity=user.id). Ekran track'i AYRI
    // identity (user.id + "-screen") ile AYRI bir Room'da publish edilir → DUPLICATE_IDENTITY olmaz.
    // Mikrofon bu Room'da AÇILMAZ; sadece MediaProjection ekran track'i publish edilir.
    private var screenRoom: Room? = null
    // startScreenShare ile gelen token/url, consent (MediaProjection) sonucu beklerken saklanır.
    private var pendingScreenToken: String? = null
    private var pendingScreenUrl: String? = null

    /** Gelen 'value'yu aynen geri döndüren basit echo stub'ı (tanılama). */
    @PluginMethod
    fun echo(call: PluginCall) {
        val value = call.getString("value")
        val ret = JSObject()
        ret.put("value", value)
        call.resolve(ret)
    }

    /** SDK'nın linklendiğini doğrulayan tanılama (Room sınıf adı). */
    @PluginMethod
    fun getSdkInfo(call: PluginCall) {
        val ret = JSObject()
        ret.put("sdk", "livekit-android")
        ret.put("linked", true)
        ret.put("roomClass", Room::class.java.name)
        ret.put("engine", "audio-v1") // gerçek sesli motor işareti (web capability gate okur)
        ret.put("screenShare", true) // native ekran paylaşımı (startScreenShare) mevcut
        call.resolve(ret)
    }

    /**
     * SESLİ aramaya bağlan. JS token+url verir (native auth yok).
     * Akış: Room oluştur (AudioSwitchHandler + ahize-öncelikli liste) → mic FGS başlat →
     * room.connect → mikrofon aç → event'leri JS'e köprüle.
     */
    @PluginMethod
    fun connect(call: PluginCall) {
        // RECORD_AUDIO runtime izni ZORUNLU — yoksa WebRTC AudioRecord.startRecording assertion
        // fail eder (AssertionError → çöküş). WebView'in mikrofon izni native AudioRecord'a yansımaz.
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermsCallback")
            return
        }
        doConnect(call)
    }

    @PermissionCallback
    private fun micPermsCallback(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            doConnect(call)
        } else {
            call.reject("Mikrofon izni verilmedi")
        }
    }

    private fun doConnect(call: PluginCall) {
        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url ve token zorunlu")
            return
        }

        val ctx = context.applicationContext

        try {
            // Önceki oda kaldıysa temizle (yeniden bağlanma güvenliği)
            teardownRoom()

            val newRoom = LiveKit.create(
                appContext = ctx,
                options = RoomOptions(), // audio-only: video publish edilmez, ek opsiyon gereksiz
                overrides = LiveKitOverrides(
                    audioOptions = AudioOptions(
                        audioHandler = AudioSwitchHandler(ctx)
                    )
                )
            )
            room = newRoom

            // Ahize-öncelikli liste — connect'ten ÖNCE (start() CONNECTING'de tetiklenmeden).
            // Varsayılan liste Speakerphone'u Earpiece'ten ÖNCE koyar → bunu EZ.
            (newRoom.audioHandler as? AudioSwitchHandler)?.preferredDeviceList = listOf(
                AudioDevice.WiredHeadset::class.java,
                AudioDevice.BluetoothHeadset::class.java,
                AudioDevice.Earpiece::class.java,        // Speakerphone'dan ÖNCE → varsayılan ahize
                AudioDevice.Speakerphone::class.java
            )

            bridgeEvents(newRoom)

            // FAZ A: mikrofon FGS GEÇİCİ DEVRE DIŞI. Android 14+ (API36) microphone-tipli FGS
            // çok katı (RECORD_AUDIO + while-in-use) — servisin startForeground hatası plugin
            // try/catch'ine düşmez → sert çöküş kaynağı. Resmi LiveKit örneği de basit aramada
            // FGS kullanmaz. Önplan-aramada gerek yok; Faz B'de izin akışıyla geri eklenir.
            // startMicService()

            scope.launch {
                try {
                    newRoom.connect(url, token)
                    newRoom.localParticipant.setMicrophoneEnabled(true)
                    val ret = JSObject()
                    ret.put("connected", true)
                    call.resolve(ret)
                } catch (e: Throwable) {
                    // AssertionError dahil HER hatayı yakala (Error'lar Exception değildir) → çöküş yok
                    stopMicService()
                    call.reject("Bağlantı kurulamadı: ${e.message}")
                }
            }
        } catch (e: Throwable) {
            stopMicService()
            call.reject("connect başlatılamadı: ${e.message}")
        }
    }

    /** Mikrofonu aç/kapat (mute). */
    @PluginMethod
    fun setMicrophoneEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val r = room
        if (r == null) {
            call.reject("Oda yok")
            return
        }
        scope.launch {
            try {
                r.localParticipant.setMicrophoneEnabled(enabled)
                val ret = JSObject()
                ret.put("enabled", enabled)
                call.resolve(ret)
            } catch (e: Throwable) {
                call.reject("Mikrofon ayarlanamadı: ${e.message}")
            }
        }
    }

    /**
     * Hoparlör ↔ ahize. SADECE AudioSwitchHandler.selectDevice ile (manuel AudioManager YOK).
     * connect/start SONRASI iş görür (start() CONNECTING'de otomatik çağrılmıştır).
     */
    @PluginMethod
    fun setSpeaker(call: PluginCall) {
        val on = call.getBoolean("on", false) ?: false
        val handler = room?.audioHandler as? AudioSwitchHandler
        if (handler == null) {
            call.reject("Ses yöneticisi yok")
            return
        }
        try {
            val target = handler.availableAudioDevices.firstOrNull {
                if (on) it is AudioDevice.Speakerphone else it is AudioDevice.Earpiece
            }
            handler.selectDevice(target)
            val ret = JSObject()
            ret.put("on", on)
            ret.put("selected", target?.name ?: "")
            call.resolve(ret)
        } catch (e: Throwable) {
            call.reject("Hoparlör ayarlanamadı: ${e.message}")
        }
    }

    /**
     * Yakınlık sensörü: sesli aramada AHİZE modunda kulağa tutunca ekranı SÖNDÜR
     * (PROXIMITY_SCREEN_OFF_WAKE_LOCK), kulaktan uzaklaştırınca aç. Ekranı KİLİTLEMEZ; yalnız
     * kulakla yanlış dokunuşları engeller. NativeAudioCallRoom (hoparlör kapalı iken on=true,
     * hoparlör açık/arama bitince on=false) çağırır.
     */
    @PluginMethod
    fun setProximity(call: PluginCall) {
        val on = call.getBoolean("on", false) ?: false
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (on) {
                if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
                    call.resolve(); return // cihaz desteklemiyor → sessizce geç
                }
                if (proximityWakeLock == null) {
                    proximityWakeLock = pm.newWakeLock(
                        PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
                        "uzaktansantiye:call-proximity"
                    )
                }
                if (proximityWakeLock?.isHeld != true) {
                    proximityWakeLock?.acquire(60 * 60 * 1000L) // en fazla 1 saat güvenlik süresi
                }
            } else {
                releaseProximity()
            }
            call.resolve()
        } catch (e: Throwable) {
            call.reject("Yakınlık sensörü ayarlanamadı: ${e.message}")
        }
    }

    private fun releaseProximity() {
        try {
            if (proximityWakeLock?.isHeld == true) proximityWakeLock?.release()
        } catch (_: Throwable) {}
    }

    // ====================== EKRAN PAYLAŞIMI (additive) ======================

    /**
     * Ekran paylaşımını BAŞLAT. JS, AYRI bir "-screen" identity'li token+url verir
     * (POST /api/rtc/token {conversationId, screen:true}). Akış:
     *   1) MediaProjectionManager.createScreenCaptureIntent() → HER seferde TAZE consent
     *      (Android 14+ resultData saklanamaz → SecurityException).
     *   2) startActivityForResult(call, intent, "onProjection") → kullanıcı onayı.
     *   3) @ActivityCallback onProjection: AYRI screenRoom connect + setScreenShareEnabled(true, params).
     * Mikrofon bu Room'da AÇILMAZ → ana sesli arama ses cihazı yönetimiyle çakışma riski minimum.
     */
    @PluginMethod
    fun startScreenShare(call: PluginCall) {
        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url ve token zorunlu")
            return
        }
        pendingScreenToken = token
        pendingScreenUrl = url
        try {
            val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val intent = mpm.createScreenCaptureIntent() // her seferinde TAZE consent
            startActivityForResult(call, intent, "onProjection")
        } catch (e: Throwable) {
            pendingScreenToken = null
            pendingScreenUrl = null
            call.reject("Ekran paylaşımı izni başlatılamadı: ${e.message}")
        }
    }

    @ActivityCallback
    private fun onProjection(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val token = pendingScreenToken
        val url = pendingScreenUrl
        pendingScreenToken = null
        pendingScreenUrl = null

        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("Ekran paylaşımı izni reddedildi")
            return
        }
        if (token.isNullOrBlank() || url.isNullOrBlank()) {
            call.reject("Ekran paylaşımı token/url kayboldu")
            return
        }
        val resultData: Intent = result.data!!

        scope.launch {
            try {
                // Önceki ekran bağlantısı kaldıysa kapat (tekrar başlatma güvenliği)
                teardownScreenRoom()

                // KRİTİK: Ekran Room'u VIDEO-ONLY (mikrofon yok). Varsayılan AudioSwitchHandler
                // start()'ta AUDIO FOCUS alır + AudioManager.MODE_IN_COMMUNICATION'a geçer (manageAudioFocus
                // varsayılan true). Görüntülü aramada ANA ses/görüntü WebView livekit-client'ta sürdüğü için
                // bu ikinci ses motoru ana çağrının ses yönlendirmesini bozar (echo / odak kaybı / çıkış
                // değişimi). NoAudioHandler ses oturumuna HİÇ dokunmaz → çakışma yok.
                val newScreen = LiveKit.create(
                    appContext = context.applicationContext,
                    options = RoomOptions(), // ekran-only: mikrofon AÇILMAZ
                    overrides = LiveKitOverrides(
                        audioOptions = AudioOptions(
                            audioHandler = NoAudioHandler()
                        )
                    )
                )
                screenRoom = newScreen
                newScreen.connect(url, token)
                // SADECE ekran track'i publish edilir; mikrofon AÇMA (setMicrophoneEnabled çağırma).
                // v2.25.3: setScreenShareEnabled(enabled, ScreenCaptureParams) — Intent'i ScreenCaptureParams'a sar.
                newScreen.localParticipant.setScreenShareEnabled(
                    true,
                    ScreenCaptureParams(resultData)
                )
                notifyListeners("screenShareState", JSObject().put("active", true))
                val ret = JSObject()
                ret.put("active", true)
                call.resolve(ret)
            } catch (e: Throwable) {
                teardownScreenRoom()
                notifyListeners("screenShareState", JSObject().put("active", false))
                call.reject("Ekran paylaşımı başlatılamadı: ${e.message}")
            }
        }
    }

    /** Ekran paylaşımını DURDUR: screen track kapat + ekran Room disconnect (SDK FGS'i kendi kapatır). */
    @PluginMethod
    fun stopScreenShare(call: PluginCall) {
        scope.launch {
            try {
                screenRoom?.localParticipant?.setScreenShareEnabled(false)
            } catch (_: Throwable) {}
            teardownScreenRoom()
            notifyListeners("screenShareState", JSObject().put("active", false))
            call.resolve()
        }
    }

    private fun teardownScreenRoom() {
        screenRoom?.let {
            try { it.disconnect() } catch (_: Throwable) {}
        }
        screenRoom = null
    }

    // ========================================================================

    /** Aramayı sonlandır: oda kapat + mic FGS durdur. */
    @PluginMethod
    fun disconnect(call: PluginCall) {
        try {
            teardownRoom()
            teardownScreenRoom() // varsa ekran paylaşımını da kapat
            stopMicService()
            releaseProximity() // arama bitti → ekran her zaman açık kalsın
            call.resolve()
        } catch (e: Throwable) {
            call.reject("Kapatılamadı: ${e.message}")
        }
    }

    /** room.events → Capacitor notifyListeners köprüsü. */
    private fun bridgeEvents(r: Room) {
        eventsJob?.cancel()
        eventsJob = scope.launch {
            r.events.collect { event ->
                when (event) {
                    is RoomEvent.ParticipantConnected ->
                        notifyListeners("participantConnected", JSObject()
                            .put("identity", event.participant.identity?.value ?: "")
                            .put("name", event.participant.name ?: ""))
                    is RoomEvent.ParticipantDisconnected ->
                        notifyListeners("participantDisconnected", JSObject().put("identity", event.participant.identity?.value ?: ""))
                    is RoomEvent.ActiveSpeakersChanged ->
                        notifyListeners("activeSpeakers", JSObject().put("count", r.activeSpeakers.size))
                    is RoomEvent.Reconnecting ->
                        notifyListeners("connectionState", JSObject().put("state", "reconnecting"))
                    is RoomEvent.Reconnected ->
                        notifyListeners("connectionState", JSObject().put("state", "connected"))
                    is RoomEvent.Connected -> {
                        notifyListeners("connected", JSObject())
                        // KRİTİK: aranan (answerer) bağlandığında arayan ZATEN odadadır →
                        // onun için ParticipantConnected ASLA tetiklenmez (o "mevcut" katılımcı).
                        // Bağlanır bağlanmaz mevcut uzak katılımcıları JS'e bildir ki
                        // NativeAudioCallRoom "Bağlanıyor…" ekranında ASILI KALMASIN.
                        if (r.remoteParticipants.isNotEmpty()) {
                            val first = r.remoteParticipants.values.firstOrNull()
                            notifyListeners(
                                "participantConnected",
                                JSObject()
                                    .put("identity", first?.identity?.value ?: "")
                                    .put("name", first?.name ?: "")
                            )
                        }
                    }
                    is RoomEvent.Disconnected ->
                        notifyListeners("disconnected", JSObject())
                    else -> {}
                }
            }
        }
    }

    private fun teardownRoom() {
        eventsJob?.cancel()
        eventsJob = null
        room?.let {
            try { it.disconnect() } catch (_: Throwable) {}
        }
        room = null
    }

    private fun startMicService() {
        if (micServiceStarted) return
        try {
            val i = Intent(context, MicCallService::class.java)
            i.action = MicCallService.ACTION_START
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(i)
            } else {
                context.startService(i)
            }
            micServiceStarted = true
        } catch (_: Throwable) {
            // RESUMED değilken SecurityException olabilir — arama yine de native çalışır,
            // sadece arka plan koruması olmaz.
            micServiceStarted = false
        }
    }

    private fun stopMicService() {
        if (!micServiceStarted) return
        try {
            val i = Intent(context, MicCallService::class.java)
            i.action = MicCallService.ACTION_STOP
            context.startService(i)
        } catch (_: Throwable) {}
        micServiceStarted = false
    }

    override fun handleOnDestroy() {
        teardownRoom()
        teardownScreenRoom()
        stopMicService()
        releaseProximity()
        scope.cancel()
        super.handleOnDestroy()
    }
}
