import Foundation
import AVFoundation
import LiveKit

/// iOS native SESLİ arama motoru — Android `LiveKitCallPlugin.kt` (LiveKit Android SDK +
/// AudioSwitchHandler) yapısının birebir iOS eşi. Ses WKWebView WebRTC yerine native
/// LiveKit Swift SDK'da akar → kilitli ekranda ses + doğru earpiece/hoparlör route
/// (CallKit `didActivate` ile el sıkışarak).
///
/// Kapsam: SADECE sesli arama. Görüntülü aramalar WKWebView LiveKitRoom'da kalır.
/// CallKit çalan-ekran/PushKit ayrı katman (CallKitManager) — bu sınıf yalnız GÖRÜŞME motoru.
///
/// ⚠️ LiveKit Swift SDK (client-sdk-swift 2.15.x) API imzaları Xcode autocomplete ile
///    DOĞRULANMALI (RoomDelegate metotları, AudioManager, participant.identity sürüm farkı olabilir).
final class LiveKitCallManager: NSObject {
    static let shared = LiveKitCallManager()

    /// Capacitor plugin (JS event köprüsü). Plugin load olunca set edilir.
    weak var plugin: LiveKitCallPlugin?

    private var room: Room?
    private var hadRemote = false

    /// Bu cihazda ses oturumunu CallKit mi sürüyor (gelen/kilitli). connect() buna göre
    /// motoru kendi açar (giden) veya CallKit didActivate'e bırakır (gelen).
    var callKitDrivingAudio = false

    enum CallError: Error { case noRoom, micDenied }

    /// AppDelegate.didFinishLaunching'ten çağrılır. LiveKit AudioManager'ın OTOMATİK
    /// AVAudioSession yönetimini KAPAT (CallKit ile el sıkışma için şart) + motoru kapalı başlat.
    /// (Resmi LiveKit CallKit örneği bu deseni kullanır.)
    func prepareForCallKit() {
        // ⚠️ Xcode'da doğrula: AudioManager.shared.audioSession (AudioSessionEngineObserver)
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        try? AudioManager.shared.setEngineAvailability(.none)
    }

    // MARK: - Görüşme motoru (JS ↔ LiveKit)

    /// Odaya bağlan + mikrofonu aç. token/url JS'ten gelir (POST /api/rtc/token; native auth YOK).
    func connect(url: String, token: String) async throws {
        guard await ensureMicPermission() else { throw CallError.micDenied }

        // GİDEN (app-açık, CallKit YOK): motoru + oturumu BURADA kur. CallKit sürüyorsa
        // (callKitDidActivate zaten çağrıldı) atla — çift aktivasyon 561015905 verir.
        if !callKitDrivingAudio {
            configureAudioSession()
            // ⚠️ Giden yolda oturumu aktive eden CallKit yok → elle aktive (CallKit yolunda ASLA).
            try? AVAudioSession.sharedInstance().setActive(true)
            try? AudioManager.shared.setEngineAvailability(.default)
        }

        let r = Room(delegate: self)
        room = r
        hadRemote = false
        try await r.connect(url: url, token: token)
        try await r.localParticipant.setMicrophone(enabled: true) // varsayılan mic AÇIK

        // SENTETİK participantConnected: aranan bağlandığında arayan ZATEN odadadır → ona
        // participantDidConnect GELMEZ. Yaymazsak NativeAudioCallRoom "Bağlanıyor…"da asılı kalır.
        if let first = r.remoteParticipants.values.first { // ⚠️ Xcode: remoteParticipants tipini doğrula
            hadRemote = true
            plugin?.emit("participantConnected", [
                "identity": first.identity?.stringValue ?? "",
                "name": first.name ?? "",
            ])
            // GİDEN arama: karşı taraf ZATEN odadaysa CallKit'e "bağlandı" bildir (guard: yalnız giden).
            await MainActor.run { CallKitManager.shared.reportOutgoingConnected() }
        }
        plugin?.emit("connected", [:])
    }

