# @yulia/ffmpeg

Rendering pipeline over the FFmpeg binary (invoked via `execa`, not a native binding — simpler, deterministic, container-friendly). Storage-agnostic: it receives **local file paths** and produces a local MP4; the worker handles R2 download/upload around it.

Pipeline stages (Phase 6):

1. **Probe** every input (`ffprobe`) → resolution, fps, duration, codec.
2. **Normalize** each segment to `RENDER_ENCODING` (scale/crop to target dims, pad, fps, pixel format).
3. **Stills → motion**: images become clips with a Ken Burns slow-zoom for the target hold duration.
4. **Transitions**: `xfade` crossfades between adjacent segments.
5. **Concatenate** the normalized segments.
6. **Mux** the original voiceover (copy-quality AAC 320k) over the video track.
7. Emit `1080x1920` and/or `1920x1080` per `RenderFormat`.

All numeric parameters come from `@yulia/core` constants (`RENDER_ENCODING`, `TRANSITION`) so the renderer and segmenter never disagree.
