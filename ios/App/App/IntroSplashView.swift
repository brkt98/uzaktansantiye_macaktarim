import UIKit

/// Açılış intro animasyonu: puzzle parçaları halinde kayarak birleşen logo + harf harf
/// gelen "Meşale Grup". Cold-launch'ta AppDelegate gösterir; ~2.6sn sonra kendini söker.
/// LaunchScreen + Capacitor Splash artık DÜZ LACİVERT — logo yalnız burada, kodla,
/// piksel-hassas ORTADA çizilir (statik görseldeki "ortada değil" sorunu kökten biter).
/// Asset: IntroLogo (Assets.xcassets — sıkı kırpılmış alev + 32px pay, lacivert zemin).
final class IntroSplashView: UIView {

    /// AppDelegate.applicationDidBecomeActive'den (bir kez) çağrılır.
    static func show(in window: UIWindow) {
        let v = IntroSplashView(frame: window.bounds)
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(v)
        v.run()
    }

    private static let navy = UIColor(red: 26/255.0, green: 26/255.0, blue: 46/255.0, alpha: 1) // #1a1a2e

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = IntroSplashView.navy
        isUserInteractionEnabled = true // animasyon sürerken alttaki WebView'e dokunuş geçmesin
    }

    required init?(coder: NSCoder) { return nil }

    private func run() {
        guard let logo = UIImage(named: "IntroLogo"), let cg = logo.cgImage else {
            // Görsel eksikse (asset unutulduysa) kısa lacivert geçiş — asla takılı kalma.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.dismiss() }
            return
        }
        let W = bounds.width, H = bounds.height

        // Logo konteyneri: yükseklik ekranın ~%26'sı (en fazla 240pt), oran görselden.
        let aspect = CGFloat(cg.width) / CGFloat(cg.height)
        let logoH = min(H * 0.26, 240)
        let logoW = logoH * aspect
        let logoFrame = CGRect(x: (W - logoW) / 2, y: H * 0.5 - logoH * 0.72, width: logoW, height: logoH)

        // 3 sütun × 4 satır puzzle parçası (dikey logoya uygun ızgara)
        let cols = 3, rows = 4
        let pw = CGFloat(cg.width) / CGFloat(cols)
        let ph = CGFloat(cg.height) / CGFloat(rows)
        let tileW = logoW / CGFloat(cols)
        let tileH = logoH / CGFloat(rows)
        var tiles: [UIImageView] = []
        for r in 0..<rows {
            for c in 0..<cols {
                let crop = CGRect(x: CGFloat(c) * pw, y: CGFloat(r) * ph, width: pw, height: ph)
                guard let piece = cg.cropping(to: crop) else { continue }
                let iv = UIImageView(image: UIImage(cgImage: piece, scale: logo.scale, orientation: .up))
                iv.frame = CGRect(x: logoFrame.minX + CGFloat(c) * tileW,
                                  y: logoFrame.minY + CGFloat(r) * tileH,
                                  width: tileW, height: tileH)
                addSubview(iv)
                tiles.append(iv)
            }
        }

        // "Meşale Grup" — harf harf etiketler (boşluk dahil), ortalanmış tek satır
        let text = "Meşale Grup"
        let font = UIFont.systemFont(ofSize: min(W * 0.105, 42), weight: .bold)
        var letters: [UILabel] = []
        var widths: [CGFloat] = []
        var total: CGFloat = 0
        for ch in text {
            let l = UILabel()
            l.text = String(ch)
            l.font = font
            l.textColor = .white
            l.sizeToFit()
            let w = ch == " " ? font.pointSize * 0.4 : l.bounds.width
            widths.append(w)
            total += w
            letters.append(l)
        }
        var x = (W - total) / 2
        let textY = logoFrame.maxY + 36
        for (i, l) in letters.enumerated() {
            l.frame = CGRect(x: x, y: textY, width: widths[i], height: font.lineHeight)
            x += widths[i]
            addSubview(l)
        }

        // Başlangıç durumu: parçalar ekranın dört yanına dağılmış + dönük, harfler aşağıda
        for t in tiles {
            let dx = CGFloat.random(in: -W * 0.6 ... W * 0.6)
            let dy = CGFloat.random(in: -H * 0.4 ... H * 0.4)
            let rot = CGFloat.random(in: -1.2 ... 1.2)
            t.transform = CGAffineTransform(translationX: dx, y: dy).rotated(by: rot)
            t.alpha = 0
        }
        for (i, l) in letters.enumerated() {
            l.transform = CGAffineTransform(translationX: 0, y: 60 + CGFloat(i % 4) * 14)
            l.alpha = 0
        }

        // Animasyon: parçalar (karışık sırayla, yaylı) → harfler → bekle → yumuşak söküm
        for (i, t) in tiles.shuffled().enumerated() {
            UIView.animate(withDuration: 0.8, delay: 0.08 + Double(i) * 0.045,
                           usingSpringWithDamping: 0.8, initialSpringVelocity: 0.2,
                           options: [.curveEaseOut], animations: {
                t.transform = .identity
                t.alpha = 1
            })
        }
        for (i, l) in letters.enumerated() {
            UIView.animate(withDuration: 0.5, delay: 0.75 + Double(i) * 0.035,
                           usingSpringWithDamping: 0.85, initialSpringVelocity: 0.3,
                           options: [.curveEaseOut], animations: {
                l.transform = .identity
                l.alpha = 1
            })
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) { self.dismiss() }
    }

    private func dismiss() {
        UIView.animate(withDuration: 0.35, animations: { self.alpha = 0 }, completion: { _ in
            self.removeFromSuperview()
        })
    }
}
