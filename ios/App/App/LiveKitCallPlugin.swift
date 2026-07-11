import Foundation
import Capacitor
import UIKit

/// Native LiveKit sesli arama köprüsü — Android `LiveKitCallPlugin.kt`'nin iOS eşi.
/// JS tarafı: src/lib/liveKitCall.ts (`registerPlugin("LiveKitCall")`).
/// Çekirdek: LiveKitCallManager (LiveKit Swift SDK).
///
/// Sözleşme (Android ile BİREBİR): getSdkInfo/connect/setMicrophoneEnabled/setSpeaker/
/// disconnect/startScreenShare/stopScreenShare + eventler
/// connected/disconnected/participantConnected/participantDisconnected/connectionState.
///
/// ⚠️ Bu LOCAL app-target plugin → capacitor.config.json packageClassList'e "LiveKitCallPlugin"
///    EKLENMELİ (CallKitVoipPlugin gibi; her `npx cap sync ios` sonrası korunmalı).
@objc(LiveKitCallPlugin)
public class LiveKitCallPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveKitCallPlugin"
    public let jsName = "LiveKitCall"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSdkInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMicrophoneEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeaker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        // Yakınlık sensörü (sesli aramada ahize modunda kulağa tutunca ekran söner)
        CAPPluginMethod(name: "setProximity", returnType: CAPPluginReturnPromise),
        // iOS ekran paylaşımı ReplayKit/Broadcast Extension ister (ayrı workstream) → şimdilik stub.
        CAPPluginMethod(name: "startScreenShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScreenShare", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        LiveKitCallManager.shared.plugin = self
    }

    func emit(_ name: String, _ data: [String: Any]) {
        notifyListeners(name, data: data)
    }

    // getSdkInfo: engine="audio-v1" ZORUNLU → yoksa JS gate (lkAudioEngine) 0 yazar, native path kapalı.
    @objc func getSdkInfo(_ call: CAPPluginCall) {
        call.resolve(["engine": "audio-v1", "screenShare": false])
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), let url = call.getString("url") else {
            call.reject("token/url gerekli")
            return
        }
        Task {
            do {
                try await LiveKitCallManager.shared.connect(url: url, token: token)
                call.resolve(["connected": true])
            } catch {
                call.reject("bağlanılamadı: \(error.localizedDescription)")
            }
        }
    }

    @objc func setMicrophoneEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        Task {
            do {
                try await LiveKitCallManager.shared.setMic(enabled)
                call.resolve(["enabled": enabled])
            } catch {
                call.reject("Oda yok")
            }
        }
    }

    @objc func setSpeaker(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        do {
            try LiveKitCallManager.shared.setSpeaker(on)
            call.resolve(["on": on, "selected": on ? "Speaker" : "Earpiece"])
        } catch {
            call.reject("route hatası")
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        Task {
            await LiveKitCallManager.shared.disconnect()
            call.resolve()
        }
    }

    /// Yakınlık sensörü: on=true iken kulağa tutunca iOS ekranı otomatik söndürür (kilitlemeden,
    /// kulakla yanlış dokunuşları engeller), uzaklaştırınca açar. Sesli aramada ahize modunda açılır.
    /// ProximityManager: ana-thread + geri-oku/tekrar-dene (erken/aktif-değilken iOS reddeder) +
    /// didBecomeActive'de yeniden-enable + kulaktayken güvenli-disable.
    @objc func setProximity(_ call: CAPPluginCall) {
        ProximityManager.shared.set(call.getBool("on") ?? false)
        call.resolve()
    }

    // iOS ekran paylaşımı KAPSAM DIŞI (ReplayKit gerekir) — sözleşme korunur, no-op.
    @objc func startScreenShare(_ call: CAPPluginCall) {
        call.resolve(["active": false])
    }

    @objc func stopScreenShare(_ call: CAPPluginCall) {
        call.resolve()
    }
}

/// Yakınlık sensörü yöneticisi (iOS ekran söndürme). isProximityMonitoringEnabled=true TEK BAŞINA
/// ekranı söndürür (observer GEREKMEZ) ama: (1) ana thread'de set edilmeli, (2) app aktif/görünür
/// değilken iOS reddeder ve değeri sessizce false yapar → set edip GERİ OKU, reddedilirse tekrar dene,
/// (3) arka plandan dönüşte flag sıfırlanır → didBecomeActive'de yeniden enable et, (4) kulaktayken
/// (proximityState=true) disable edilirse state takılır → uzaklaşmayı bekle.
final class ProximityManager {
    static let shared = ProximityManager()
    private var wantEnabled = false
    private var deferDisable = false
    private var observersWired = false

    func set(_ on: Bool) {
        DispatchQueue.main.async {
            self.wantEnabled = on
            if on {
                self.wireObservers()
                self.applyEnable(retriesLeft: 6) // erken/reddedilirse ~2.4sn boyunca tekrar dene
            } else {
                let d = UIDevice.current
                if d.proximityState {
                    self.deferDisable = true // kulaktayken kapatma → state takılır (Signal-iOS #5530)
                } else {
                    d.isProximityMonitoringEnabled = false
                }
            }
        }
    }

    private func applyEnable(retriesLeft: Int) {
        guard wantEnabled else { return } // bu arada disable edildiyse vazgeç
        let d = UIDevice.current
        d.isProximityMonitoringEnabled = true
        if d.isProximityMonitoringEnabled { // GERİ OKU: kabul edildi mi
            NSLog("[Proximity] enabled OK")
            return
        }
        NSLog("[Proximity] enable REDDEDİLDİ (erken/aktif-değil/sensörsüz) — kalan deneme: \(retriesLeft)")
        if retriesLeft > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                self?.applyEnable(retriesLeft: retriesLeft - 1)
            }
        }
    }

    private func wireObservers() {
        guard !observersWired else { return }
        observersWired = true
        // Arka plandan dönüşte flag sıfırlanır → istenen ise yeniden enable et.
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self, self.wantEnabled else { return }
            UIDevice.current.isProximityMonitoringEnabled = true
        }
        // Kulaktan uzaklaşınca (far) bekletilen disable'ı uygula.
        NotificationCenter.default.addObserver(
            forName: UIDevice.proximityStateDidChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            if !UIDevice.current.proximityState && self.deferDisable {
                self.deferDisable = false
                UIDevice.current.isProximityMonitoringEnabled = false
            }
        }
    }
}
