# OpenBroadcast Web — eye gaze correction, no install

Live at **https://amanvicky.github.io/openbroadcast-web/** — allow the camera, look away like you're reading notes, flip correction on, watch your eyes get pulled back to the lens. That's the whole pitch.

Three files, no build step, no server, no account: `app.js` (all of the logic, ~7 KB), `index.html` (the page and its copy), `style.css`.

## How the correction works

1. MediaPipe's FaceLandmarker (WASM + GPU delegate, tasks-vision 0.10.14) tracks the 478-point face mesh 30–60 times per second. The model (~3 MB, float16) downloads once per visit.
2. From that mesh the code reads the iris centers (landmarks **468** left / **473** right) and each eye's box — outer 33, inner 133, top 159, bottom 145 on the left; 263 / 362 / 386 / 374 on the right.
3. Gaze = how far the iris sits from the eye-box center, **normalized by eye width**, so the math works at any camera distance. Left and right are averaged, then smoothed with an exponential factor of 0.35 so the correction doesn't twitch between frames.
4. When correction is on, the region around each eye — 2.4× the eye width, cut out with a radial-gradient feathered mask so the patch has no visible seam — is redrawn shifted **opposite** the gaze offset, scaled by the strength slider. The rest of the face is untouched.

Result: your eyes return to the lens; everything else stays honest.

## Controls

- **correction: on / off** — the toggle
- **strength** slider (default 60) — how hard the eyes get pulled; the pixel shift is gaze × canvas width × 0.045 × strength
- **show tracking** — debug overlay: eye centers as green circles, iris dots, and the offset line between them. Watching the dots drift when you look away is half the demo.

## Privacy

Frames never leave the device — there is no backend to upload to. The only network requests are the MediaPipe model and WASM from their CDN. "View source if you don't believe me" is the entire privacy policy.

## Limits

- Needs `getUserMedia` (so https or localhost) and the GPU delegate — current Chrome, Edge and Firefox are fine
- Lighting matters more than camera quality; if the tracking dots vanish, move back so your whole face is in frame
- This shifts the eye region — it doesn't rebuild it. Extreme angles will show artifacts; the desktop version's trained models are what handle those

## The family

- [Open-Broadcast](https://github.com/amanvicky/Open-Broadcast) — the desktop app: trained iris-segmentation models, calibration wizard, virtual camera for Zoom, Teams and OBS
- [Gazester](https://github.com/amanvicky/Gazester) — the research prototype this whole line of work grew out of

MIT licensed.
