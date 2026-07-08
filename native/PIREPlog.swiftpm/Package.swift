// swift-tools-version: 5.9

// PIREPlog — native turbulence tracker (Swift Playgrounds App).
// Open this .swiftpm in Swift Playgrounds on iPad (or Xcode) and press Run.
//
// If Swift Playgrounds shows an error on the `capabilities:` array below, delete
// that array and instead grant the permissions in Swift Playgrounds:
//   App Settings (••• → Settings) → add "Location" + "Motion", and, if offered,
//   Background Modes → "Location updates". See native/README.md.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "PIREPlog",
    platforms: [
        .iOS("16.0")
    ],
    products: [
        .iOSApplication(
            name: "PIREPlog",
            targets: ["PIREPlog"],
            bundleIdentifier: "fi.pireplog.native",
            displayVersion: "0.1",
            bundleVersion: "1",
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft
            ],
            capabilities: [
                .location(purposeString: "PIREPlog georeferences turbulence events and uses background location so detection keeps running when another app is in front."),
                .motion(purposeString: "PIREPlog reads the accelerometer to detect and classify turbulence.")
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "PIREPlog",
            path: "."
        )
    ]
)
