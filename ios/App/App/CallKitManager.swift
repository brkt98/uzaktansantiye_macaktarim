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

    // --- Arama sesi yaşam döngüsü (WKWebView WebRTC + CallKit ortak) ---
    private var wantSpeaker = false                       // web hoparlör toggle durumu
    private var callAudioActive = false                   // arama sesi aktif mi (override guard)
    private var routeObserver: NSObjectProtocol?          // WebKit rota ezimini geri alma
    private var answerAwaitingActivation: [String: Any]?  // cevaplandı, didActivate bekleniyor
    private var callKitAudioIsNative = false              // aktif çağrı sesli-native (LiveKit SDK) mi
    private var currentCallAnswered = false               // aktif çağrı CEVAPLANDI mı (call_cancel spurious-ring guard)

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
        currentCallAnswered = false
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
            // Arayan iptal etti. AMAÇ: ASLA yeni bir "çalma" yaratma. (Arama zaten bittikten/
            // reddedildikten sonra gelen geç call_cancel'lar, sözleşme placeholder'ı yüzünden
            // telefonu 1-2 sn kendiliğinden çaldırıyordu.) call_cancel HER ZAMAN canlı app'e
            // ulaşır (önce 'call' push'u uyandırdı + CallKit çalarken app'i canlı tutar) →
            // ön planda placeholder GEREKMEZ; watchdog yalnız arka-plan uyandırmasında geçerli.
            //
            // (a) Zaten CEVAPLANMIŞ çağrı → iptal spurious (arayan bağlıyken ayrıldı / kabul
            //     yayını). Hiçbir şey yapma; LiveKit/web akışı aramayı zaten kapatıyor.
            if currentCallAnswered {
                completion()
                return
            }
            // (b) Henüz CEVAPLANMAMIŞ ÇALAN çağrı → GERÇEK iptal → çalmayı durdur (placeholder YOK).
            if let existing = currentUUID {
                provider.reportCall(with: existing, endedAt: Date(), reason: .remoteEnded)
                currentUUID = nil
                currentData = [:]
                completion()
                return
            }
            // (c) Aktif çağrı YOK. App ÖN PLANDA → arama bitmiş, iptal geç kalmış → görünmez
            //     placeholder GÖSTERME (kendiliğinden çalma olmasın). App ARKA PLANDA/uykuda ise
            //     ('call' push kaybolmuş olabilir) VoIP watchdog için görünmez placeholder ŞART.
            if UIApplication.shared.applicationState == .active {
                completion()
                return
            }
            let cancelUUID = UUID()
            let placeholder = CXCallUpdate()
            placeholder.remoteHandle = CXHandle(type: .generic, value: "Arama")
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
        currentCallAnswered = false
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let video = (currentData["callType"] as? String) == "video"
        // 1) Kategoriyi CEVAPTAN ÖNCE hazırla. setActive YOK — aktivasyonu CallKit yapar.
        //    (Semptom 2: CallKit'in doğru yüksek-öncelikli "telefon" oturumunu seçebilmesi için.)
        configureCallAudioSession(video: video)
        callAudioActive = true
        currentCallAnswered = true                // call_cancel spurious-ring guard'ı için
        wantSpeaker = video                       // video→hoparlör, sesli→ahize (earpiece)
        // 2) Navigasyon/oda bağlanmasını didActivate'e ERTELE — getUserMedia session HOT olunca
        //    çalışsın (Semptom 2: kilitli ekranda AUIOClient_StartIO failed sessizliğini önler).
        answerAwaitingActivation = currentData
        action.fulfill()
        // 3) Güvenlik ağı: didActivate beklenmedik şekilde gelmezse 1.5 sn sonra yine de ilerle.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.flushAnswerIfPending()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // Reddet / bitir. currentUUID'yi ÖNCE temizle → LiveKit disconnect içindeki
        // endCurrentCall re-entrancy yapmasın (aşağıda). Sonra callType'a göre kapat.
        let data = currentData
        let wasNativeAudio = callKitAudioIsNative
        currentUUID = nil
        currentData = [:]
        currentCallAnswered = false
        if wasNativeAudio {
            // Native sesli: LiveKit odasını kapat (motoru didDeactivate kapatacak).
            Task { await LiveKitCallManager.shared.disconnect() }
        } else {
            endCallAudio() // görüntülü/WKWebView route temizliği
        }
        plugin?.emitEnded(data)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // Session artık CallKit tarafından AKTİF (kilit ekranı dahil) ve yüksek öncelikli.
        callAudioActive = true
        // SESLİ arama → native LiveKit motoru (kilitli-ses + earpiece'in ASIL çözümü:
        // CallKit didActivate ile AudioManager.setEngineAvailability(.default) el sıkışması).
        // GÖRÜNTÜLÜ → mevcut WKWebView route yönetimi (değişmedi).
        if (currentData["callType"] as? String) == "audio" {
            callKitAudioIsNative = true
            LiveKitCallManager.shared.callKitDidActivate()  // motoru AÇ
            flushAnswerIfPending()                          // → NativeAudioCallRoom → nativeConnect
            print("[callkit] didActivate — LiveKit ses motoru")
            return
        }
        callKitAudioIsNative = false
        applyDesiredRoute()          // görüntülü: WKWebView route (audio→ahize/video→hoparlör)
        startRouteObserver()         // WebKit getUserMedia rotayı ezerse geri al
        flushAnswerIfPending()       // ARTIK güvenli: web oda bağlansın (getUserMedia)
        print("[callkit] didActivate — WKWebView ses")
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        if callKitAudioIsNative {
            callKitAudioIsNative = false
            LiveKitCallManager.shared.callKitDidDeactivate() // LiveKit motorunu KAPAT
        } else {
            endCallAudio()
        }
        print("[callkit] didDeactivate")
    }

    /// Cevaplanan çağrının JS'e iletimini yap (didActivate sonrası veya güvenlik-ağı ile).
    fileprivate func flushAnswerIfPending() {
        guard let data = answerAwaitingActivation else { return }
        answerAwaitingActivation = nil
        if plugin != nil { plugin?.emitAnswered(data) } else { pendingAnswered = data }
    }
}

