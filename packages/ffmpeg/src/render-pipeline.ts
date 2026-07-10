import { join } from 'node:path';
import { RENDER_ENCODING, TRANSITION, RenderError, mapLimit, env } from '@yulia/core';
import { ENCODE_ARGS, runFfmpeg } from './ffmpeg-runner.js';
import { compositeScene } from './normalize.js';
import { probe } from './ffprobe.js';
import type { RenderInput, RenderOutput, RenderSegment } from './types.js';

/**
 * Composite a single scene's two layers into one normalized clip. Exposed
 * separately from `renderVideo` so callers (RenderService) can pipeline it
 * directly after each scene's assets finish downloading, instead of waiting
 * for every scene to download before compositing starts.
 *
 * Sync guarantee: non-last segments are composited to `displayDuration + T` so
 * the crossfade chain's overlap comes out of the added `T`, not the segment's
 * own on-screen time (see `renderVideo`).
 */
export async function compositeSegment(
  seg: RenderSegment,
  index: number,
  isLast: boolean,
  opts: { width: number; height: number; workDir: string },
): Promise<string> {
  const { width, height, workDir } = opts;
  const fps = RENDER_ENCODING.fps;
  const T = TRANSITION.durationSec;
  const targetLen = isLast ? seg.displayDurationSec : seg.displayDurationSec + T;
  const out = join(workDir, `scene_${String(index).padStart(4, '0')}.mp4`);

  const titleCard =
    seg.titleText && seg.itemNumber
      ? { itemNumber: seg.itemNumber, titleText: seg.titleText }
      : undefined;
  await compositeScene(
    seg.backgroundPath,
    seg.overlayPaths,
    seg.overlaySide,
    out,
    { width, height, fps, durationSec: targetLen },
    titleCard,
  );
  return out;
}

/**
 * Crossfade-chain already-composited scene clips into a silent video, then mux
 * the original voiceover. This is phases 2-3 of `renderVideo`, split out so a
 * caller that pipelines its own download+composite (see RenderService) can
 * reuse this tail without going through `renderVideo`'s phase-1 composite loop.
 *
 * `normalized[i]` must be composited to `displayDurations[i] + T` for every
 * non-last segment (see `compositeSegment`) so the crossfade overlap comes out
 * of that added `T`, keeping the total at Σ displayDuration.
 */
export async function concatAndMux(input: {
  normalized: string[];
  displayDurations: number[];
  voiceoverPath: string;
  outputPath: string;
  width: number;
  height: number;
  workDir: string;
  onProgress?: RenderInput['onProgress'];
}): Promise<RenderOutput> {
  const { normalized, displayDurations, width, height, workDir } = input;
  const fps = RENDER_ENCODING.fps;
  const T = TRANSITION.durationSec;
  const N = normalized.length;
  if (N === 0) throw new RenderError('no segments to render');

  // Crossfade chain -> silent video.
  const silent = join(workDir, 'silent.mp4');
  if (N === 1) {
    await runFfmpeg(['-i', normalized[0]!, '-an', '-c:v', 'copy', silent]);
  } else {
    const inputs = normalized.flatMap((p) => ['-i', p]);
    const parts: string[] = [];
    let last = '0:v';
    let offset = 0;
    for (let k = 1; k < N; k++) {
      offset += displayDurations[k - 1]!;
      const label = k === N - 1 ? 'vout' : `vx${k}`;
      parts.push(
        `[${last}][${k}:v]xfade=transition=fade:duration=${T}:offset=${offset.toFixed(3)}[${label}]`,
      );
      last = label;
    }
    await runFfmpeg([
      ...inputs,
      '-filter_complex',
      parts.join(';'),
      '-map',
      '[vout]',
      '-an',
      ...ENCODE_ARGS,
      silent,
    ]);
  }
  input.onProgress?.({ percent: 88, stage: 'concat' });

  // Mux the original voiceover (copy video, high-quality AAC audio).
  await runFfmpeg([
    '-i',
    silent,
    '-i',
    input.voiceoverPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-c:a',
    RENDER_ENCODING.audioCodec,
    '-b:a',
    `${RENDER_ENCODING.audioBitrateKbps}k`,
    '-ar',
    String(RENDER_ENCODING.audioSampleRate),
    '-shortest',
    input.outputPath,
  ]);
  input.onProgress?.({ percent: 100, stage: 'mux' });

  const probed = await probe(input.outputPath);
  return { outputPath: input.outputPath, durationSec: probed.durationSec, width, height, fps };
}

/**
 * Full render: composite each scene (background video + portrait overlay
 * window), crossfade-chain them into a silent video whose length equals the
 * narration, then mux the original voiceover.
 *
 * Sync guarantee: non-last segments are composited to `displayDuration + T` and
 * xfade offsets are the cumulative display durations, so the crossfades overlap
 * exactly the added `T` and the total equals Σ displayDuration.
 */
export async function renderVideo(input: RenderInput): Promise<RenderOutput> {
  const { segments, width, height, workDir } = input;
  const N = segments.length;
  if (N === 0) throw new RenderError('no segments to render');

  // 1. Composite each scene's two layers into one normalized clip. Scenes are
  //    independent (each writes its own scene_XXXX.mp4), so run a bounded pool of
  //    composites concurrently — a single libx264 filter graph doesn't saturate
  //    the VM's cores, so overlapping them cuts the composite phase (the bulk of
  //    render time, mapped to 0..70% below) roughly by the pool size.
  let done = 0;
  const normalized = await mapLimit(segments, env.RENDER_COMPOSITE_CONCURRENCY, async (seg, i) => {
    const out = await compositeSegment(seg, i, i === N - 1, { width, height, workDir });
    done += 1;
    input.onProgress?.({ percent: Math.round((done / N) * 70), stage: 'normalize' });
    return out;
  });

  return concatAndMux({
    normalized,
    displayDurations: segments.map((s) => s.displayDurationSec),
    voiceoverPath: input.voiceoverPath,
    outputPath: input.outputPath,
    width,
    height,
    workDir,
    onProgress: input.onProgress,
  });
}
