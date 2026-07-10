import { HOUSE_STYLE, SEGMENT_WINDOW_SEC, type SceneVisualType } from '@yulia/core';
import type { TranscriptUnit } from './transcript-units.js';

/**
 * System/user prompt builders for the three OpenAI stages. These encode the
 * house aesthetic and the continuity contract; the OpenAIService stays generic.
 */

// --- Stage 1: global analysis -----------------------------------------------
export function analysisSystem(): string {
  return (
    `You are a world-class creative director for a faceless luxury YouTube channel. ` +
    `${HOUSE_STYLE.descriptor} You translate narration into a cohesive, elegant visual identity. ` +
    `Respond ONLY with the requested structured JSON.`
  );
}

export function analysisUser(fullText: string): string {
  return (
    `House style keywords: ${HOUSE_STYLE.keywords.join(', ')}.\n` +
    `Base palette: ${HOUSE_STYLE.colorPalette.join(', ')}.\n\n` +
    `NARRATION:\n"""${fullText}"""\n\n` +
    `Produce: a concise global summary; the emotional arc as ordered beats (each with an ` +
    `emotion and intensity 0..1); recurring visual motifs; a style guide (palette, lighting, ` +
    `camera language, mood, wardrobe, setting) consistent with the house style; a prompt ` +
    `strategy (guidance plus do/avoid lists) tuned for a cinematic text-to-video/image model; ` +
    `and continuity anchors that MUST persist across every scene (the woman's appearance, key ` +
    `locations, signature objects).`
  );
}

// --- Stage 2: segmentation ---------------------------------------------------
export function segmentationSystem(): string {
  return (
    `You are an expert film editor building a shot list from narration for an elegant, ` +
    `cinematic luxury video. ${HOUSE_STYLE.descriptor} Respond ONLY with structured JSON.`
  );
}

export interface SegmentationChunkContext {
  /** 1-based position of this chunk among the total chunks for the transcript. */
  chunkIndex: number;
  chunkTotal: number;
  /** Trailing narration from the END of the previous chunk, for tone/continuity
   * only — these units are NOT part of `units` and must not be re-segmented. */
  precedingText: string | null;
  /** Title of the last scene emitted by the previous chunk, so a topic that
   * continues across the boundary can keep the same title (same listicle item). */
  precedingLastTitle: string | null;
}

export function segmentationUser(
  units: TranscriptUnit[],
  styleGuideJson: string,
  motifs: string[],
  anchors: string[],
  chunk?: SegmentationChunkContext,
): string {
  const unitLines = units
    .map((u) => `[${u.index}] (${u.start.toFixed(2)}-${u.end.toFixed(2)}s) ${u.text}`)
    .join('\n');
  const chunkPreamble =
    chunk && chunk.chunkTotal > 1
      ? `This is PART ${chunk.chunkIndex} of ${chunk.chunkTotal} of one continuous transcript, split only to ` +
        `keep each request small — segment ONLY the units listed below (their indices continue from the ` +
        `previous part; do not renumber them).\n` +
        (chunk.precedingText
          ? `Narration immediately BEFORE this part (context only, already segmented — do NOT emit scenes for ` +
            `it): "...${chunk.precedingText}"\n` +
            `If this part opens mid-topic, keep continuing that topic under the SAME title ` +
            `("${chunk.precedingLastTitle ?? ''}") until the narration actually moves on.\n`
          : '') +
        '\n'
      : '';
  return (
    chunkPreamble +
    `STYLE GUIDE:\n${styleGuideJson}\n` +
    `MOTIFS: ${motifs.join(', ')}\n` +
    `CONTINUITY ANCHORS: ${anchors.join(', ')}\n\n` +
    `TRANSCRIPT UNITS (index, time range, text):\n${unitLines}\n\n` +
    `Group CONTIGUOUS units into scenes. Each scene is a continuous range ` +
    `[startIndex..endIndex] with NO gaps or overlaps; together the scenes must cover ALL units ` +
    `listed above, in order (use the timestamps for length).\n\n` +
    `CADENCE — target ${SEGMENT_WINDOW_SEC.min}-${SEGMENT_WINDOW_SEC.max} seconds of narration ` +
    `per scene (aim ~${SEGMENT_WINDOW_SEC.target}s). Do NOT return a few giant topic scenes: cut ` +
    `each topic into several ${SEGMENT_WINDOW_SEC.min}-${SEGMENT_WINDOW_SEC.max}s beats. A ` +
    `10-minute video should yield roughly 30-38 scenes. (Any scene longer than ` +
    `${SEGMENT_WINDOW_SEC.split}s is automatically split downstream, so keep them tight.)\n\n` +
    `For each scene give: title, summary, visualIntent, subject, environment, mood, and ` +
    `continuityNotes that explicitly reference the anchors so the sequence stays visually ` +
    `consistent. Group scenes that belong to the same topic under the SAME title so the ` +
    `pipeline can number them as one listicle item. Each scene must be visually self-contained.`
  );
}

