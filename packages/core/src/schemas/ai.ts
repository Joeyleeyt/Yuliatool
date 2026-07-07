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
export const ScenePromptSchema = z.object({
  positivePrompt: z.string(),
  negativePrompt: z.string(),
  camera: z.string(),
  composition: z.string(),
  lighting: z.string(),
  motion: z.string(),
  colorPalette: z.array(z.string()),
});
export type ScenePromptOutput = z.infer<typeof ScenePromptSchema>;
