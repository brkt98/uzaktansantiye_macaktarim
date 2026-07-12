import Foundation
import Capacitor
import LocalAuthentication

/// Biyometrik kimlik doğrulama — Android `BiometricPlugin.java`'nın iOS eşi (Face ID / Touch ID).
/// JS tarafı: src/lib/biometric.ts (`registerPlugin("Biometric")`).
///
/// Desen, Capacitor 8 referans plugin'inden (aparajita/capacitor-biometric-auth) birebir doğrulandı:
/// LAContext LOKAL, evaluatePolicy bulunduğu thread'den DOĞRUDAN çağrılır (main-dispatch gerekmez),
/// reply'ın HER dalı main'de resolve/reject eder (sessiz yol YOK).
/// KRİTİK (aparajita kaynak yorumu): Face ID cihazında Info.plist'te NSFaceIDUsageDescription yoksa
/// evaluatePolicy ÇÖKER/sessizce asılı kalır → runtime'da Bundle.main'den kontrol edip GÖRÜNÜR hata veririz.
@objc(BiometricPlugin)
public class BiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricPlugin"
    public let jsName = "Biometric"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]

    /// Derlenen pakette NSFaceIDUsageDescription var mı? (Dosyaya yazmak yetmez —
    /// yanlış target/eski build'de pakete girmemiş olabilir; tek güvenilir kontrol Bundle.main.)
    private func faceIdKeyPresent() -> Bool {
        (Bundle.main.infoDictionary?["NSFaceIDUsageDescription"] as? String) != nil
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var err: NSError?
        var ok = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        var code = 0
        if ok, ctx.biometryType == .faceID, !faceIdKeyPresent() {
            // Face ID + eksik plist anahtarı = authenticate patlar → kullanılamaz say (JS: no-hardware).
            ok = false
            code = 12
            NSLog("[Biometric] NSFaceIDUsageDescription PAKETTE YOK — Info.plist build'e girmemiş!")
        } else if !ok {
            switch err.flatMap({ LAError.Code(rawValue: $0.code) }) {
            case .biometryNotEnrolled: code = 11
            case .biometryNotAvailable: code = 12
            case .biometryLockout: code = 1
            case .passcodeNotSet: code = 11
            default: code = -1
            }
            NSLog("[Biometric] isAvailable=false laError=\(err?.code ?? 0)")
        }
        call.resolve(["available": ok, "code": code])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Kimlik doğrulama"
        let subtitle = call.getString("subtitle") ?? "Face ID / Touch ID ile doğrulayın"
        let reason = subtitle.isEmpty ? (title.isEmpty ? "Kimlik doğrulama" : title) : subtitle

        // 1) Kullanılabilirlik guard'ı — başarısızlık MUTLAKA reject olarak JS'e gider (sessiz yol yok).
        let checkCtx = LAContext()
        var canErr: NSError?
        guard checkCtx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &canErr) else {
            let code = canErr?.code ?? -1
            NSLog("[Biometric] canEvaluatePolicy=false laError=\(code)")
            call.reject("Biyometri kullanılamıyor: \(canErr?.localizedDescription ?? "?") [\(code)]", String(code))
            return
        }
        // 2) Face ID + eksik NSFaceIDUsageDescription = evaluatePolicy çöker/asılı kalır → görünür hata.
        if checkCtx.biometryType == .faceID, !faceIdKeyPresent() {
            NSLog("[Biometric] NSFaceIDUsageDescription PAKETTE YOK — authenticate reddedildi")
            call.reject("NSFaceIDUsageDescription derlenen pakette yok (Info.plist build'e girmemiş)", "-6")
            return
        }
        // 3) Değerlendirme: TAZE context (canEvaluate context'ini YENİDEN KULLANMA — bilinen iOS tuzağı:
        //    diyalog açılmayabilir / önceki success'i tekrarlar). Fallback butonu GİZLİ (""):
        //    Android BIOMETRIC_WEAK + DEVICE_CREDENTIAL'sız davranışın birebiri.
        let ctx = LAContext()
        ctx.localizedCancelTitle = "İptal"
        ctx.localizedFallbackTitle = ""
        ctx.touchIDAuthenticationAllowableReuseDuration = 0
        NSLog("[Biometric] evaluatePolicy başlıyor (type=\(ctx.biometryType.rawValue))")
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            DispatchQueue.main.async {
                NSLog("[Biometric] sonuç: success=\(success) laError=\((error as NSError?)?.code ?? 0) \(error?.localizedDescription ?? "-")")
                if success {
                    call.resolve(["success": true])
                    return
                }
                let code = (error as? LAError)?.code.rawValue ?? -1
                let msg = error?.localizedDescription ?? "Doğrulama başarısız"
                call.reject("\(msg) [\(code)]", String(code))
            }
        }
    }
}
