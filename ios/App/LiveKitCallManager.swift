import Foundation
import AVFoundation
import Combine
import UIKit
import LiveKit

final class LiveKitCallManager: NSObject {
    static let shared = LiveKitCallManager()

    weak var plugin: LiveKitCallPlugin?

    private var room: Room?
    private var hadRemote = false
    private var screenRoom: Room?
    private var broadcastSub: AnyCancellable?

    private(set) var isVideoCall = false
    private weak var videoContainer: UIView?
    private var remoteVideoView: VideoView?
    private var localVideoView: VideoView?
    private weak var remoteVideoTrack: VideoTrack?

    var callKitDrivingAudio = false

    enum CallError: Error { case noRoom, micDenied, broadcastTimeout }

    func prepareForCallKit() {
        AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        try? AudioManager.shared.setEngineAvailability(.none)
        wireBroadcastObserver()
    }

    func connect(url: String, token: String, video: Bool = false) async throws {
        guard await ensureMicPermission() else { throw CallError.micDenied }
        if video { _ = await ensureCameraPermission() }
        isVideoCall = video

        if !callKitDrivingAudio {
            configureAudioSession(video: video)
            try? AVAudioSession.sharedInstance().setActive(true)
            try? AudioManager.shared.setEngineAvailability(.default)
        }

        if let old = room {
            await old.disconnect()
            room = nil
        }

        let opts = RoomOptions(suspendLocalVideoTracksInBackground: video ? false : true)
        let r = Room(delegate: self)
        room = r
        hadRemote = false
        try await r.connect(url: url, token: token, roomOptions: opts)
        try await r.localParticipant.setMicrophone(enabled: true)
        if video {
            try await enableCameraInternal(on: r)
        }

        if let first = r.remoteParticipants.values.first {
            hadRemote = true
            plugin?.emit("participantConnected", [
                "identity": first.identity?.stringValue ?? "",
                "name": first.name ?? "",
            ])
            let peerName = first.name ?? ""
            await MainActor.run { CallKitManager.shared.reportOutgoingConnected(peerName: peerName) }
            if video { await attachExistingRemoteVideo(from: first) }
        }
        plugin?.emit("connected", [:])
    }

    func setMic(_ enabled: Bool) async throws {
        guard let r = room else { throw CallError.noRoom }
        try await r.localParticipant.setMicrophone(enabled: enabled)
    }

    func setSpeaker(_ on: Bool) throws {
        try AVAudioSession.sharedInstance().overrideOutputAudioPort(on ? .speaker : .none)
    }

    func disconnect() async {
        if screenRoom != nil || BroadcastManager.shared.isBroadcasting {
            await stopScreenShare()
        }
        await MainActor.run { self.teardownVideoViews() }
        if let r = room { await r.disconnect() }
        room = nil
        hadRemote = false
        isVideoCall = false
        remoteVideoTrack = nil
        if !callKitDrivingAudio {
            try? AudioManager.shared.setEngineAvailability(.none)
            try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        }
        await MainActor.run { CallKitManager.shared.endCurrentCall() }
    }

    // MARK: - Faz 6: Kamera + video render

    @MainActor
    func attachVideoContainer(_ container: UIView) {
        videoContainer = container
        layoutVideoViews()
        if let t = remoteVideoTrack { bindRemote(t) }
    }

    private func enableCameraInternal(on r: Room) async throws {
        let pub = try await r.localParticipant.setCamera(enabled: true)
        if let capturer = (pub?.track as? LocalVideoTrack)?.capturer as? CameraCapturer {
            capturer.isMultitaskingAccessEnabled = true
        }
        if let local = pub?.track as? VideoTrack {
            await MainActor.run { self.bindLocal(local) }
        }
    }

    func setCameraEnabled(_ enabled: Bool) async throws {
        guard let r = room else { throw CallError.noRoom }
        if enabled {
            try await enableCameraInternal(on: r)
        } else {
            try await r.localParticipant.setCamera(enabled: false)
            await MainActor.run { self.localVideoView?.track = nil }
        }
    }