// --- Stage 3: per-scene cinematic prompt ------------------------------------
// A scene is a picture-in-picture composite: a wide cinematic BACKGROUND video
// plus a portrait OVERLAY "window" (detail/product shot) over it. We prompt for
// both layers at once so they read as one art-directed frame. `visualType` is
// retained for signature compatibility but no longer selects a single medium.
export function scenePromptSystem(_visualType: SceneVisualType): string {
  return (
    `You are a prompt engineer for the 69Labs generative model, art-directing a ` +
    `picture-in-picture luxury shot. ${HOUSE_STYLE.descriptor} You craft TWO complementary ` +
    `prompts per scene:\n` +
    `1) BACKGROUND — a wide, 16:9, ~8-second cinematic lifestyle/establishing VIDEO clip with ` +
    `gentle motion (dolly, push-in, parallax, drifting light, flowing fabric).\n` +
    `2) OVERLAY — 4:5 portrait still IMAGE(s): tight detail or product shots (texture, hands, ` +
    `object, fabric, grooming) that live in the SAME world, wardrobe, and color grade as the ` +
    `background but with tighter, editorial framing. Provide a primary overlay and a second, ` +
    `DIFFERENT complementary detail (the window rotates between them on longer scenes).\n` +
    `The layers must never contradict each other. Produce extremely cinematic, richly detailed ` +
    `prompts. Respond ONLY with the structured JSON.`
  );
}

export interface ScenePromptContext {
  index: number;
  total: number;
  styleGuideJson: string;
  promptStrategyJson: string;
  anchors: string[];
  current: {
    title: string;
    summary: string;
    narration: string;
    visualIntent: string;
    subject: string;
    environment: string;
    mood: string;
    continuityNotes: string;
  };
  previous: { title: string; positivePrompt: string } | null;
  next: { title: string; summary: string } | null;
}

export function scenePromptUser(c: ScenePromptContext): string {
  const prev = c.previous
    ? `PREVIOUS SCENE ("${c.previous.title}") prompt was:\n${c.previous.positivePrompt}\n` +
      `Maintain visual continuity with it (same woman, wardrobe, world, grade).`
    : `This is the opening scene — establish the look that later scenes will follow.`;
  const next = c.next
    ? `NEXT SCENE ("${c.next.title}"): ${c.next.summary}. Compose so the cut into it feels natural.`
    : `This is the final scene — give it a sense of resolution.`;

  return (
    `GLOBAL STYLE GUIDE:\n${c.styleGuideJson}\n` +
    `PROMPT STRATEGY:\n${c.promptStrategyJson}\n` +
    `CONTINUITY ANCHORS (must hold): ${c.anchors.join(', ')}\n\n` +
    `SCENE ${c.index + 1} of ${c.total} — "${c.current.title}"\n` +
    `Summary: ${c.current.summary}\n` +
    `Narration: "${c.current.narration}"\n` +
    `Visual intent: ${c.current.visualIntent}\n` +
    `Subject: ${c.current.subject}\n` +
    `Environment: ${c.current.environment}\n` +
    `Mood: ${c.current.mood}\n` +
    `Continuity notes: ${c.current.continuityNotes}\n\n` +
    `${prev}\n${next}\n\n` +
    `Write, for the BACKGROUND video: positivePrompt (one dense cinematic paragraph), ` +
    `negativePrompt, and the camera, composition, lighting, motion, and colorPalette fields. ` +
    `Then, for the OVERLAY window: overlayPrompt (a portrait 4:5 detail/product still in the ` +
    `same world and grade — tighter framing, a complementary subject, not a repeat of the ` +
    `background) and overlayNegativePrompt. Also provide overlayPrompt2: a SECOND, DIFFERENT ` +
    `complementary detail in the same world/grade (another object, angle, or texture — not a ` +
    `repeat of overlayPrompt) that the overlay window rotates to on longer scenes — set it to ` +
    `null if this scene only needs one overlay. Keep the elegant, high-end, soft-luxury ` +
    `editorial aesthetic throughout.`
  );
}

/** Merge a per-scene negative prompt with the global quality-protection baseline. */
export function mergeNegativePrompt(sceneNegative: string): string {
  const parts = [sceneNegative.trim(), HOUSE_STYLE.negativePrompt].filter(Boolean);
  return parts.join(', ');
}

/** Aspect ratio string for the render orientation, passed through to 69Labs. */
export function aspectRatioFor(renderFormat: string): string {
  return renderFormat === 'horizontal_1920x1080' ? '16:9' : '9:16';
}
