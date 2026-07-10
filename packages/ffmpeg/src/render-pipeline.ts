import { join } from 'node:path';
import { RENDER_ENCODING, TRANSITION, RenderError, mapLimit, env } from '@yulia/core';
import { ENCODE_ARGS, runFfmpeg } from './ffmpeg-runner.js';
import { compositeScene } from './normalize.js';
import { probe } from './ffprobe.js';
import type { RenderInput, RenderOutput } from './types.js';

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
  const fps = RENDER_ENCODING.fps;
  const T = TRANSITION.durationSec;
  const N = segments.length;
  if (N === 0) throw new RenderError('no segments to render');

  // 1. Composite each scene's two layers into one normalized clip. Scenes are
  //    independent (each writes its own scene_XXXX.mp4), so run a bounded pool of
  //    composites concurrently — a single libx264 filter graph doesn't saturate
  //    the VM's cores, so overlapping them cuts the composite phase (the bulk of
  //    render time, mapped to 0..70% below) roughly by the pool size.
  let done = 0;
  const normalized = await mapLimit(segments, env.RENDER_COMPOSITE_CONCURRENCY, async (seg, i) => {
    const isLast = i === N - 1;
    const targetLen = isLast ? seg.displayDurationSec : seg.displayDurationSec + T;
    const out = join(workDir, `scene_${String(i).padStart(4, '0')}.mp4`);

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

    done += 1;
    input.onProgress?.({ percent: Math.round((done / N) * 70), stage: 'normalize' });
    return out;
  });

  // 2. Crossfade chain -> silent video.
  const silent = join(workDir, 'silent.mp4');
  if (N === 1) {
    await runFfmpeg(['-i', normalized[0]!, '-an', '-c:v', 'copy', silent]);
  } else {
    const inputs = normalized.flatMap((p) => ['-i', p]);
    const parts: string[] = [];
    let last = '0:v';
    let offset = 0;
    for (let k = 1; k < N; k++) {
      offset += segments[k - 1]!.displayDurationSec;
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

  // 3. Mux the original voiceover (copy video, high-quality AAC audio).
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