    func switchCamera() async throws {
        guard let r = room,
              let pub = r.localParticipant.localVideoTracks.first,
              let capturer = (pub.track as? LocalVideoTrack)?.capturer as? CameraCapturer else { return }
        _ = try await capturer.switchCameraPosition()
    }

    @MainActor
    private func bindLocal(_ track: VideoTrack) {
        if localVideoView == nil {
            let v = VideoView()
            v.layoutMode = .fill
            v.mirrorMode = .auto
            localVideoView = v
            videoContainer?.addSubview(v)
        }
        localVideoView?.track = track
        layoutVideoViews()
    }

    @MainActor
    private func bindRemote(_ track: VideoTrack) {
        if remoteVideoView == nil {
            let v = VideoView()
            v.layoutMode = .fill
            remoteVideoView = v
            if let c = videoContainer { c.insertSubview(v, at: 0) }
        }
        remoteVideoView?.track = track
        remoteVideoTrack = track
        layoutVideoViews()
    }

    @MainActor
    private func layoutVideoViews() {
        guard let c = videoContainer else { return }
        remoteVideoView?.frame = c.bounds
        remoteVideoView?.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let lw: CGFloat = 96, lh: CGFloat = 128, margin: CGFloat = 16
        localVideoView?.frame = CGRect(x: c.bounds.width - lw - margin, y: margin + 44, width: lw, height: lh)
        localVideoView?.autoresizingMask = [.flexibleLeftMargin, .flexibleBottomMargin]
        localVideoView?.layer.cornerRadius = 12
        localVideoView?.clipsToBounds = true
    }

    @MainActor
    private func teardownVideoViews() {
        remoteVideoView?.track = nil
        localVideoView?.track = nil
        remoteVideoView?.removeFromSuperview()
        localVideoView?.removeFromSuperview()
        remoteVideoView = nil
        localVideoView = nil
        videoContainer = nil
    }

    private func attachExistingRemoteVideo(from p: RemoteParticipant) async {
        if let track = p.videoTracks.first?.track as? VideoTrack {
            await MainActor.run { self.bindRemote(track) }
        }
    }

    // MARK: - Ekran paylaşımı (Faz 4)

    func startScreenShare(url: String, token: String) async throws {
        wireBroadcastObserver()
        await teardownScreenRoom()
        if !BroadcastManager.shared.isBroadcasting {
            BroadcastManager.shared.requestActivation()
            guard await waitForBroadcastStart(timeout: 60) else {
                BroadcastManager.shared.requestStop()
                plugin?.emit("screenShareState", ["active": false])
                throw CallError.broadcastTimeout
            }
        }
        do {
            let opts = RoomOptions(
                defaultScreenShareCaptureOptions: ScreenShareCaptureOptions(
                    dimensions: .h1080_169,
                    fps: 15,
                    appAudio: false,
                    useBroadcastExtension: true
                )
            )
            let r = Room()
            screenRoom = r
            try await r.connect(url: url, token: token, roomOptions: opts)
            try await r.localParticipant.setScreenShare(enabled: true)
            plugin?.emit("screenShareState", ["active": true])
        } catch {
            await teardownScreenRoom()
            BroadcastManager.shared.requestStop()
            plugin?.emit("screenShareState", ["active": false])
            throw error
        }
    }

    func stopScreenShare() async {
        await teardownScreenRoom()
        if BroadcastManager.shared.isBroadcasting {
            BroadcastManager.shared.requestStop()
        }
        plugin?.emit("screenShareState", ["active": false])
    }

