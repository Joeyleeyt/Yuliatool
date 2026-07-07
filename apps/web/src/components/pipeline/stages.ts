import type { LucideIcon } from 'lucide-react';
import { AudioLines, Captions, Wand2, Workflow, Film, ImageIcon, Clapperboard } from 'lucide-react';
import { ProjectStatus } from '@yulia/core/enums';

/**
 * Display-level pipeline stages shown to users. Each maps to one or more
 * underlying `ProjectStatus` values so a raw status can be resolved to a stage.
 * This is the single source of truth for pipeline visuals across the landing
 * page, the Create flow, and the Project Detail graph.
 */
export interface PipelineStage {
  key: string;
  label: string;
  /** Provider / system doing the work — shown as a subtle caption. */
  engine: string;
  blurb: string;
  icon: LucideIcon;
  /** Underlying statuses that belong to this stage. */
  statuses: string[];
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    key: 'audio',
    label: 'Voiceover',
    engine: 'Upload',
    blurb: 'Drop in a narration track — the only thing you provide.',
    icon: AudioLines,
    statuses: [ProjectStatus.CREATED, ProjectStatus.UPLOADING_AUDIO],
  },
  {
    key: 'transcript',
    label: 'Transcript',
    engine: 'Deepgram',
    blurb: 'Word-level transcription with exact timings — never hallucinated.',
    icon: Captions,
    statuses: [ProjectStatus.TRANSCRIBING],
  },
  {
    key: 'analysis',
    label: 'Story Analysis',
    engine: 'OpenAI',
    blurb: 'The narrative is read for tone, arc, and cinematic intent.',
    icon: Wand2,
    statuses: [ProjectStatus.ANALYZING],
  },
  {
    key: 'planning',
    label: 'Scene Planning',
    engine: 'Segmentation',
    blurb: 'The story is cut into timed scenes and shot prompts.',
    icon: Workflow,
    statuses: [ProjectStatus.SEGMENTING, ProjectStatus.PROMPT_GENERATION],
  },
  {
    key: 'video',
    label: 'Video Generation',
    engine: 'Veo 3',
    blurb: 'Cinematic 8-second clips generated per scene.',
    icon: Film,
    statuses: [ProjectStatus.VIDEO_GENERATION],
  },
  {
    key: 'image',
    label: 'Image Generation',
    engine: 'Stills',
    blurb: 'Editorial 5-second stills fill the narrative between clips.',
    icon: ImageIcon,
    statuses: [ProjectStatus.IMAGE_GENERATION, ProjectStatus.WAITING_ASSETS],
  },
  {
    key: 'render',
    label: 'Rendering',
    engine: 'FFmpeg',
    blurb: 'Crossfades, Ken Burns, and voiceover muxed into a final MP4.',
    icon: Clapperboard,
    statuses: [ProjectStatus.RENDERING],
  },
];

/** Resolve a raw project status to its display stage index (0-based). Returns -1 for terminal-only. */
export function stageIndexForStatus(status: string): number {
  const i = PIPELINE_STAGES.findIndex((s) => s.statuses.includes(status));
  if (i !== -1) return i;
  if (status === ProjectStatus.COMPLETED) return PIPELINE_STAGES.length; // all done
  return -1;
}
