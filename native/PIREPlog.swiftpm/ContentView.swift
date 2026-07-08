import SwiftUI
import MapKit
import CoreLocation
import Combine

// ════════════════════════════════════
// Frontend — instruments, level pill, background-liveness card, map and log.
// Dark "glass cockpit" styling echoing the PWA.
// ════════════════════════════════════

func levelColor(_ l: TurbLevel) -> Color {
    switch l {
    case .smooth:   return Color(red: 0.0,  green: 0.83, blue: 1.0)   // cyan
    case .light:    return Color(red: 0.94, green: 0.65, blue: 0.0)   // amber
    case .moderate: return Color(red: 1.0,  green: 0.43, blue: 0.0)   // orange
    case .severe:   return Color(red: 1.0,  green: 0.09, blue: 0.27)  // red
    }
}

struct ContentView: View {
    @EnvironmentObject var engine: TurbulenceEngine
    @EnvironmentObject var location: LocationManager
    @Environment(\.scenePhase) private var scenePhase

    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 60.317, longitude: 24.963),
        span: MKCoordinateSpan(latitudeDelta: 2, longitudeDelta: 2))
    @State private var now = Date()

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 0) {
            header
            instruments
            pill
            backgroundCard
            map
            logHeader
            logList
        }
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .contentShape(Rectangle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0).onChanged { _ in engine.noteInteraction() }
        )
        .onAppear {
            engine.location = location
            location.start()
            engine.start()
        }
        .onChange(of: scenePhase) { phase in
            engine.isForeground = (phase == .active)
        }
        .onChange(of: location.lat) { _ in
            if let lat = location.lat, let lon = location.lon {
                region.center = CLLocationCoordinate2D(latitude: lat, longitude: lon)
            }
        }
        .onReceive(ticker) { now = $0 }
    }

    // MARK: Header
    private var header: some View {
        HStack {
            Text("✈ PIREPlog").font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(.cyan)
            Text("NATIVE").font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundColor(.secondary)
            Spacer()
            Circle().fill(location.lat != nil ? Color.green : Color.gray)
                .frame(width: 8, height: 8)
            Text(location.lat != nil ? "GPS" : "NO GPS")
                .font(.system(size: 11, design: .monospaced)).foregroundColor(.secondary)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color(white: 0.06))
    }

    // MARK: Instruments
    private var instruments: some View {
        HStack(spacing: 0) {
            instCell("ACCEL (g)", String(format: "%.3f", engine.rmsG), levelColor(engine.level))
            instCell("JERK (g/s)", String(format: "%.3f", engine.jerkG), .cyan)
            instCell("ALT (GPS)", altText, .cyan)
            instCell("EVENTS", "\(engine.events.count)", .cyan)
        }
        .background(Color(white: 0.09))
    }

    private func instCell(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 9, weight: .medium)).foregroundColor(.secondary)
            Text(value).font(.system(size: 15, design: .monospaced)).foregroundColor(color)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 7)
        .overlay(Rectangle().frame(width: 1).foregroundColor(Color(white: 0.15)), alignment: .trailing)
    }

    private var altText: String {
        guard let ft = location.altM.map({ $0 * 3.280839895 }) else { return "—" }
        return "\(Int(ft.rounded())) ft"
    }

    // MARK: Level pill
    private var pill: some View {
        Text(engine.level.label)
            .font(.system(size: 13, weight: .bold, design: .monospaced))
            .foregroundColor(engine.level == .smooth ? .black : .white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(levelColor(engine.level).opacity(engine.level == .smooth ? 0.85 : 1))
    }

    // MARK: Background-liveness card (the experiment)
    private var backgroundCard: some View {
        let age = engine.lastSampleAt.map { max(0, Int(now.timeIntervalSince($0))) }
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("BACKGROUND DETECTION").font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
                Spacer()
                Text(engine.isForeground ? "FOREGROUND" : "BACKGROUND")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(engine.isForeground ? .cyan : .green)
            }
            HStack(spacing: 14) {
                stat("bg mode", location.backgroundCapable ? "ON" : "OFF",
                     location.backgroundCapable ? .green : Color(red: 1, green: 0.09, blue: 0.27))
                stat("auth", location.authStatus.text,
                     location.authStatus == .authorizedAlways ? .green : .orange)
                stat("samples", "\(engine.sampleCount)", .cyan)
                stat("bg samples", "\(engine.backgroundSampleCount)",
                     engine.backgroundSampleCount > 0 ? .green : .secondary)
                stat("last", age.map { "\($0)s" } ?? "—",
                     (age ?? 99) <= 3 ? .green : .orange)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(white: 0.06))
    }

    private func stat(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.system(size: 8)).foregroundColor(.secondary)
            Text(value).font(.system(size: 12, design: .monospaced)).foregroundColor(color)
        }
    }

    // MARK: Map
    private var map: some View {
        Map(coordinateRegion: $region, showsUserLocation: true, annotationItems: engine.events) { ev in
            MapAnnotation(coordinate: CLLocationCoordinate2D(latitude: ev.lat, longitude: ev.lon)) {
                Circle().fill(levelColor(ev.level))
                    .frame(width: ev.level == .severe ? 18 : ev.level == .moderate ? 14 : 10,
                           height: ev.level == .severe ? 18 : ev.level == .moderate ? 14 : 10)
                    .overlay(Circle().stroke(Color.white.opacity(0.7), lineWidth: 1))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Log
    private var logHeader: some View {
        HStack {
            Text("TURBULENCE EVENT LOG").font(.system(size: 10, weight: .bold))
                .foregroundColor(.secondary)
            Spacer()
            if !engine.events.isEmpty {
                Button("CLEAR") { engine.clear() }
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(red: 1, green: 0.09, blue: 0.27))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .background(Color(white: 0.09))
    }

    private var logList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if engine.events.isEmpty {
                    Text("No turbulence events recorded.")
                        .font(.system(size: 11, design: .monospaced)).foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16).padding(.vertical, 14)
                } else {
                    ForEach(engine.events) { ev in logRow(ev) }
                }
            }
        }
        .frame(height: 150)
        .background(Color.black)
    }

    private func logRow(_ ev: TurbEvent) -> some View {
        HStack(spacing: 8) {
            Text(ev.id, style: .time)
                .font(.system(size: 11, design: .monospaced)).foregroundColor(.secondary)
                .frame(width: 74, alignment: .leading)
            Text(ev.level.rawValue.uppercased())
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundColor(levelColor(ev.level))
                .frame(width: 78, alignment: .leading)
            Text(String(format: "%.3fg", ev.rmsG))
                .font(.system(size: 11, design: .monospaced)).foregroundColor(.cyan)
            Spacer()
            Text(ev.flightLevel ?? "—")
                .font(.system(size: 11, design: .monospaced)).foregroundColor(.cyan)
        }
        .padding(.horizontal, 16).padding(.vertical, 5)
        .overlay(Rectangle().frame(width: 3).foregroundColor(levelColor(ev.level)), alignment: .leading)
    }
}