    private func wireBroadcastObserver() {
        guard broadcastSub == nil else { return }
        BroadcastManager.shared.shouldPublishTrack = false
        broadcastSub = BroadcastManager.shared.isBroadcastingPublisher
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isOn in
                guard let self = self, !isOn, self.screenRoom != nil else { return }
                Task {
                    await self.teardownScreenRoom()
                    self.plugin?.emit("screenShareState", ["active": false])
                }
            }
    }

    private func waitForBroadcastStart(timeout: TimeInterval) async -> Bool {
        if BroadcastManager.shared.isBroadcasting { return true }
        return await withCheckedContinuation { cont in
            DispatchQueue.main.async {
                var finished = false
                var subs = Set<AnyCancellable>()
                func finish(_ ok: Bool) {
                    guard !finished else { return }
                    finished = true
                    subs.removeAll()
                    cont.resume(returning: ok)
                }
                BroadcastManager.shared.isBroadcastingPublisher
                    .receive(on: DispatchQueue.main)
                    .filter { $0 }
                    .sink { _ in finish(true) }
                    .store(in: &subs)
                NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
                    .receive(on: DispatchQueue.main)
                    .sink { _ in
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                            if !BroadcastManager.shared.isBroadcasting { finish(false) }
                        }
                    }
                    .store(in: &subs)
                DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { finish(false) }
            }
        }
    }

    private func teardownScreenRoom() async {
        guard let r = screenRoom else { return }
        screenRoom = nil
        try? await r.localParticipant.setScreenShare(enabled: false)
        await r.disconnect()
    }

    // MARK: - CallKit köprüsü

    func callKitDidActivate(video: Bool = false) {
        callKitDrivingAudio = true
        configureAudioSession(video: video)
        try? AudioManager.shared.setEngineAvailability(.default)
    }

    func callKitDidDeactivate() {
        callKitDrivingAudio = false
        try? AudioManager.shared.setEngineAvailability(.none)
    }

    // MARK: - Yardımcılar

    private func configureAudioSession(video: Bool = false) {
        try? AVAudioSession.sharedInstance().setCategory(
            .playAndRecord,
            mode: video ? .videoChat : .voiceChat,
            options: [.allowBluetooth, .allowBluetoothA2DP]
        )
    }

    private func ensureMicPermission() async -> Bool {
        let s = AVAudioSession.sharedInstance()
        if s.recordPermission == .granted { return true }
        return await withCheckedContinuation { cont in
            s.requestRecordPermission { granted in cont.resume(returning: granted) }
        }
    }

    private func ensureCameraPermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined:
            return await withCheckedContinuation { cont in
                AVCaptureDevice.requestAccess(for: .video) { g in cont.resume(returning: g) }
            }
        default: return false
        }
    }
}

extension LiveKitCallManager: RoomDelegate {
    func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        hadRemote = true
        plugin?.emit("participantConnected", [
            "identity": participant.identity?.stringValue ?? "",
            "name": participant.name ?? "",
        ])
        let peerName = participant.name ?? ""
        Task { await MainActor.run { CallKitManager.shared.reportOutgoingConnected(peerName: peerName) } }
        if isVideoCall { Task { await attachExistingRemoteVideo(from: participant) } }
    }

    func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        plugin?.emit("participantDisconnected", [
            "identity": participant.identity?.stringValue ?? "",
        ])
    }

    func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        guard isVideoCall, let track = publication.track as? VideoTrack else { return }
        Task { await MainActor.run { self.bindRemote(track) } }
    }

    func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        guard (publication.track as? VideoTrack) === remoteVideoTrack else { return }
        Task { await MainActor.run { self.remoteVideoView?.track = nil; self.remoteVideoTrack = nil } }
    }

    func room(_ room: Room, didUpdateConnectionState state: ConnectionState, from oldState: ConnectionState) {
        switch state {
        case .disconnected:
            plugin?.emit("disconnected", [:])
        case .reconnecting:
            plugin?.emit("connectionState", ["state": "reconnecting"])
        case .connected where oldState == .reconnecting:
            plugin?.emit("connectionState", ["state": "connected"])
        default:
            break
        }
    }
}
