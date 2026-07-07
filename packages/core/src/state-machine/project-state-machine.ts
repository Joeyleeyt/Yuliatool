import { ProjectStatus, TERMINAL_PROJECT_STATUSES } from '../enums/project-status.js';
import { QueueName } from '../enums/job.js';

/**
 * Project state machine.
 *
 * The pipeline is intentionally *data-driven*: the DB row's `status` is the
 * single source of truth. A worker never assumes "I just did X, so do Y" — it
 * reads status, asks the machine `nextStatus(status)`, and transitions.
 * This is what makes the system resumable after a Fly.io restart or crash.
 *
 * Two concerns are modeled here:
 *   1. `TRANSITIONS` — the set of *legal* status changes (guards illegal jumps).
 *   2. `STATUS_TO_QUEUE` — which worker queue advances a project sitting in a
 *      given status (the "what runs next" map).
 */

/** Adjacency map of allowed transitions. FAILED is reachable from any active state. */
const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  [ProjectStatus.CREATED]: [ProjectStatus.UPLOADING_AUDIO, ProjectStatus.FAILED],
  [ProjectStatus.UPLOADING_AUDIO]: [ProjectStatus.TRANSCRIBING, ProjectStatus.FAILED],
  [ProjectStatus.TRANSCRIBING]: [ProjectStatus.ANALYZING, ProjectStatus.FAILED],
  [ProjectStatus.ANALYZING]: [ProjectStatus.SEGMENTING, ProjectStatus.FAILED],
  [ProjectStatus.SEGMENTING]: [ProjectStatus.PROMPT_GENERATION, ProjectStatus.FAILED],
  [ProjectStatus.PROMPT_GENERATION]: [ProjectStatus.VIDEO_GENERATION, ProjectStatus.FAILED],
  // Video + image generation run concurrently across scenes; the coarse project
  // status sits at VIDEO_GENERATION while per-scene jobs run. When every scene's
  // asset is stored, a locked fan-in advances straight to WAITING_ASSETS
  // (IMAGE_GENERATION remains a legal intermediate for future explicit phasing).
  // Fine-grained progress lives on scenes/assets.
  [ProjectStatus.VIDEO_GENERATION]: [
    ProjectStatus.IMAGE_GENERATION,
    ProjectStatus.WAITING_ASSETS,
    ProjectStatus.FAILED,
  ],
  [ProjectStatus.IMAGE_GENERATION]: [ProjectStatus.WAITING_ASSETS, ProjectStatus.FAILED],
  [ProjectStatus.WAITING_ASSETS]: [ProjectStatus.RENDERING, ProjectStatus.FAILED],
  [ProjectStatus.RENDERING]: [ProjectStatus.COMPLETED, ProjectStatus.FAILED],
  [ProjectStatus.COMPLETED]: [],
  // A failed project can be reset to any earlier active stage by an explicit
  // retry action (handled at the service layer, which validates the target).
  [ProjectStatus.FAILED]: [],
};

/**
 * Maps a project status to the queue whose worker moves it forward. `null`
 * means no automatic work (terminal, or a state advanced by an external event
 * such as audio upload completion / asset fan-in).
 */
const STATUS_TO_QUEUE: Record<ProjectStatus, QueueName | null> = {
  [ProjectStatus.CREATED]: null, // waits for audio upload
  [ProjectStatus.UPLOADING_AUDIO]: null, // advanced by upload-complete event
  [ProjectStatus.TRANSCRIBING]: QueueName.TRANSCRIPTION,
  [ProjectStatus.ANALYZING]: QueueName.SCRIPT_ANALYSIS,
  [ProjectStatus.SEGMENTING]: QueueName.SCRIPT_ANALYSIS, // segmentation is part of analysis stage
  [ProjectStatus.PROMPT_GENERATION]: QueueName.PROMPT_GENERATION,
  [ProjectStatus.VIDEO_GENERATION]: QueueName.VIDEO_GENERATION,
  [ProjectStatus.IMAGE_GENERATION]: QueueName.IMAGE_GENERATION,
  [ProjectStatus.WAITING_ASSETS]: QueueName.DOWNLOAD_ASSETS,
  [ProjectStatus.RENDERING]: QueueName.RENDERING,
  [ProjectStatus.COMPLETED]: null,
  [ProjectStatus.FAILED]: null,
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ProjectStatus,
    readonly to: ProjectStatus,
  ) {
    super(`Illegal project transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export const ProjectStateMachine = {
  /** Is `to` a legal successor of `from`? */
  canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  },

  /** Assert a transition is legal; throws `InvalidTransitionError` otherwise. */
  assertTransition(from: ProjectStatus, to: ProjectStatus): void {
    if (!this.canTransition(from, to)) throw new InvalidTransitionError(from, to);
  },

  /** The single "happy path" successor (first non-FAILED transition), if any. */
  nextStatus(from: ProjectStatus): ProjectStatus | null {
    const next = TRANSITIONS[from]?.find((s) => s !== ProjectStatus.FAILED);
    return next ?? null;
  },

  /** The queue whose worker advances a project in this status. */
  queueFor(status: ProjectStatus): QueueName | null {
    return STATUS_TO_QUEUE[status];
  },

  isTerminal(status: ProjectStatus): boolean {
    return TERMINAL_PROJECT_STATUSES.has(status);
  },
} as const;
