import Foundation
import CoreLocation
import Combine

// ════════════════════════════════════
// GPS + background keep-alive
//
// CoreMotion alone does NOT keep an app running in the background. The trick used
// here (same as run-tracking apps) is to run a background CoreLocation session:
// while location updates are active in the background the process stays alive, so
// the accelerometer keeps sampling. That requires:
//   • "Always" location authorization, and
//   • the UIBackgroundModes = [location] entitlement (the "Location updates"
//     background mode). Swift Playgrounds MAY not let you add that — so we only
//     enable background updates when the entitlement is actually present, and the
//     UI reports whether it is. That is the experiment.
// ════════════════════════════════════

final class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var lat: Double?
    @Published var lon: Double?
    @Published var altM: Double?           // metres, nil when no vertical fix
    @Published var horizontalAccuracy: Double?
    @Published var authStatus: CLAuthorizationStatus = .notDetermined
    @Published var backgroundCapable = false   // Info.plist declares the location background mode
    @Published var updating = false

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .otherNavigation
        let modes = (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]) ?? []
        backgroundCapable = modes.contains("location")
        authStatus = manager.authorizationStatus
    }

    func start() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        // Escalate to Always so the session survives backgrounding.
        manager.requestAlwaysAuthorization()

        // Setting allowsBackgroundLocationUpdates = true WITHOUT the entitlement
        // crashes, so gate it on the declared background mode.
        if backgroundCapable {
            manager.allowsBackgroundLocationUpdates = true
            manager.pausesLocationUpdatesAutomatically = false
        }
        manager.startUpdatingLocation()
        updating = true
    }

    func stop() {
        manager.stopUpdatingLocation()
        updating = false
    }

    // MARK: CLLocationManagerDelegate
    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let l = locs.last else { return }
        lat = l.coordinate.latitude
        lon = l.coordinate.longitude
        altM = l.verticalAccuracy >= 0 ? l.altitude : nil   // negative accuracy => invalid
        horizontalAccuracy = l.horizontalAccuracy
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        authStatus = m.authorizationStatus
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        // Non-fatal — keep running; the UI shows GPS as unavailable until a fix.
    }
}

extension CLAuthorizationStatus {
    var text: String {
        switch self {
        case .notDetermined:       return "not asked"
        case .restricted:          return "restricted"
        case .denied:              return "denied"
        case .authorizedAlways:    return "Always"
        case .authorizedWhenInUse: return "When-In-Use"
        @unknown default:          return "unknown"
        }
    }
}