// MARK: - Arama sesi (AVAudioSession kategori + rota) — WKWebView WebRTC ile ortak
//
// MİMARİ: iOS'ta arama sesi %100 WKWebView WebRTC (web LiveKit); native RTCAudioSession YOK.
// Bu yüzden APP ASLA setActive ÇAĞIRMAZ — aktivasyonu GELEN yolda CallKit, GİDEN (app-açık)
// yolda WebKit yapar (getUserMedia). App yalnız (a) doğru kategori/mode, (b) çıkış rotasını
// (earpiece/hoparlör) yönetir; WebKit rotayı ezerse routeChange gözlemiyle yeniden dayatır.
extension CallKitManager {
    /// SADECE kategori/mode. .voiceChat = varsayılan çıkış built-in receiver (ahize),
    /// .videoChat = hoparlör. DİKKAT: .defaultToSpeaker EKLENMEZ (sesi hoparlöre zorlar).
    fileprivate func configureCallAudioSession(video: Bool) {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(.playAndRecord,
                              mode: video ? .videoChat : .voiceChat,
                              options: [.allowBluetooth, .allowBluetoothA2DP])
        } catch {
            print("[callaudio] setCategory hata: \(error.localizedDescription)")
        }
    }

    /// İstenen çıkışı uygula. overrideOutputAudioPort GEÇİCİ → routeChange'te tekrar çağrılır.
    fileprivate func applyDesiredRoute() {
        guard callAudioActive else { return }   // session aktif değilken çağrı sessizce başarısız olur
        do {
            try AVAudioSession.sharedInstance().overrideOutputAudioPort(wantSpeaker ? .speaker : .none)
        } catch {
            print("[callaudio] override hata: \(error.localizedDescription)")
        }
    }

    /// WebKit getUserMedia rotayı hoparlöre kaçırırsa istenen çıkışı YENİDEN dayat.
    fileprivate func startRouteObserver() {
        guard routeObserver == nil else { return }
        routeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self, self.callAudioActive else { return }
            let outs = AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portType }
            let onSpeaker = outs.contains(.builtInSpeaker)
            if onSpeaker != self.wantSpeaker { self.applyDesiredRoute() }
        }
    }

    fileprivate func stopRouteObserver() {
        if let o = routeObserver { NotificationCenter.default.removeObserver(o); routeObserver = nil }
    }

    /// GİDEN (app-açık) arama: JS callStart → burada. CallKit YOK; aktivasyonu WebKit yapar.
    /// setActive ÇAĞIRMAYIZ → 561015905 (AUIOClient_StartIO) riski yok.
    func beginAppOpenCallAudio(speaker: Bool) {
        callAudioActive = true
        wantSpeaker = speaker
        configureCallAudioSession(video: speaker) // sesli→ahize, görüntülü→hoparlör
        applyDesiredRoute()                        // WebKit henüz aktive etmediyse observer tekrar uygular
        startRouteObserver()
    }

    /// Hoparlör/ahize butonu (web setSinkId desteklemez → tek yol native override).
    func setCallSpeaker(_ on: Bool) {
        wantSpeaker = on
        applyDesiredRoute()
    }

    /// Arama bitti (web oda disconnect / CallKit end). Idempotent.
    func endCallAudio() {
        stopRouteObserver()
        if callAudioActive {
            try? AVAudioSession.sharedInstance().overrideOutputAudioPort(.none)
        }
        callAudioActive = false
        wantSpeaker = false
    }
}
