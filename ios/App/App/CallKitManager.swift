import Foundation
import PushKit
import CallKit
import AVFoundation
import UIKit

/// iOS gelen-arama çekirdeği — Android'deki CallMessagingService + IncomingCallActivity
/// yapısının karşılığı.
///  - PushKit (PKPushRegistry): VoIP token üretir + arka planda/kapalıyken gelen VoIP
///    push'u alır. iOS 13+ KURALI: gelen her VoIP push senkron `reportNewIncomingCall`
///    çağırmalı, yoksa sistem uygulamayı öldürür ve VoIP teslimini durdurur.
///  - CallKit (CXProvider): kilit ekranında native "çalan arama" ekranı + kabul/reddet.
///  - Olaylar JS'e `CallKitVoipPlugin` köprüsüyle iletilir (WebView henüz hazır değilse
///    beklemede tutulur, plugin yüklenince flush edilir).
final class CallKitManager: NSObject {
    static let shared = CallKitManager()

    /// Capacitor plugin (JS köprüsü). Plugin load olunca set edilir.
    weak var plugin: CallKitVoipPlugin?

    private var voipRegistry: PKPushRegistry?
    private let provider: CXProvider

    private(set) var voipToken: String?

    // Aktif çağrı (aynı anda 1:1)
    private var currentUUID: UUID?
    private var currentData: [String: Any] = [:]

    // JS hazır olmadan olustu ise beklet, plugin yüklenince gönder
    private var pendingAnswered: [String: Any]?

    private override init() {
        let cfg = CXProviderConfiguration()
        cfg.supportsVideo = true
        // İptal push'unda "report-then-end" görünmez çağrı, asıl çağrı hâlâ aktifken de
        // report edilebilsin diye 2 (asıl kullanım yine 1:1). max=1 olsaydı iptalde 2. report
        // reddedilir, PushKit sözleşmesi ihlal olurdu (bkz. didReceiveIncomingPushWith call_cancel).
        cfg.maximumCallsPerCallGroup = 2
        cfg.maximumCallGroups = 1
        cfg.supportedHandleTypes = [.generic]
        provider = CXProvider(configuration: cfg)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    /// AppDelegate.didFinishLaunching'ten çağrılır — PushKit erken kurulmalı ki
    /// uygulamayı SOĞUK BAŞLATAN VoIP push da yakalansın.
    func setup() {
        guard voipRegistry == nil else { return }
        let reg = PKPushRegistry(queue: .main)
        reg.delegate = self
        reg.desiredPushTypes = [.voIP]
        voipRegistry = reg
    }

    /// Plugin (JS) yüklendiğinde bekleyen token/olayları gönder.
    func flushToJs() {
        if let t = voipToken { plugin?.emitVoipToken(t) }
        if let a = pendingAnswered { plugin?.emitAnswered(a); pendingAnswered = nil }
    }

    /// Çalan ekranı göster (VoIP push'tan veya test tetikleyiciden).
    func reportIncoming(callerName: String, hasVideo: Bool, conversationId: String, relatedUrl: String, callType: String, fromUserId: String) {
        let uuid = UUID()
        currentUUID = uuid
        currentData = [
            "conversationId": conversationId,
            "callType": callType,
            "relatedUrl": relatedUrl,
            "callerName": callerName,
            "fromUserId": fromUserId
        ]
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.localizedCallerName = callerName
        update.hasVideo = hasVideo
        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error { print("[callkit] reportNewIncomingCall hata: \(error.localizedDescription)") }
        }
    }

    /// Aktif çağrıyı sonlandır (arayan iptal etti / web tarafı bitti).
    func endCurrentCall(reason: CXCallEndedReason = .remoteEnded) {
        guard let uuid = currentUUID else { return }
        provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
        currentUUID = nil
        currentData = [:]
    }
}

// MARK: - PushKit
extension CallKitManager: PKPushRegistryDelegate {
    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        voipToken = token
        plugin?.emitVoipToken(token) // JS hazırsa hemen; değilse flushToJs sonra gönderir
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        voipToken = nil
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        let d = payload.dictionaryPayload
        let kind = (d["type"] as? String) ?? "call"

        if kind == "call_cancel" {
            // Arayan iptal etti. iOS 13+ PushKit SÖZLEŞMESİ: alınan HER VoIP push,
            // completion'dan önce SENKRON bir reportNewIncomingCall çağırmalı — yoksa
            // sistem uygulamayı ÖLDÜRÜR ve tekrarlarda TÜM VoIP teslimini kısıtlar.
            // Kaçınılmaz Recents kaydı boş "hayalet" olmasın diye asıl çağrının adını al.
            let name = (currentData["callerName"] as? String) ?? "Arama"
            // (1) Zaten çalan asıl çağrıyı bitir → çalma durur.
            if let existing = currentUUID {
                provider.reportCall(with: existing, endedAt: Date(), reason: .remoteEnded)
            }
            currentUUID = nil
            currentData = [:]
            // (2) Sözleşme gereği bu push için de görünmez bir çağrı report et; ANINDA bitir
            //     (max=2 → reddedilmez). completion() ANCAK bitirme TAMAMLANDIKTAN sonra
            //     çağrılır (bitirme bloğunun içinde) — yoksa suspend penceresinde takılı-çalan
            //     placeholder + boş "Kabul" riski olurdu.
            let cancelUUID = UUID()
            let placeholder = CXCallUpdate()
            placeholder.remoteHandle = CXHandle(type: .generic, value: name)
            provider.reportNewIncomingCall(with: cancelUUID, update: placeholder) { [weak self] _ in
                self?.provider.reportCall(with: cancelUUID, endedAt: Date(), reason: .remoteEnded)
                completion()
            }
            return
        }

        let callType = (d["callType"] as? String) ?? "audio"
        let callerName = (d["callerName"] as? String) ?? "Arayan"
        let conversationId = (d["conversationId"] as? String) ?? ""
        let relatedUrl = (d["relatedUrl"] as? String) ?? "/dashboard/sohbet"
        let fromUserId = (d["fromUserId"] as? String) ?? ""

        // ZORUNLU: senkron reportNewIncomingCall.
        reportIncoming(
            callerName: callerName,
            hasVideo: callType == "video",
            conversationId: conversationId,
            relatedUrl: relatedUrl,
            callType: callType,
            fromUserId: fromUserId
        )
        completion()
    }
}

// MARK: - CallKit
extension CallKitManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        currentUUID = nil
        currentData = [:]
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // Kabul → JS'e callAnswered (WebView deep-link'e gidip web arama odasına bağlanır).
        let data = currentData
        if plugin != nil {
            plugin?.emitAnswered(data)
        } else {
            pendingAnswered = data // WebView/plugin henüz hazır değil → yüklenince flush
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // Reddet / bitir → JS'e callEnded (Faz 2c: çalarken reddedilirse /api/call/reject).
        plugin?.emitEnded(currentData)
        currentUUID = nil
        currentData = [:]
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // WKWebView WebRTC sesi bu aktif session'da çalar (Faz 2c medya koordinasyonu).
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}
