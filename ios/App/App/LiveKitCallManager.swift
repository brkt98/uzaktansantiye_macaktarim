import Foundation
import AVFoundation
import Combine
import UIKit
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

    /// Faz 4: AYRI "-screen" Room (Android screenRoom eşi). Ana görüntülü arama WKWebView'de.
    private var screenRoom: Room?
    /// Sistemden-durdurma (status bar/Kontrol Merkezi) gözlemcisi.
    private var broadcastSub: AnyCancellable?

    /// Bu cihazda ses oturumunu CallKit mi sürüyor (gelen/kilitli). connect() buna göre
    /// motoru kendi açar (giden) veya CallKit didActivate'e bırakır (gelen).
    var callKitDrivingAudio = false

    enum CallError: Error { case noRoom, micDenied, broadcastTimeout }

    /// AppDelegate.didFinishLaunching'ten çağrılır. LiveKit AudioManager'ın OTOMATİK
    /// AVAudioSession yönetimini KAPAT (CallKit ile el sıkışma için şart) + motoru kapalı başlat.
    /// (Resmi LiveKit CallKit örneği bu deseni kullanır.)
    func prepareForCallKit() {
        // ⚠️ Xcode'da doğrula: AudioManager.shared.audioSession (AudioSessionEngineObserver)
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        try? AudioManager.shared.setEngineAvailability(.none)
        // Faz 4 (ekran paylaşımı): SDK oto-publish'ini kapat + sistemden-durdurma gözlemcisi.
        // İlk Room yaratılmadan ÖNCE yapılmalı (LocalParticipant init'te broadcast'e abone olur).
        wireBroadcastObserver()
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

        // Önceki oda kaldıysa KAPAT (yeniden bağlanma güvenliği — Android teardownRoom eşi;
        // yoksa eski oda sessizce açık kalıp ghost-mic olabilirdi).
        if let old = room {
            await old.disconnect()
            room = nil
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
            // GİDEN arama: karşı taraf ZATEN odadaysa CallKit'e "bağlandı" + gerçek adı bildir.
            let peerName = first.name ?? ""
            await MainActor.run { CallKitManager.shared.reportOutgoingConnected(peerName: peerName) }
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
        // Ekran paylaşımı açıksa önce kapat (Android disconnect + handleOnDestroy eşi).
        if screenRoom != nil || BroadcastManager.shared.isBroadcasting {
            await stopScreenShare()
        }
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

    // MARK: - Ekran paylaşımı (Faz 4) — Android screenRoom deseninin birebir iOS eşi
    // Ana GÖRÜNTÜLÜ arama WKWebView LiveKitRoom'da sürer (identity=user.id); native katmanda o
    // aramanın Room'u YOK. Ekran track'i buradaki AYRI screenRoom'da, AYRI "-screen" identity
    // token'ıyla publish edilir (DUPLICATE_IDENTITY çözümü, Android sözleşmesi).
    // Kare akışı: BroadcastExtension süreci (LKSampleHandler) → App Group unix soketi (rtc_SSFD)
    // → BU süreçteki BroadcastScreenCapturer → screenRoom publish. Extension WebRTC'ye BAĞLANMAZ
    // (50MB extension bellek limitine takılmaz).

    /// Yayını başlat. token/url JS'ten gelir (fetchScreenToken; identity zaten "-screen" suffix'li).
    /// Android'le aynı sıra: önce consent (sistem picker'ı), sonra bağlan + publish.
    func startScreenShare(url: String, token: String) async throws {
        wireBroadcastObserver()      // idempotent (prepareForCallKit'te de çağrılır)
        await teardownScreenRoom()   // önceki oturum kaldıysa temizle (tekrar-başlatma güvenliği)

        // 1) Sistem yayın izni: SDK, RPSystemBroadcastPickerView'i programatik tetikler.
        if !BroadcastManager.shared.isBroadcasting {
            BroadcastManager.shared.requestActivation()
            guard await waitForBroadcastStart(timeout: 60) else {
                BroadcastManager.shared.requestStop() // yayın geç başlarsa bile asılı kalmasın
                plugin?.emit("screenShareState", ["active": false])
                throw CallError.broadcastTimeout
            }
        }

        // 2) AYRI "-screen" Room'a bağlan + publish. MİKROFON BU ODADA ASLA AÇILMAZ,
        //    ses oturumuna dokunulmaz (Android NoAudioHandler eşdeğeri; appAudio=false).
        do {
            // ⚠️ Xcode'da doğrula: RoomOptions/ScreenShareCaptureOptions/connect imzaları (2.15.x).
            // Broadcast modunda çözünürlük/fps YALNIZ RoomOptions.defaultScreenShareCaptureOptions'tan
            // okunur (setScreenShare'e verilen captureOptions YOK SAYILIR — SDK warning loglar).
            let opts = RoomOptions(
                defaultScreenShareCaptureOptions: ScreenShareCaptureOptions(
                    dimensions: .h1080_169,
                    fps: 15,                     // şantiye ekranı için yeterli, bant genişliği düşük
                    appAudio: false,             // ses ASLA — ana aramanın ses hattına dokunma
                    useBroadcastExtension: true  // yanlış konfigde SESSİZCE in-app'e düşmesin
                )
            )
            let r = Room()
            screenRoom = r
            try await r.connect(url: url, token: token, roomOptions: opts)
            // isBroadcasting=true olduğundan SDK guard'ı geçer → track ANINDA publish edilir.
            try await r.localParticipant.setScreenShare(enabled: true)
            plugin?.emit("screenShareState", ["active": true])
        } catch {
            await teardownScreenRoom()
            BroadcastManager.shared.requestStop()
            plugin?.emit("screenShareState", ["active": false])
            throw error
        }
    }

    /// Yayını app'ten durdur. İdempotent (oda yoksa da güvenli — Android stopScreenShare eşi).
    func stopScreenShare() async {
        await teardownScreenRoom()
        if BroadcastManager.shared.isBroadcasting {
            BroadcastManager.shared.requestStop() // Darwin "iOS_BroadcastRequestStop" → extension biter
        }
        plugin?.emit("screenShareState", ["active": false])
    }

    /// KRİTİK kurulum: shouldPublishTrack=false → SDK'nın oto-publish'i kapanır (yoksa açık HER
    /// Room — native sesli arama dahil — broadcast başlayınca kendi odasına publish etmeye kalkar;
    /// rtc_SSFD soketi TEK alıcı kabul ettiği için çakışır). Ayrıca sistemden-durdurmayı yakalar:
    /// kullanıcı yayını status bar kırmızı gösterge / Kontrol Merkezi'nden bitirirse (Android'de
    /// olmayan yol) screenRoom kapatılır + screenShareState {active:false} yayılır.
    private func wireBroadcastObserver() {
        guard broadcastSub == nil else { return }
        // ⚠️ Xcode'da doğrula: BroadcastManager.shared API'leri (2.15.x).
        BroadcastManager.shared.shouldPublishTrack = false
        broadcastSub = BroadcastManager.shared.isBroadcastingPublisher
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isOn in
                guard let self = self, !isOn, self.screenRoom != nil else { return }
                Task {
                    await self.teardownScreenRoom()
                    self.plugin?.emit("screenShareState", ["active": false])
                }
            }
    }

    /// Yayının fiilen başlamasını bekle. Picker İPTALİNDE sinyal GELMEZ → iki emniyet:
    /// (1) picker kapanınca app yeniden aktif olur → 2.5sn grace sonrası yayın yoksa HIZLI false
    /// (JS'teki screenBusy kilidi 60sn asılı kalmaz), (2) mutlak zaman aşımı.
    private func waitForBroadcastStart(timeout: TimeInterval) async -> Bool {
        if BroadcastManager.shared.isBroadcasting { return true }
        return await withCheckedContinuation { cont in
            DispatchQueue.main.async {
                var finished = false
                var subs = Set<AnyCancellable>()
                func finish(_ ok: Bool) {
                    guard !finished else { return }
                    finished = true
                    subs.removeAll()
                    cont.resume(returning: ok)
                }
                BroadcastManager.shared.isBroadcastingPublisher
                    .receive(on: DispatchQueue.main)
                    .filter { $0 }
                    .sink { _ in finish(true) }
                    .store(in: &subs)
                NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
                    .receive(on: DispatchQueue.main)
                    .sink { _ in
                        // Picker kapandı (iptal VEYA "Başlat"): Darwin bildirimi picker kapanışının
                        // hemen ardından gelir → 2.5sn grace yeterli; yarışırsa finish(true) kazanır.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                            if !BroadcastManager.shared.isBroadcasting { finish(false) }
                        }
                    }
                    .store(in: &subs)
                DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { finish(false) }
            }
        }
    }

    /// Screen Room'u kapat. İdempotent + re-entrancy güvenli: ÖNCE nil'le → broadcast sink'i,
    /// disconnect'in tetiklediği isBroadcasting=false geçişinde ikinci teardown YAPMAZ.
    private func teardownScreenRoom() async {
        guard let r = screenRoom else { return }
        screenRoom = nil
        try? await r.localParticipant.setScreenShare(enabled: false)
        await r.disconnect()
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
        // GİDEN arama: karşı taraf katıldı → CallKit'e "bağlandı" + gerçek adı bildir. Guard: yalnız giden.
        let peerName = participant.name ?? ""
        Task { await MainActor.run { CallKitManager.shared.reportOutgoingConnected(peerName: peerName) } }
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
