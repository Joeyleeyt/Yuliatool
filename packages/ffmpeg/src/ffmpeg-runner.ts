import { execa } from 'execa';
import { RenderError, RENDER_ENCODING } from '@yulia/core';

/** Standard libx264 encode args shared by every ffmpeg step. */
export const ENCODE_ARGS: string[] = [
  '-c:v',
  RENDER_ENCODING.videoCodec,
  '-preset',
  RENDER_ENCODING.preset,
  '-crf',
  String(RENDER_ENCODING.crf),
  '-pix_fmt',
  RENDER_ENCODING.pixelFormat,
];

/**
 * Run ffmpeg with a fixed prefix (quiet, overwrite). Throws RenderError with a
 * truncated stderr tail on failure so the worker can surface a useful message.
 */
export async function runFfmpeg(args: string[]): Promise<void> {
  try {
    await execa('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      timeout: 1000 * 60 * 30, // 30 min hard cap per invocation
    });
  } catch (cause) {
    const stderr = (cause as { stderr?: string }).stderr ?? '';
    throw new RenderError('ffmpeg command failed', {
      cause,
      context: { stderrTail: stderr.slice(-2000) },
    });
  }
}