    func setMic(_ enabled: Bool) async throws {
        guard let r = room else { throw CallError.noRoom }
        try await r.localParticipant.setMicrophone(enabled: enabled)
    }

    /// Ahize ↔ hoparlör. CallKit akışında isSpeakerOutputPreferred ETKİSİZ (auto-config kapalı)
    /// → doğrudan AVAudioSession override (mevcut CallKitManager route tekniğiyle aynı).
    func setSpeaker(_ on: Bool) throws {
        try AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }

    /// Görüşmeyi bitir. İdempotent. Giden yolda motoru kapatır; gelen (CallKit) yolda
    /// CallKit çağrısını bitirir → didDeactivate → callKitDidDeactivate motoru kapatır.
    func disconnect() async {
        if let r = room { await r.disconnect() }
        room = nil
        hadRemote = false
        if !callKitDrivingAudio {
            try? AudioManager.shared.setEngineAvailability(.none)
            try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        }
        // Web'den kapatıldıysa (gelen aramada) CallKit çağrısı hâlâ aktif olabilir → bitir.
        // (perform(end)'den gelindiyse currentUUID zaten temizli → no-op; re-entrancy yok.)
        await MainActor.run { CallKitManager.shared.endCurrentCall() }
    }

    // MARK: - CallKit köprüsü (CallKitManager çağırır)

    /// Gelen sesli arama cevaplanıp CallKit oturumu AKTİF olunca (didActivate) → motoru AÇ.
    /// Kilitli ekranda sesin akmasının ANA kaldıracı.
    func callKitDidActivate() {
        callKitDrivingAudio = true
        configureAudioSession()                                  // .voiceChat = earpiece
        try? AudioManager.shared.setEngineAvailability(.default) // motoru BURADA aç (setActive YOK — CallKit yaptı)
    }

    /// CallKit oturumu deaktive olunca → motoru KAPAT.
    func callKitDidDeactivate() {
        callKitDrivingAudio = false
        try? AudioManager.shared.setEngineAvailability(.none)
    }

    // MARK: - Yardımcılar

    private func configureAudioSession() {
        try? AVAudioSession.sharedInstance().setCategory(
            .playAndRecord,
            mode: .voiceChat, // sesli arama → varsayılan çıkış built-in receiver (ahize)
            options: [.allowBluetooth, .allowBluetoothA2DP]
        )
    }

    private func ensureMicPermission() async -> Bool {
        let s = AVAudioSession.sharedInstance()
        if s.recordPermission == .granted { return true }
        return await withCheckedContinuation { cont in
            s.requestRecordPermission { granted in cont.resume(returning: granted) }
        }
    }
}

// MARK: - RoomDelegate → JS event köprüsü (Android bridgeEvents birebir eşi)
// ⚠️ Xcode'da doğrula: RoomDelegate metot imzaları 2.15.x'te değişmiş olabilir.
extension LiveKitCallManager: RoomDelegate {
    func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        hadRemote = true
        plugin?.emit("participantConnected", [
            "identity": participant.identity?.stringValue ?? "",
            "name": participant.name ?? "",
        ])
        // GİDEN arama: karşı taraf katıldı → CallKit'e "bağlandı" (aranıyor→süreli arama). Guard: yalnız giden.
        Task { await MainActor.run { CallKitManager.shared.reportOutgoingConnected() } }
    }

    func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        plugin?.emit("participantDisconnected", [
            "identity": participant.identity?.stringValue ?? "",
        ])
    }

    func room(_ room: Room, didUpdateConnectionState state: ConnectionState, from oldState: ConnectionState) {
        switch state {
        case .disconnected:
            plugin?.emit("disconnected", [:])
        case .reconnecting:
            plugin?.emit("connectionState", ["state": "reconnecting"])
        case .connected where oldState == .reconnecting:
            plugin?.emit("connectionState", ["state": "connected"])
        default:
            break
        }
    }
}
