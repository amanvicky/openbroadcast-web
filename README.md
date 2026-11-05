# OpenBroadcast Web

Real-time eye gaze correction that runs in your browser. Turn on your camera, look slightly off-camera (at your notes, your second screen), and watch the correction pull your eyes back to the lens.

**Live: https://amanvicky.github.io/openbroadcast-web/**

No install, no account, no upload. The face model (~3 MB) downloads once per visit from Google's CDN, and every frame after that is processed on your device.

## How it works

1. MediaPipe's face landmarker finds 478 face landmarks, including the iris centers, 30-60 times per second.
2. For each eye it measures how far the iris sits from the eye center, in eye-widths.
3. When correction is on, an oval patch around each eye gets shifted back toward the center, with feathered edges so it blends into the frame. The rest of your face stays untouched.

It's the browser version of [OpenBroadcast](https://github.com/amanvicky/Open-Broadcast), my desktop app that does the same job with trained iris-segmentation models, a calibration wizard and better warping. This one trades quality for being a link you can just click.

## Running it locally

Any static server works:

```bash
python -m http.server 8000
# open http://localhost:8000
```

The page must be served over http(s) — `file://` won't get camera access.

## What it isn't

This is a demo, not the desktop app. The warp is geometric (no learned model), there's no temporal blending or virtual camera, and strong glasses or bad lighting will upset it. For the real thing, use [OpenBroadcast](https://github.com/amanvicky/Open-Broadcast).

## Privacy

Frames never leave your device. There is no backend. The only network requests are the CDN files (MediaPipe wasm + model weights) and GitHub Pages itself. View source, it's four files.

## License

MIT
