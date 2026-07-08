import Foundation

// ════════════════════════════════════
// Turbulence classification + event model
// Ported 1:1 from the PWA (turbulence-tracker/index.html).
// ════════════════════════════════════

enum TurbLevel: String, Codable, CaseIterable {
    case smooth, light, moderate, severe

    var label: String {
        switch self {
        case .smooth:   return "● SMOOTH AIR"
        case .light:    return "▲ LIGHT TURB"
        case .moderate: return "▲ MOD TURBULENCE"
        case .severe:   return "⚠ SEVERE TURBULENCE"
        }
    }

    var isEvent: Bool { self != .smooth }
}

struct TurbEvent: Identifiable, Codable {
    let id: Date            // timestamp doubles as a stable id
    let level: TurbLevel
    let rmsG: Double
    let jerkG: Double
    let lat: Double
    let lon: Double
    let altM: Double?       // GPS altitude in metres, nil when no vertical fix

    // GPS geometric altitude in feet (nil if unknown).
    var altFt: Double? { altM.map { $0 * 3.280839895 } }

    // Approximate flight level from GPS altitude, e.g. "FL350" (nil if unknown).
    var flightLevel: String? {
        guard let ft = altFt else { return nil }
        return String(format: "FL%03d", Int((ft / 100).rounded()))
    }
}

// Detection constants — identical values to the PWA's CFG.
enum CFG {
    static let hpAlpha: Double      = 0.87   // high-pass coefficient
    static let rmsWindow            = 45     // samples (~0.75 s at 60 Hz)
    static let jerkSmooth           = 8      // samples to smooth jerk
    static let tLight: Double       = 0.09   // g thresholds (after high-pass)
    static let tModerate: Double    = 0.22
    static let tSevere: Double      = 0.48
    static let touchCoolMs: Double  = 3500   // ignore motion after a screen touch
    static let eventCoolMs: Double  = 9000   // min gap between logged events
    static let persistSamples       = 18     // level must persist this many samples
    static let sampleRateHz: Double = 60
}
