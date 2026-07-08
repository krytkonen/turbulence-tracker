import SwiftUI

@main
struct PIREPlogApp: App {
    @StateObject private var engine = TurbulenceEngine()
    @StateObject private var location = LocationManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(engine)
                .environmentObject(location)
        }
    }
}
