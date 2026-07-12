// ShareExtension/ShareViewController.swift — TARGET: YALNIZ ShareExtension (ana App'e EKLEME).
// iOS paylaşım hedefi giriş noktası — Android ShareTargetPlugin.java'nın "intent yakalama" kısmının eşi.
// Paylaşılan dosya/metinleri App Group container'ına (shares/<id>/ + manifest.json) yazar, sonra
// ana uygulamayı `uzaktansantiye://share` ile açar. base64 dönüşümü ANA APP'te (ShareTargetPlugin)
// yapılır — extension yalnız kopyalar (extension bellek limiti ~120MB; büyük dosyada base64 patlardı).
//
// Extension WKWebView/ağ ÇALIŞTIRMAZ; sohbet seçimi ana app'teki /dashboard/sohbet/paylas'ta yapılır.
// openURL başarısız olsa bile paylaşım container'da kalır → kullanıcı app'i açınca plugin yakalar
// (didBecomeActive) — yani graceful degrade.

import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private let appGroupId = "group.com.mesalegrup.uzaktansantiye"
    private let hostScheme = "uzaktansantiye" // uzaktansantiye://share
    private let maxBytes = 25 * 1024 * 1024   // Android MAX_BYTES ile birebir (25MB)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.18, alpha: 1) // #1a1a2e

        let label = UILabel()
        label.text = "Aktarılıyor…"
        label.textColor = .white
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        process()
    }

    private func process() {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else { return finish() }

        // Yeni benzersiz id (extension + app AYRI süreç → sayaç paylaşımlı UserDefaults'ta).
        let defaults = UserDefaults(suiteName: appGroupId)
        let id = (defaults?.integer(forKey: "shareCounter") ?? 0) + 1
        defaults?.set(id, forKey: "shareCounter")

        let dir = container.appendingPathComponent("shares/\(id)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        var fileEntries: [[String: Any]] = []
        var texts: [String] = []
        var fileIndex = 0
        let group = DispatchGroup()
        let lock = NSLock() // completion handler'lar farklı thread'lerde → dizileri koru

        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .flatMap { $0.attachments ?? [] } ?? []

        for provider in providers {
            // 1) DOSYA (görsel/video/pdf/genel data) — file-representation ile temp URL alıp kopyala.
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier)
                || provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
                || provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier)
                || provider.hasItemConformingToTypeIdentifier(UTType.data.identifier) {

                let typeId = [UTType.image, UTType.movie, UTType.fileURL, UTType.data]
                    .first { provider.hasItemConformingToTypeIdentifier($0.identifier) }?
                    .identifier ?? UTType.data.identifier

                group.enter()
                provider.loadFileRepresentation(forTypeIdentifier: typeId) { url, _ in
                    defer { group.leave() }
                    guard let url = url else { return }
                    let srcName = url.lastPathComponent
                    let ext = url.pathExtension
                    let size = (try? FileManager.default
                        .attributesOfItem(atPath: url.path)[.size] as? Int) ?? nil
                    let mime = UTType(filenameExtension: ext)?.preferredMIMEType
                        ?? "application/octet-stream"

                    lock.lock()
                    fileIndex += 1
                    let destName = "\(fileIndex)_\(srcName)"
                    lock.unlock()

                    var entry: [String: Any] = [
                        "name": srcName,
                        "mimeType": mime,
                        "size": size ?? -1,
                    ]
                    // 25MB eşiği: büyük dosyayı KOPYALAMA (Android tooLarge davranışı).
                    if let s = size, s > self.maxBytes {
                        entry["tooLarge"] = true
                    } else {
                        let dest = dir.appendingPathComponent(destName)
                        do {
                            try FileManager.default.copyItem(at: url, to: dest)
                            entry["tooLarge"] = false
                            entry["file"] = destName
                        } catch {
                            return // kopyalanamadı → düş
                        }
                    }
                    lock.lock(); fileEntries.append(entry); lock.unlock()
                }
            }
            // 2) METİN
            else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                    defer { group.leave() }
                    if let s = item as? String {
                        lock.lock(); texts.append(s); lock.unlock()
                    }
                }
            }
            // 3) URL (web sayfası paylaşımı) → metin olarak
            else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier) { item, _ in
                    defer { group.leave() }
                    if let u = item as? URL {
                        lock.lock(); texts.append(u.absoluteString); lock.unlock()
                    }
                }
            }
        }

        group.notify(queue: .main) {
            if fileEntries.isEmpty && texts.isEmpty {
                try? FileManager.default.removeItem(at: dir)
                return self.finish()
            }
            let manifest: [String: Any] = ["id": id, "files": fileEntries, "texts": texts]
            if let data = try? JSONSerialization.data(withJSONObject: manifest) {
                try? data.write(to: dir.appendingPathComponent("manifest.json"))
                defaults?.set(id, forKey: "pendingShareId") // ana app'e "tüketilecek paylaşım var"
            }
            self.openHostApp()
            self.finish()
        }
    }

    /// Ana uygulamayı aç (responder zinciri üzerinden openURL — extension'da standart teknik).
    /// Başarısız olursa paylaşım container'da kalır; app bir sonraki açılışta yakalar.
    private func openHostApp() {
        guard let url = URL(string: "\(hostScheme)://share") else { return }
        let selector = sel_registerName("openURL:")
        var responder: UIResponder? = self
        while let r = responder {
            if r.responds(to: selector), r !== self {
                _ = r.perform(selector, with: url)
                return
            }
            responder = r.next
        }
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
