import { execa } from 'execa';
import { RenderError, RENDER_ENCODING, env } from '@yulia/core';

/**
 * Final-quality encode args — used for the output the viewer sees. Software
 * libx264 by default; switches to the matching hardware encoder when
 * RENDER_HW_ACCEL is set (see env.ts — requires a GPU/QSV-capable VM and an
 * ffmpeg build with that encoder, so this is a no-op on the current worker
 * image until both are provisioned).
 */
export const ENCODE_ARGS: string[] =
  env.RENDER_HW_ACCEL === 'nvenc'
    ? [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p4', // NVENC preset scale (p1 fastest .. p7 slowest); p4 ~= balanced
        '-rc',
        'vbr',
        '-cq',
        String(RENDER_ENCODING.crf), // NVENC's CQ scale roughly matches x264 CRF
        '-pix_fmt',
        RENDER_ENCODING.pixelFormat,
      ]
    : env.RENDER_HW_ACCEL === 'qsv'
      ? [
          '-c:v',
          'h264_qsv',
          '-preset',
          'faster',
          '-global_quality',
          String(RENDER_ENCODING.crf),
          '-pix_fmt',
          RENDER_ENCODING.pixelFormat,
        ]
      : [
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
 * Fast encode args for INTERMEDIATE clips (per-scene composites, overlay
 * pre-passes) that are immediately re-encoded by the final crossfade pass.
 * Spending encode quality/time effort on them is wasted, so use the fastest
 * viable settings and a near-lossless quality level to preserve enough
 * fidelity for the final re-encode while cutting encode time. Same
 * software/hardware switch as ENCODE_ARGS above.
 */
export const INTERMEDIATE_ENCODE_ARGS: string[] =
  env.RENDER_HW_ACCEL === 'nvenc'
    ? [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p1', // fastest NVENC preset — intermediates are re-encoded anyway
        '-rc',
        'vbr',
        '-cq',
        '12', // near-lossless
        '-pix_fmt',
        RENDER_ENCODING.pixelFormat,
      ]
    : env.RENDER_HW_ACCEL === 'qsv'
      ? [
          '-c:v',
          'h264_qsv',
          '-preset',
          'veryfast',
          '-global_quality',
          '12',
          '-pix_fmt',
          RENDER_ENCODING.pixelFormat,
        ]
      : [
          '-c:v',
          RENDER_ENCODING.videoCodec,
          '-preset',
          'veryfast',
          '-crf',
          '16', // near-lossless: intermediates are re-encoded, so keep detail cheaply
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
