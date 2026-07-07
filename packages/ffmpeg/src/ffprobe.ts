import { execa } from 'execa';
import { RenderError } from '@yulia/core';

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
}
interface FfprobeJson {
  format?: { duration?: string };
  streams?: FfprobeStream[];
}

/** Probe a media file for duration / dimensions / fps via ffprobe. */
export async function probe(path: string): Promise<ProbeResult> {
  let stdout: string;
  try {
    ({ stdout } = await execa('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      path,
    ]));
  } catch (cause) {
    throw new RenderError(`ffprobe failed for ${path}`, { cause });
  }

  const json = JSON.parse(stdout) as FfprobeJson;
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');

  return {
    durationSec: Number(json.format?.duration ?? video?.duration ?? 0),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    fps: parseFps(video?.r_frame_rate),
    hasAudio: Boolean(audio),
  };
}

function parseFps(rate: string | undefined): number {
  if (!rate) return 0;
  const [num, den] = rate.split('/');
  const n = Number(num);
  const d = Number(den ?? 1);
  return d > 0 ? n / d : n;
}
