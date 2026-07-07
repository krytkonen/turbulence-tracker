# PIREPlog — EFB Turbulence Tracker

Real-time turbulence detection and mapping for iPad EFB use.  
Uses iPad accelerometers and GPS to detect, categorise, and georeference turbulence events.

## Features

- **Turbulence detection** via high-pass filtered accelerometer data
- **Three severity levels**: Light / Moderate / Severe
- **Live GPS position** shown as aircraft icon on map, rotates with heading
- **Four map styles**: Voyager (default), Satellite, Topo, Dark
- **Event fade**: markers dim linearly to zero over 60 minutes
- **Handling suppression**: touch events suppress false positives for 3.5 s
- **Pinch-zoom and touch-pan** map navigation
- **Installable PWA** — runs full-screen and works offline / in-flight (no a-Shell needed)

## Usage

Open `https://krytkonen.github.io/pireplog/` in Safari on iPad.  
Tap **Enable Sensors** and allow both motion and location permissions.

## Install as an app (offline / in-flight)

The app is a Progressive Web App: once installed it runs full-screen from the
home screen and works **without any internet connection** — no a-Shell or local
web server required. A [service worker](sw.js) pre-caches the entire UI (HTML,
the vendored Leaflet map engine and icons), so the app itself always loads
offline.

**Install on iPad (Safari):**

1. Open `https://krytkonen.github.io/pireplog/` **once while online**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch **PIREPlog** from the home screen. It opens full-screen with no
   browser chrome.

> On iPad the motion-sensor permission requires Safari (or a home-screen app
> added from Safari). Grant **Motion & Orientation** and **Location** on first
> **Enable Sensors** tap.

### Map tiles offline

The app shell always works offline. **Map tiles** are cached as you view them,
so any area you pan/zoom over *while online* stays available in flight. To
guarantee coverage for a route, open the app on the ground (Wi-Fi/cellular) and
scroll the map over your planned track and alternates first — those tiles are
then served from cache with no connection. Turbulence detection, logging and
GPS positioning need **no** tiles and work regardless.

### Updating

When a new version is deployed, opening the installed app while online shows an
**"Update available — tap to reload"** prompt. Tap it to load the new version.
No connection? The last cached version keeps working.

### Local hosting (optional fallback)

If you ever prefer serving locally instead of installing, any static server
works, e.g. with [a-Shell](https://apps.apple.com/app/a-shell/id1473805438):

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/` on the same iPad. Installing the PWA is the
recommended path and makes this unnecessary.

## Turbulence thresholds (RMS g after high-pass filter)

| Level    | Threshold |
|----------|-----------|
| Light    | ≥ 0.09 g  |
| Moderate | ≥ 0.22 g  |
| Severe   | ≥ 0.48 g  |
