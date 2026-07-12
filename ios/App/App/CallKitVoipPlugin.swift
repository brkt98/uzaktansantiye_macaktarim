import Foundation
import Capacitor

/// CallKit/PushKit native çekirdeğini (CallKitManager) JS'e bağlayan Capacitor plugin.
/// JS tarafı: src/lib/callKitVoip.ts (`registerPlugin("CallKitVoip")`).
///
/// Olaylar (notifyListeners):
///  - "voipToken"    { token }                                  → JS token'ı /api/push/register'a (platform ios-voip) yollar
///  - "callAnswered" { conversationId, callType, relatedUrl }   → JS arama odasına deep-link atar
///  - "callEnded"    { conversationId }                          → JS reddet/temizlik yapar
///
/// Metotlar:
///  - getVoipToken()  → mevcut VoIP token (event kaçtıysa)
///  - endCall()       → web arama bitince CallKit UI'ını kapat
///  - testRing(...)   → GEÇİCİ: gerçek VoIP push olmadan çalan ekranı test et (Faz 2a)
@objc(CallKitVoipPlugin)
public class CallKitVoipPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallKitVoipPlugin"
    public let jsName = "CallKitVoip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getVoipToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testRing", returnType: CAPPluginReturnPromise),
        // Faz 2c ses yönlendirme (giden app-açık arama + hoparlör toggle)
        CAPPluginMethod(name: "startCallAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCallSpeaker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopCallAudio", returnType: CAPPluginReturnPromise),
        // GİDEN aramayı CallKit'e kaydet (yeşil gösterge + native proximity)
        CAPPluginMethod(name: "startOutgoingCall", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        CallKitManager.shared.plugin = self
        CallKitManager.shared.flushToJs() // JS hazır → bekleyen token/olayları al
    }

    @objc func getVoipToken(_ call: CAPPluginCall) {
        call.resolve(["token": CallKitManager.shared.voipToken ?? ""])
    }

    @objc func endCall(_ call: CAPPluginCall) {
        CallKitManager.shared.endCurrentCall(reason: .remoteEnded)
        call.resolve()
    }

    @objc func testRing(_ call: CAPPluginCall) {
        let name = call.getString("callerName") ?? "Test Arayan"
        let video = call.getBool("video") ?? false
        let convId = call.getString("conversationId") ?? "test"
        let relatedUrl = call.getString("relatedUrl") ?? "/dashboard/sohbet"
        CallKitManager.shared.reportIncoming(
            callerName: name,
            hasVideo: video,
            conversationId: convId,
            relatedUrl: relatedUrl,
            callType: video ? "video" : "audio",
            fromUserId: call.getString("fromUserId") ?? ""
        )
        call.resolve()
    }

    /// GİDEN native sesli aramayı CallKit'e kaydet (yeşil gösterge + native proximity).
    /// NativeAudioCallRoom (iOS caller) mount'ta nativeConnect yerine bunu çağırır; bağlanma
    /// native tarafta didActivate'e ertelenir.
    @objc func startOutgoingCall(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), let url = call.getString("url") else {
            call.reject("token/url gerekli")
            return
        }
        let name = call.getString("calleeName") ?? "Arama"
        DispatchQueue.main.async {
            // Meşgulse reject → web eski nativeConnect yoluna düşer (sessiz kilitlenme yok).
            guard !CallKitManager.shared.hasActiveCall else {
                call.reject("meşgul: aktif çağrı var")
                return
            }
            CallKitManager.shared.startOutgoingCall(calleeName: name, token: token, url: url)
            call.resolve()
        }
    }

    // MARK: - Ses yönlendirme (Faz 2c) — WKWebView WebRTC + AVAudioSession
    /// GİDEN app-açık arama: web oda CONNECTED olunca çağrılır (audioRoute.ts callStart).
    @objc func startCallAudio(_ call: CAPPluginCall) {
        let speaker = call.getBool("speaker") ?? false
        DispatchQueue.main.async { CallKitManager.shared.beginAppOpenCallAudio(speaker: speaker) }
        call.resolve()
    }

    /// Hoparlör ↔ ahize butonu (web setSinkId desteklemez → native override).
    @objc func setCallSpeaker(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async { CallKitManager.shared.setCallSpeaker(on) }
        call.resolve()
    }

    /// Arama bitti / oda disconnect (audioRoute.ts callEnd).
    @objc func stopCallAudio(_ call: CAPPluginCall) {
        DispatchQueue.main.async { CallKitManager.shared.endCallAudio() }
        call.resolve()
    }

    // MARK: - Manager → JS köprüsü
    func emitVoipToken(_ token: String) {
        notifyListeners("voipToken", data: ["token": token])
    }
    func emitAnswered(_ data: [String: Any]) {
        notifyListeners("callAnswered", data: data)
    }
    func emitEnded(_ data: [String: Any]) {
        notifyListeners("callEnded", data: data)
    }
}
