// BroadcastExtension/SampleHandler.swift
// ReplayKit Broadcast Upload Extension giriş noktası. LiveKit LKSampleHandler tüm işi yapar:
// ekran karelerini App Group üzerinden ana uygulamaya iletir. Başka kod ekleme.
import LiveKit

#if os(iOS)
@available(macCatalyst 13.1, *)
class SampleHandler: LKSampleHandler {
    override var enableLogging: Bool { true }
}
#endif
