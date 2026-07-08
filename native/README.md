# PIREPlog — native experiment (Swift Playgrounds)

A standalone **native** turbulence tracker you can build and run **directly on an
iPad with Swift Playgrounds — no Mac required**. It ports the PWA's detection
pipeline (high‑pass filter → RMS → jerk → persist → classify) to Swift/CoreMotion
and adds its own SwiftUI frontend (instruments, level pill, map, event log).

Its real purpose is to answer one question empirically: **can a self‑signed
Swift Playgrounds app keep detecting turbulence in the background** while another
EFB app is in front? The **BACKGROUND DETECTION** card in the app tells you live.

> This folder does not affect the PWA. It is source only — nothing here is served
> by GitHub Pages, and it is committed to the feature branch, not the live site.

## Open & run (iPad)

1. Get the `PIREPlog.swiftpm` folder onto the iPad (AirDrop, iCloud Drive, or
   clone the repo and copy it over).
2. Open it in **Swift Playgrounds** (App Store, free). It opens as an App project.
3. Press **▶ Run**. Grant **Motion** and **Location** when asked — for the
   background test you must choose **Allow While Using / Change to Always → Always**.

When you stop, Swift Playgrounds leaves a **PIREPlog app icon on the Home Screen**
that launches on its own — that is the build you test in flight.

## The background test (the whole point)

1. Run the app; confirm **samples** is climbing and **auth = Always**.
2. Look at **bg mode**:
   - **ON (green)** → the Location background‑mode entitlement is present. Switch
     to another app (or lock briefly) for ~30–60 s, come back, and check
     **bg samples** — if it grew, **background detection works.**
   - **OFF (red)** → Swift Playgrounds could not grant the background mode (see
     below). The app still runs, but iOS suspends it in the background exactly
     like the PWA — **bg samples stays 0.** That answers the question: this use
     case then needs Xcode + a proper entitlement (or the paid Developer Program).

## Enabling the Location background mode

The app reads whether `UIBackgroundModes` includes `location` and only turns on
background updates when it does (setting it without the entitlement would crash).
To try to grant it:

- In Swift Playgrounds, open **App Settings** (the ••• / wrench menu) and look for
  **Capabilities → Background Modes → Location updates**. Add it if offered.
- Permission usage strings + the Location/Motion capabilities are declared in
  `Package.swift`. **If Swift Playgrounds shows an error on the `capabilities:`
  array**, delete that array from `Package.swift` and instead add **Location** and
  **Motion** under App Settings → Capabilities. (Capability names in the Swift
  Package manifest vary by tooling version; the in‑app settings are the reliable
  path.)

If the background mode simply isn't offered in your Swift Playgrounds version,
that is the finding — reliable background sensing requires Xcode/entitlements.

## Files

| File | Role |
|------|------|
| `Package.swift` | App Playground manifest (permissions, target) |
| `PIREPlogApp.swift` | `@main` app entry |
| `Model.swift` | `TurbLevel`, `TurbEvent`, and `CFG` thresholds (ported from the PWA) |
| `TurbulenceEngine.swift` | CoreMotion + the detection algorithm + background telemetry |
| `LocationManager.swift` | CoreLocation, Always auth, background keep‑alive |
| `ContentView.swift` | SwiftUI frontend: instruments, pill, background card, map, log |

## Known limitations

- **Not compiled/tested here** — this environment is Linux; iOS builds need Apple
  tooling. Written carefully; run it in Swift Playgrounds to verify.
- **Free signing** re‑signs on each run from Playgrounds; APNs push and some
  entitlements need the paid Apple Developer Program.
- **No PWA bridge.** By design this is a standalone app, not a feeder for the web
  app — a native app and a PWA are sandboxed separately and can't share storage.
