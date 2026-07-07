/**
 * Project lifecycle status. This is the top-level state machine that drives the
 * dashboard UX and gates which worker stages are allowed to run.
 *
 * The literal string values are persisted in Postgres as an enum type
 * (`project_status`) — keep these in exact sync with the DB migration.
 */
export const ProjectStatus = {
  CREATED: 'created',
  UPLOADING_AUDIO: 'uploading_audio',
  TRANSCRIBING: 'transcribing',
  ANALYZING: 'analyzing',
  SEGMENTING: 'segmenting',
  PROMPT_GENERATION: 'prompt_generation',
  VIDEO_GENERATION: 'video_generation',
  IMAGE_GENERATION: 'image_generation',
  WAITING_ASSETS: 'waiting_assets',
  RENDERING: 'rendering',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const PROJECT_STATUS_VALUES = Object.values(ProjectStatus) as ProjectStatus[];

/** Terminal states — no further transitions except an explicit user retry/reset. */
export const TERMINAL_PROJECT_STATUSES: ReadonlySet<ProjectStatus> = new Set([
  ProjectStatus.COMPLETED,
  ProjectStatus.FAILED,
]);

/**
 * Human-friendly labels + ordering for progress UIs. `order` lets the frontend
 * render a linear stepper even though FAILED can occur from anywhere.
 */
export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; order: number; isError: boolean }
> = {
  [ProjectStatus.CREATED]: { label: 'Created', order: 0, isError: false },
  [ProjectStatus.UPLOADING_AUDIO]: { label: 'Uploading audio', order: 1, isError: false },
  [ProjectStatus.TRANSCRIBING]: { label: 'Transcribing', order: 2, isError: false },
  [ProjectStatus.ANALYZING]: { label: 'Analyzing narrative', order: 3, isError: false },
  [ProjectStatus.SEGMENTING]: { label: 'Segmenting scenes', order: 4, isError: false },
  [ProjectStatus.PROMPT_GENERATION]: { label: 'Generating prompts', order: 5, isError: false },
  [ProjectStatus.VIDEO_GENERATION]: { label: 'Generating video', order: 6, isError: false },
  [ProjectStatus.IMAGE_GENERATION]: { label: 'Generating images', order: 7, isError: false },
  [ProjectStatus.WAITING_ASSETS]: { label: 'Waiting for assets', order: 8, isError: false },
  [ProjectStatus.RENDERING]: { label: 'Rendering', order: 9, isError: false },
  [ProjectStatus.COMPLETED]: { label: 'Completed', order: 10, isError: false },
  [ProjectStatus.FAILED]: { label: 'Failed', order: 99, isError: true },
};
