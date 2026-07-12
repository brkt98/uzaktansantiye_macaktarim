import Foundation
import Capacitor
import UIKit

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
        CAPPluginMethod(name: "setProximity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScreenShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScreenShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enterVideoMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exitVideoMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "switchCamera", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        LiveKitCallManager.shared.plugin = self
    }

    func emit(_ name: String, _ data: [String: Any]) {
        notifyListeners(name, data: data)
    }

    @objc func getSdkInfo(_ call: CAPPluginCall) {
        call.resolve(["engine": "audio-v1", "screenShare": true, "videoCall": true])
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), let url = call.getString("url") else {
            call.reject("token/url gerekli")
            return
        }
        let video = call.getBool("video") ?? false
        Task {
            do {
                try await LiveKitCallManager.shared.connect(url: url, token: token, video: video)
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

    @objc func setProximity(_ call: CAPPluginCall) {
        ProximityManager.shared.set(call.getBool("on") ?? false)
        call.resolve()
    }

    @objc func startScreenShare(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), let url = call.getString("url") else {
            call.reject("token/url gerekli")
            return
        }
        Task {
            do {
                try await LiveKitCallManager.shared.startScreenShare(url: url, token: token)
                call.resolve(["active": true])
            } catch {
                call.reject("Ekran paylaşımı başlatılamadı: \(error.localizedDescription)")
            }
        }
    }

    @objc func stopScreenShare(_ call: CAPPluginCall) {
        Task {
            await LiveKitCallManager.shared.stopScreenShare()
            call.resolve()
        }
    }

    // MARK: - Faz 6 video

    @objc func enterVideoMode(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController as? ViewController else {
                call.reject("ViewController (hole-punch) bulunamadı — Main.storyboard customClass=ViewController olmalı")
                return
            }
            let container = vc.enterVideoMode()
            LiveKitCallManager.shared.attachVideoContainer(container)
            call.resolve()
        }
    }

    @objc func exitVideoMode(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            (self.bridge?.viewController as? ViewController)?.exitVideoMode()
            call.resolve()
        }
    }

    @objc func setCamera(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? true
        Task {
            do {
                try await LiveKitCallManager.shared.setCameraEnabled(enabled)
                call.resolve(["enabled": enabled])
            } catch {
                call.reject("kamera hatası: \(error.localizedDescription)")
            }
        }
    }

    @objc func switchCamera(_ call: CAPPluginCall) {
        Task {
            do {
                try await LiveKitCallManager.shared.switchCamera()
                call.resolve()
            } catch {
                call.reject("kamera çevrilemedi: \(error.localizedDescription)")
            }
        }
    }
}

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
                self.applyEnable(retriesLeft: 6)
            } else {
                let d = UIDevice.current
                if d.proximityState {
                    self.deferDisable = true
                } else {
                    d.isProximityMonitoringEnabled = false
                }
            }
        }
    }

    private func applyEnable(retriesLeft: Int) {
        guard wantEnabled else { return }
        let d = UIDevice.current
        d.isProximityMonitoringEnabled = true
        if d.isProximityMonitoringEnabled {
            NSLog("[Proximity] enabled OK")
            return
        }
        if retriesLeft > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                self?.applyEnable(retriesLeft: retriesLeft - 1)
            }
        }
    }

    private func wireObservers() {
        guard !observersWired else { return }
        observersWired = true
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self, self.wantEnabled else { return }
            UIDevice.current.isProximityMonitoringEnabled = true
        }
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
