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

Open `https://krytkonen.github.io/turbulence-tracker/` in Safari on iPad.  
Tap **Enable Sensors** and allow both motion and location permissions.

## Install as an app (offline / in-flight)

The app is a Progressive Web App: once installed it runs full-screen from the
home screen and works **without any internet connection** — no a-Shell or local
web server required. A [service worker](sw.js) pre-caches the entire UI (HTML,
the vendored Leaflet map engine and icons), so the app itself always loads
offline.

**Install on iPad (Safari):**

1. Open `https://krytkonen.github.io/turbulence-tracker/` **once while online**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch **PIREPlog** from the home screen. It opens full-screen with no
   browser chrome.

> On iPad the motion-sensor permission requires Safari (or a home-screen app
> added from Safari). Grant **Motion & Orientation** and **Location** on first
> **Enable Sensors** tap.

### Saving map tiles for offline / in-flight use

The app shell always works offline. **Map tiles** need to be cached while you
still have a connection. Two ways:

- **SAVE AREA button** (recommended) — pan/zoom to the area you want, pick the
  map style, then tap **SAVE AREA** (below the map-style button). It downloads
  every tile covering the current view — at the current zoom plus two deeper
  levels — into permanent offline storage and shows progress (e.g. `42%`).
  Saved tiles are never evicted and survive app updates. Repeat along your
  route and for any alternates. A single save is capped at ~1200 tiles, so
  work in view-sized chunks rather than zoomed all the way out.
- **Passive caching** — any area you simply pan/zoom over while online is also
  cached automatically (with a rolling size limit), so recently viewed areas
  stay available too.

Tiles are saved per map style, so save the style you plan to fly with.
Turbulence detection, logging and GPS positioning need **no** tiles and work
regardless of connection.

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
