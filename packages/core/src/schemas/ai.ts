import { z } from 'zod';

/**
 * Structured-output schemas for the OpenAI stages.
 *
 * Constraints for OpenAI strict json_schema mode (via `zodResponseFormat`):
 *   - every property is required (no `.optional()`; use `.nullable()`),
 *   - no `.default()` / `.transform()` / `.refine()`,
 *   - objects become `additionalProperties:false` automatically.
 * Keep these schemas plain and flat.
 */

// --- Global narrative analysis ----------------------------------------------
export const EmotionalBeatSchema = z.object({
  beat: z.string(),
  emotion: z.string(),
  intensity: z.number(), // 0..1
});

export const StyleGuideSchema = z.object({
  palette: z.array(z.string()),
  lighting: z.string(),
  cameraLanguage: z.string(),
  mood: z.string(),
  wardrobe: z.string(),
  setting: z.string(),
});

export const PromptStrategySchema = z.object({
  guidance: z.string(),
  doList: z.array(z.string()),
  avoidList: z.array(z.string()),
});

export const AnalysisSchema = z.object({
  summary: z.string(),
  emotionalArc: z.array(EmotionalBeatSchema),
  visualMotifs: z.array(z.string()),
  styleGuide: StyleGuideSchema,
  promptStrategy: PromptStrategySchema,
  /** Recurring anchors (the woman's look, key locations) to hold continuity. */
  continuityAnchors: z.array(z.string()),
});
export type AnalysisOutput = z.infer<typeof AnalysisSchema>;

// --- Scene segmentation ------------------------------------------------------
// The model groups contiguous transcript units [startIndex..endIndex]; we derive
// timings from the units, so no timestamps are hallucinated here.
export const SegmentSceneSchema = z.object({
  startIndex: z.number().int(),
  endIndex: z.number().int(),
  title: z.string(),
  summary: z.string(),
  visualIntent: z.string(),
  subject: z.string(),
  environment: z.string(),
  mood: z.string(),
  continuityNotes: z.string(),
});

export const SegmentationSchema = z.object({
  scenes: z.array(SegmentSceneSchema),
});
export type SegmentationOutput = z.infer<typeof SegmentationSchema>;
export type SegmentScene = z.infer<typeof SegmentSceneSchema>;

// --- Per-scene cinematic prompt ---------------------------------------------
// Each scene is a picture-in-picture composite: a wide cinematic BACKGROUND
// video plus a portrait OVERLAY "window" (a detail/product shot) floated over
// it. The model returns both prompts in one call so they stay art-directed as a
// pair (complementary subject, shared grade), never contradicting each other.
export const ScenePromptSchema = z.object({
  // Background: wide lifestyle/establishing video clip (16:9).
  positivePrompt: z.string(),
  negativePrompt: z.string(),
  camera: z.string(),
  composition: z.string(),
  lighting: z.string(),
  motion: z.string(),
  colorPalette: z.array(z.string()),
  // IMAGE (field name kept for schema-migration reasons): a FULL-FRAME 16:9
  // editorial still built around the narrated object (the hero/focal point).
  // Usually the object alone; some beats include the same woman WITH the object,
  // object-focused (she stays secondary). Same identity + warm grade.
  overlayPrompt: z.string(),
  overlayNegativePrompt: z.string(),
  // Optional SECOND full-frame still for longer scenes: a DIFFERENT composition
  // of the same object (another angle/staging, may swap object-only <-> object+woman)
  // that the gallery rotates to mid-scene. Used only when the scene is long enough.
  // Strict json_schema mode requires every property present -> nullable, not
  // optional (see file header); the model returns null when it has nothing to add.
  overlayPrompt2: z.string().nullable(),
  // --- Overlay EDITING PLAN (the reference planner's creative fields) ---------
  // How the overlay window is placed + animated. The renderer resolves these to
  // an actual layout box + zoompan; when the model returns null the renderer
  // falls back to the deterministic side/soft-zoom defaults (older projects).
  //
  // Position: left/right keep a gutter so the focal subject stays visible;
  // center is a near-full-frame overlay that intentionally replaces the
  // background (lifestyle/mood/architecture beats). Chosen to avoid covering the
  // focal subject — NOT alternated mechanically.
  overlayPosition: z.enum(['left', 'center', 'right']).nullable(),
  // Motion for the PRIMARY overlay (slot 0).
  overlayMotion: z
    .enum(['static', 'slow_zoom_in', 'slow_zoom_out', 'pan_left', 'pan_right', 'drift_up', 'drift_down'])
    .nullable(),
  // Motion for the SECOND overlay (slot 1); null when there's no second overlay
  // or the model wants it to inherit the primary motion.
  overlayMotion2: z
    .enum(['static', 'slow_zoom_in', 'slow_zoom_out', 'pan_left', 'pan_right', 'drift_up', 'drift_down'])
    .nullable(),
  // How the overlay window ENTERS its scene (its own entrance, distinct from the
  // scene-to-scene crossfade the render chain always applies).
  overlayTransition: z.enum(['crossfade', 'fade', 'hard_cut', 'fade_to_white']).nullable(),
});
export type ScenePromptOutput = z.infer<typeof ScenePromptSchema>;

// --- Hand-anatomy vision check ----------------------------------------------
// Post-generation screen: a vision model inspects a frame of a generated clip
// for the #1 client-reported defect — impossible hands (extra/duplicated hands,
// wrong finger counts, fused/deformed hands). `handCount` is how many distinct
// hands are visible; `ok` is the model's overall verdict (false = regenerate).
export const HandCheckSchema = z.object({
  handCount: z.number(), // distinct hands visible in the frame
  extraOrDuplicatedHands: z.boolean(),
  deformedHands: z.boolean(), // wrong finger count, fused/melted/broken fingers
  ok: z.boolean(), // overall: true = anatomy acceptable, false = regenerate
  reason: z.string(), // one short phrase explaining the verdict
});
export type HandCheckOutput = z.infer<typeof HandCheckSchema>;
