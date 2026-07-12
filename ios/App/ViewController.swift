import UIKit
import WebKit
import Capacitor

/// Faz 6: Görüntülü aramada "hole-punch" render — Capacitor WKWebView'i ŞEFFAF yapıp arkasına
/// native LiveKit VideoView'ları koyar (kontroller web'de kalır, video native çizilir).
/// ⚠️ Main.storyboard'daki BridgeViewController bu sınıfa bağlanmalı (customClass=ViewController).
class ViewController: CAPBridgeViewController {

    private var videoContainer: UIView?
    private static let navy = UIColor(red: 26/255.0, green: 26/255.0, blue: 46/255.0, alpha: 1)

    func enterVideoMode() -> UIView {
        view.backgroundColor = ViewController.navy
        webView?.isOpaque = false
        webView?.backgroundColor = .clear
        webView?.scrollView.backgroundColor = .clear

        let container: UIView
        if let existing = videoContainer {
            container = existing
        } else {
            let v = UIView(frame: view.bounds)
            v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            v.backgroundColor = .clear
            videoContainer = v
            container = v
        }
        if let wv = webView {
            view.insertSubview(container, belowSubview: wv)
        } else {
            view.addSubview(container)
        }
        return container
    }

    func exitVideoMode() {
        videoContainer?.subviews.forEach { $0.removeFromSuperview() }
        videoContainer?.removeFromSuperview()
        videoContainer = nil
        webView?.isOpaque = true
        webView?.backgroundColor = ViewController.navy
        webView?.scrollView.backgroundColor = ViewController.navy
        view.backgroundColor = ViewController.navy
    }
}
