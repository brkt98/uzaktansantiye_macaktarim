// ShareExtension/ShareViewController.swift — TARGET: YALNIZ ShareExtension (ana App'e EKLEME).
// Paylaşılan dosya/metinleri App Group container'ına yazar, ana uygulamayı
// uzaktansantiye://share ile açar. base64 dönüşümü ANA APP'te yapılır (bellek limiti).

import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private let appGroupId = "group.com.mesalegrup.uzaktansantiye"
    private let hostScheme = "uzaktansantiye"
    private let maxBytes = 25 * 1024 * 1024   // Android MAX_BYTES ile birebir (25MB)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.18, alpha: 1)

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

        let defaults = UserDefaults(suiteName: appGroupId)
        let id = (defaults?.integer(forKey: "shareCounter") ?? 0) + 1
        defaults?.set(id, forKey: "shareCounter")

        let dir = container.appendingPathComponent("shares/\(id)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        var fileEntries: [[String: Any]] = []
        var texts: [String] = []
        var fileIndex = 0
        let group = DispatchGroup()
        let lock = NSLock()

        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .flatMap { $0.attachments ?? [] } ?? []

        for provider in providers {
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
                    if let s = size, s > self.maxBytes {
                        entry["tooLarge"] = true
                    } else {
                        let dest = dir.appendingPathComponent(destName)
                        do {
                            try FileManager.default.copyItem(at: url, to: dest)
                            entry["tooLarge"] = false
                            entry["file"] = destName
                        } catch {
                            return
                        }
                    }
                    lock.lock(); fileEntries.append(entry); lock.unlock()
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
                    defer { group.leave() }
                    if let s = item as? String {
                        lock.lock(); texts.append(s); lock.unlock()
                    }
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
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
                defaults?.set(id, forKey: "pendingShareId")
            }
            self.openHostApp()
            self.finish()
        }
    }

<<<<<<< HEAD
    /// Ana uygulamayı aç. Eski perform("openURL:") hilesi iOS 18+'da Apple tarafından ZORLA
    /// false döndürülüyor (UIKit konsol: "Force returning false") → doğrulanmış güncel teknik
    /// (Bluesky üretim kodu + receive_sharing_intent iOS-18 dalı; iOS 15-26 doğrulamalı):
    /// responder zincirinde UIApplication'ı CAST ile bulup MODERN open(_:options:) çağırmak.
    /// Yine de başarısız olursa paylaşım container'da kalır; app açılınca yakalanır (graceful).
    private func openHostApp() {
        guard let url = URL(string: "\(hostScheme)://share") else { return }
        var responder: UIResponder? = self
        while let r = responder {
            if let application = r as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
=======
    /// Ana uygulamayı aç (responder zinciri openURL — extension'da standart teknik).
    /// Başarısız olursa paylaşım container'da kalır; app açılınca yakalanır.
    /// Ana uygulamayı aç. Eski perform("openURL:") hilesi iOS 18+'da Apple tarafından ZORLA
        /// false döndürülüyor (UIKit konsol: "Force returning false") → doğrulanmış güncel teknik
        /// (Bluesky üretim kodu + receive_sharing_intent iOS-18 dalı; iOS 15-26 doğrulamalı):
        /// responder zincirinde UIApplication'ı CAST ile bulup MODERN open(_:options:) çağırmak.
        /// Yine de başarısız olursa paylaşım container'da kalır; app açılınca yakalanır (graceful).
        private func openHostApp() {
            guard let url = URL(string: "\(hostScheme)://share") else { return }
            var responder: UIResponder? = self
            while let r = responder {
                if let application = r as? UIApplication {
                    application.open(url, options: [:], completionHandler: nil)
                    return
                }
                responder = r.next
>>>>>>> b248a87b92c04c3908eed2e673d5892754653835
            }
        }

    private func finish() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
