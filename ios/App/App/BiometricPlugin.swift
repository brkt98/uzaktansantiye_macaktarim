import Foundation
import Capacitor
import LocalAuthentication

/// Biyometrik kimlik doğrulama — Android `BiometricPlugin.java`'nın iOS eşi (Face ID / Touch ID).
/// JS tarafı: src/lib/biometric.ts (`registerPlugin("Biometric")`).
///
/// Sözleşme (Android ile BİREBİR):
/// - isAvailable() → { available, code }; code Android BiometricManager kodlarına EŞLENİR:
///   0=OK, 1=HW_UNAVAILABLE (lockout), 11=NONE_ENROLLED, 12=NO_HARDWARE
///   (JS biometricStatus bu kodlardan mesaj üretir — biometric.ts).
/// - authenticate({title,subtitle}) → başarıda resolve({success:true}); iptal DAHİL her
///   hatada reject("<mesaj> [kod]", kodString) (Android reject deseninin aynısı).
/// - Android BIOMETRIC_WEAK + DEVICE_CREDENTIAL'sız çalışır → iOS'ta
///   .deviceOwnerAuthenticationWithBiometrics (passcode fallback'li .deviceOwnerAuthentication
///   BİLEREK KULLANILMAZ — Android davranışıyla birebir kalsın).
///
/// ⚠️ LOCAL app-target plugin → capacitor.config.json packageClassList'e "BiometricPlugin"
///    EKLENMELİ (her `npx cap sync ios` sonrası korunmalı). Info.plist: NSFaceIDUsageDescription ŞART
///    (yoksa Face ID'li cihazda evaluatePolicy çöker).
@objc(BiometricPlugin)
public class BiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricPlugin"
    public let jsName = "Biometric"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var err: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        var code = 0
        if !ok {
            switch err.flatMap({ LAError.Code(rawValue: $0.code) }) {
            case .biometryNotEnrolled: code = 11   // kayıtlı yüz/parmak izi yok
            case .biometryNotAvailable: code = 12  // donanım yok / kullanıcı Face ID iznini reddetti
            case .biometryLockout: code = 1        // çok fazla başarısız deneme → geçici kilit
            case .passcodeNotSet: code = 11        // cihaz şifresi yok → biyometrik kapalı (enroll gerekli)
            default: code = -1                     // JS tarafı "unknown" olarak yorumlar
            }
        }
        call.resolve(["available": ok, "code": code])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Kimlik doğrulama"
        let subtitle = call.getString("subtitle") ?? "Face ID / Touch ID ile doğrulayın"
        let ctx = LAContext()
        ctx.localizedCancelTitle = "İptal"
        let reason = subtitle.isEmpty ? title : subtitle // evaluatePolicy boş reason kabul etmez
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            DispatchQueue.main.async {
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
