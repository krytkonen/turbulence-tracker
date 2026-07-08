import Foundation
import CoreMotion
import Combine

// ════════════════════════════════════
// Turbulence detection engine
//
// A faithful Swift port of the PWA's accelerometer pipeline:
//   high-pass filter → RMS over a window → jerk → persist → classify → log.
// CoreMotion delivers the accelerometer in g INCLUDING gravity; we scale to m/s²
// so every constant and step matches the web version exactly.
// ════════════════════════════════════

final class TurbulenceEngine: ObservableObject {
    // Live display (published ~10 Hz)
    @Published var rmsG: Double = 0
    @Published var jerkG: Double = 0
    @Published var level: TurbLevel = .smooth
    @Published var running = false
    @Published var events: [TurbEvent] = []

    // Background-liveness telemetry (the point of the experiment)
    @Published var sampleCount = 0
    @Published var backgroundSampleCount = 0
    @Published var lastSampleAt: Date?
    @Published var isForeground = true

    weak var location: LocationManager?

    private let motion = CMMotionManager()
    private let queue = OperationQueue()
    private let g = 9.81

    // Algorithm state (mutated only on the serial sensor queue)
    private var hpState = SIMD3<Double>(repeating: 0)
    private var hpPrev  = SIMD3<Double>(repeating: 0)
    private var rmsBuffer: [SIMD3<Double>] = []
    private var jerkBuffer: [Double] = []
    private var prevJerkAcc = SIMD3<Double>(repeating: 0)
    private var lastTs: TimeInterval = 0
    private var persistLevel: TurbLevel = .smooth
    private var persistCount = 0
    private var lastEventMs: Double = 0
    private var lastTouchMs: Double = 0
    private var displayThrottle = 0

    func noteInteraction() { lastTouchMs = nowMs() }

    func start() {
        guard motion.isAccelerometerAvailable else { return }
        queue.maxConcurrentOperationCount = 1
        motion.accelerometerUpdateInterval = 1.0 / CFG.sampleRateHz
        rmsBuffer.removeAll(); jerkBuffer.removeAll()
        hpState = .init(repeating: 0); hpPrev = .init(repeating: 0)
        prevJerkAcc = .init(repeating: 0); lastTs = 0
        motion.startAccelerometerUpdates(to: queue) { [weak self] data, _ in
            guard let self, let a = data else { return }
            self.handle(a)
        }
        running = true
    }

    func stop() {
        motion.stopAccelerometerUpdates()
        running = false
    }

    func clear() { events.removeAll() }

    private func handle(_ a: CMAccelerometerData) {
        // g (incl. gravity) → m/s² to mirror the PWA's accelerationIncludingGravity.
        let raw = SIMD3<Double>(a.acceleration.x * g, a.acceleration.y * g, a.acceleration.z * g)
        let dt = lastTs > 0 ? (a.timestamp - lastTs) : (1.0 / CFG.sampleRateHz)
        lastTs = a.timestamp

        // High-pass: y = α·(y + x − xPrev)
        hpState = (hpState + raw - hpPrev) * CFG.hpAlpha
        hpPrev = raw
        let filt = hpState

        // RMS over window (÷g back to g units)
        rmsBuffer.append(filt)
        if rmsBuffer.count > CFG.rmsWindow { rmsBuffer.removeFirst() }
        var sum = 0.0
        for s in rmsBuffer { sum += s.x*s.x + s.y*s.y + s.z*s.z }
        let rms = sqrt(sum / Double(rmsBuffer.count)) / g

        // Jerk (rate of change of filtered accel), smoothed
        var jmag = 0.0
        if dt > 0 {
            let j = (filt - prevJerkAcc) / dt
            jmag = sqrt(j.x*j.x + j.y*j.y + j.z*j.z) / g
        }
        prevJerkAcc = filt
        jerkBuffer.append(jmag)
        if jerkBuffer.count > CFG.jerkSmooth { jerkBuffer.removeFirst() }
        let smoothJerk = jerkBuffer.reduce(0, +) / Double(jerkBuffer.count)

        // Classify (screen handling suppresses detection like the PWA)
        var lvl: TurbLevel = .smooth
        let handling = (nowMs() - lastTouchMs) < CFG.touchCoolMs
        if !handling {
            if rms >= CFG.tSevere        { lvl = .severe }
            else if rms >= CFG.tModerate { lvl = .moderate }
            else if rms >= CFG.tLight    { lvl = .light }
        }

        // Persist: a level must hold before it logs, to reject single spikes
        if lvl == persistLevel { persistCount += 1 }
        else { persistLevel = lvl; persistCount = 1 }

        // Log an event when persistent, not smooth, past the debounce, with a fix
        var newEvent: TurbEvent?
        let ready = persistCount >= CFG.persistSamples
            && lvl.isEvent
            && (nowMs() - lastEventMs) > CFG.eventCoolMs
            && location?.lat != nil
        if ready, let lat = location?.lat, let lon = location?.lon {
            newEvent = TurbEvent(id: Date(), level: lvl, rmsG: rms, jerkG: smoothJerk,
                                 lat: lat, lon: lon, altM: location?.altM)
            lastEventMs = nowMs()
            persistCount = 0
        }

        // Publish: display throttled to ~10 Hz, events immediately.
        displayThrottle += 1
        let publishDisplay = displayThrottle % 6 == 0
        let fg = isForeground
        let stamp = Date()
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.sampleCount += 1
            if !fg { self.backgroundSampleCount += 1 }
            self.lastSampleAt = stamp
            if publishDisplay {
                self.rmsG = rms
                self.jerkG = smoothJerk
                self.level = lvl
            }
            if let e = newEvent { self.events.insert(e, at: 0) }
        }
    }

    private func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }
}
