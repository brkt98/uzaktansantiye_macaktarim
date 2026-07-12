import Foundation
import Capacitor
import UIKit

/// Paylaşım hedefi — Android `ShareTargetPlugin.java`'nın iOS eşi.
/// JS tarafı: src/lib/shareTarget.ts (`registerPlugin("ShareTarget")`).
///
/// MİMARİ (Android'den farkı): iOS'ta paylaşım AYRI süreçte (Share Extension) yakalanır;
/// extension dosyaları App Group container'ına (`shares/<id>/`) + bir `manifest.json`'a yazar
/// ve ana uygulamayı `uzaktansantiye://share` ile açar. BU plugin (ana app) container'ı
/// okuyup Android ile BİREBİR aynı ShareData'yı üretir: dosyaları base64'e çevirir (25MB
/// eşiği extension'da uygulanır → tooLarge dosya kopyalanmaz), pending'e yazar + shareReceived yayar.
///
/// Sözleşme (Android ile BİREBİR):
/// - getPendingShare() → {id,files:[{name,mimeType,size,base64?,tooLarge}],texts:[]}; yoksa {id:0,...}
/// - clearPendingShare() → pending'i temizler + container'daki paketi siler + pendingShareId=0
/// - "shareReceived" event → aynı ShareData (warm-start: app açıkken gelen paylaşım)
///
/// ⚠️ LOCAL app-target plugin → capacitor.config.json packageClassList'e "ShareTargetPlugin"
///    EKLENMELİ (her `npx cap sync ios` sonrası korunmalı). App Group entitlement (ana app +
///    ShareExtension iki target) ŞART.
@objc(ShareTargetPlugin)
public class ShareTargetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareTargetPlugin"
    public let jsName = "ShareTarget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingShare", returnType: CAPPluginReturnPromise),
    ]

    // Extension ile PAYLAŞILAN sabitler — ShareViewController ile birebir aynı olmalı.
    private let appGroupId = "group.com.mesalegrup.uzaktansantiye"
    private let keyPendingId = "pendingShareId" // 0 = tüketilecek paylaşım yok

    private var pending: [String: Any]?
    private var lastSeenId = 0 // aynı paylaşımı didBecomeActive'de tekrar yaymayı önler

    public override func load() {
        // Uygulama öne her geldiğinde (warm-start: app açıkken paylaşım gelip bizi açtı) container'ı tara.
        NotificationCenter.default.addObserver(
            self, selector: #selector(onBecomeActive),
            name: UIApplication.didBecomeActiveNotification, object: nil
        )
        readPendingFromContainer() // cold-start: extension bizi bir paylaşımla açtıysa
    }

    @objc private func onBecomeActive() {
        readPendingFromContainer()
    }

    /// App Group container'ındaki bekleyen paylaşımı (varsa) okuyup ShareData'ya çevirir.
    /// base64 dönüşümü BURADA yapılır (extension bellek limitine takılmasın — yalnız kopyalar).
    private func readPendingFromContainer() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        let id = defaults.integer(forKey: keyPendingId)
        guard id > 0, id != lastSeenId else { return } // yeni paylaşım yok
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else { return }
        let dir = container.appendingPathComponent("shares/\(id)", isDirectory: true)
        let manifestURL = dir.appendingPathComponent("manifest.json")
        guard let raw = try? Data(contentsOf: manifestURL),
              let obj = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] else { return }
        lastSeenId = id

        var files: [[String: Any]] = []
        for f in (obj["files"] as? [[String: Any]]) ?? [] {
            var entry: [String: Any] = [
                "name": f["name"] as? String ?? "dosya",
                "mimeType": f["mimeType"] as? String ?? "application/octet-stream",
                "size": f["size"] as? Int ?? -1,
            ]
            if (f["tooLarge"] as? Bool) == true {
                entry["tooLarge"] = true
            } else if let fname = f["file"] as? String,
                      let bytes = try? Data(contentsOf: dir.appendingPathComponent(fname)) {
                entry["base64"] = bytes.base64EncodedString() // Android Base64.NO_WRAP eşi
                entry["tooLarge"] = false
            } else {
                continue // okunamayan dosya → sessizce düş (Android parity)
            }
            files.append(entry)
        }
        let texts = (obj["texts"] as? [String]) ?? []
        if files.isEmpty && texts.isEmpty { return }

        let share: [String: Any] = ["id": id, "files": files, "texts": texts]
        pending = share
        notifyListeners("shareReceived", data: share) // warm-start dinleyicisi (NativeBridge)
    }

    @objc func getPendingShare(_ call: CAPPluginCall) {
        // getPendingShare çağrılmadan hemen önce paylaşım gelmiş olabilir → bir kez daha tara.
        readPendingFromContainer()
        if let p = pending {
            call.resolve(p)
        } else {
            call.resolve(["id": 0, "files": [], "texts": []])
        }
    }

    @objc func clearPendingShare(_ call: CAPPluginCall) {
        pending = nil
        if let defaults = UserDefaults(suiteName: appGroupId) {
            let id = defaults.integer(forKey: keyPendingId)
            defaults.set(0, forKey: keyPendingId) // tüketildi → cold-start'ta tekrar açılmasın
            if id > 0,
               let container = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: appGroupId) {
                try? FileManager.default.removeItem(
                    at: container.appendingPathComponent("shares/\(id)", isDirectory: true)
                )
            }
        }
        call.resolve()
    }
}
