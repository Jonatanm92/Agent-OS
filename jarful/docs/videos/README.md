# Demo videos

`jarful-import.mp4` and `jarful-honest.mp4` were recorded from the running app with Playwright (1080×1920, phone layout at 2.5× zoom, caption bar and tap ripples injected), then encoded with ffmpeg (H.264, 30 fps, faststart).

To re-record with your own recipes or captions:
1. Run the app locally with a demo database and seed a kitchen (any recipes you like).
2. Script the flow with Playwright using `recordVideo: { size: { width: 1080, height: 1920 } }` and `html { zoom: 2.5 }` so the 432-px phone layout fills the frame.
3. Encode: `ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p -crf 23 -r 30 -movflags +faststart out.mp4`.

Real screen recordings from your own phone, with your voice, will usually beat these. Use them as a template for pacing and captions.
