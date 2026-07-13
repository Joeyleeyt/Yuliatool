import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { RenderError } from '@yulia/core';

/**
 * Extract a single frame from a video (local path OR remote https URL — ffmpeg
 * reads both) and return it as a base64 `data:image/jpeg` URL, ready to hand to
 * a vision model. Used by the hand-anatomy check to screen generated clips for
 * extra/deformed hands before they're accepted.
 *
 * `atSec` is where to sample; callers pass a mid-clip time so the frame is
 * representative (the first/last frames of a generated clip are often the
 * weakest). The frame is downscaled (default 768px wide) to keep the vision
 * payload small — hand-count is legible well below full resolution.
 */
export async function extractFrameDataUrl(
  videoUrlOrPath: string,
  opts: { atSec?: number; maxWidth?: number } = {},
): Promise<string> {
  const atSec = opts.atSec ?? 1.0;
  const maxWidth = opts.maxWidth ?? 768;
  const dir = await mkdtemp(join(tmpdir(), 'yulia-frame-'));
  const out = join(dir, 'frame.jpg');
  try {
    // -ss before -i seeks fast (keyframe-accurate is fine for a still check).
    // scale caps width, keeps aspect; -frames:v 1 grabs exactly one frame.
    await execa('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      atSec.toFixed(2),
      '-i',
      videoUrlOrPath,
      '-frames:v',
      '1',
      '-vf',
      `scale='min(${maxWidth},iw)':-2`,
      '-q:v',
      '3',
      out,
    ], {
      timeout: 1000 * 60 * 2, // 2 min: a single seek+decode, incl. remote fetch
    });
    const buf = await readFile(out);
    if (buf.length === 0) throw new RenderError(`empty frame extracted from ${videoUrlOrPath}`);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (cause) {
    if (cause instanceof RenderError) throw cause;
    const stderr = (cause as { stderr?: string }).stderr ?? '';
    throw new RenderError('frame extraction failed', {
      cause,
      context: { videoUrlOrPath, stderrTail: stderr.slice(-1000) },
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
