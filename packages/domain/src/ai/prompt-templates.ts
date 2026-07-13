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
    `You are a senior creative director and prompt engineer for the 69Labs generative model, ` +
    `art-directing a picture-in-picture luxury shot for a premium editorial YouTube channel. ` +
    `${HOUSE_STYLE.descriptor} You craft TWO complementary prompts per scene, PLUS the overlay's ` +
    `editing plan (position, motion, transition).\n\n` +
    `#1 RULE — HUMAN ANATOMY MUST BE REALISTIC (this is the most important instruction; the ` +
    `client's top complaint is impossible bodies like "a woman with three hands"): whenever a ` +
    `person or a body part appears in EITHER layer, the prompt MUST explicitly pin the count. ` +
    `Write phrases such as "exactly one woman, with exactly two hands and five fingers on each ` +
    `hand, natural correct human anatomy" (for people) or "a single pair of well-manicured hands, ` +
    `exactly two hands, ten fingers total, anatomically correct" (for hand close-ups). NEVER ` +
    `describe a composition that could imply extra or duplicated hands/arms — do NOT put two ` +
    `people's hands reaching into the same tight frame, do NOT describe "hands" ambiguously, and ` +
    `keep at most ONE person's hands in any close shot. Prefer showing the product with NO hands ` +
    `at all when hands aren't essential.\n\n` +
    `STORY-FIRST ENVIRONMENT — choose each scene's LOCATION from the MEANING of the narration, not ` +
    `by defaulting to a bedroom/living-room/sofa. Ask: what is being discussed, what emotion, and ` +
    `where would this naturally happen? Then set the scene THERE. E.g. a morning routine → elegant ` +
    `bathroom / dressing room / kitchen / balcony; reading → library / reading corner / café / ` +
    `garden; relaxation → spa / bath / resort / beach; coffee → café terrace / kitchen island; ` +
    `reflection → lakeside / window during rain / quiet garden; dining → elegant restaurant / ` +
    `terrace; travel → hotel suite / airport lounge / scenic overlook. Pull from the full luxury ` +
    `palette (designer kitchen, boutique hotel, spa, private villa, rooftop terrace, bookstore, ` +
    `art gallery, flower shop, botanical/Japanese garden, forest path, ocean overlook, wine bar, ` +
    `yoga studio, Mediterranean courtyard, European street, …). VARY it across consecutive scenes; ` +
    `never park every beat in the same room. The location must feel like the obvious place the ` +
    `narration would naturally occur while staying within the warm quiet-luxury grade.\n\n` +
    `1) BACKGROUND — a wide, 16:9, ~8-second PHOTOREALISTIC LIVE-ACTION VIDEO clip that looks ` +
    `filmed on a professional cinema camera for a luxury fashion / premium hotel commercial (Dior, ` +
    `Chanel, Aman, Apple, a Netflix lifestyle documentary) — NOT AI artwork, illustration, a ` +
    `catalog still, or a mannequin/dress-form shot. State the live-action realism explicitly: real ` +
    `cinema camera, natural skin texture, realistic eyes and hands, natural body proportions, real ` +
    `lens characteristics, natural depth of field, film-quality color grade.\n` +
    `   THE PERSON IS A REAL, LIVING HUMAN and the PRIMARY SUBJECT (the environment supports her, ` +
    `never upstages her). She is a fully-formed adult woman, alive, naturally proportioned, ` +
    `breathing, blinking, with subtle continuous life (soft head/eye movement, shifting weight, ` +
    `gentle hand and hair movement) — never a frozen pose, a still photograph, a faceless/headless ` +
    `body, floating clothes, or a fashion mannequin. Restate the anatomy count in the prompt ` +
    `(exactly one woman, two hands, five fingers each, anatomically correct).\n` +
    `   ACTION — give her ONE meaningful primary action that connects to the narration, chosen from ` +
    `the quiet-luxury rituals this channel lives in: pouring tea or coffee, arranging white peonies ` +
    `in a vase, reading or writing in a journal, touching or folding silk/linen, lighting a candle, ` +
    `holding a cup, adjusting a cuff or sleeve, opening curtains at the window. She performs it like ` +
    `a professional actress: the action begins, completes, and then she SETTLES into a relaxed, ` +
    `natural posture — not an endless repeating gesture. Never reduce her to "standing", "posing", ` +
    `or "wearing a dress" — she is always DOING something, but only ONE thing.\n` +
    `   BED SCENES — if the beat is on or beside a bed, she is LYING DOWN (reclining on the ` +
    `bedding), NEVER standing on the bed. Her natural action there is to gently EMBRACE the bed — ` +
    `wrapping her arms around a pillow or the duvet, hugging the soft linens close while she rests ` +
    `— rather than a fingertip "touch" of the fabric. Keep it a calm full-arm embrace that settles, ` +
    `so it reads as restful and cannot devolve into fiddly hand-touch tics.\n` +
    `   PERFORMANCE — every movement has intention; NO meaningless idle filler. Hands stay relaxed ` +
    `unless interacting with an object. FORBID the tell-tale AI-idle tics: finger wringing, rubbing ` +
    `fingertips, repetitive hand rubbing, wrist twisting, neck wringing or exaggerated neck ` +
    `rotation, shoulder rolling, repeated sleeve-pulling, repeatedly touching hair/jewelry, repeated ` +
    `dress adjustments, body swaying, robotic looping, exaggerated breathing/blinking. Do NOT ` +
    `animate fingers or rotate wrists merely to create motion.\n` +
    `   NATURAL TRANSITION MOVEMENT (highest-priority motion rule) — the body moves directly and ` +
    `efficiently along the SHORTEST natural path into the action, the way a real person ` +
    `unconsciously would. FORBID exaggerated wind-up / anticipation: no spreading or splaying the ` +
    `fingers before reaching, no wrist rotation before contact, no curling-and-uncurling, no elbow/` +
    `shoulder swing to "prepare" for a simple reach. GOOD: relaxed hand → smooth reach → gentle ` +
    `contact → complete the action → relaxed hand. BAD: fingers spread → wrist rotates → fingers ` +
    `wiggle → hand twists → touch.\n` +
    `   MOTION REALISM (critical — the video model breaks physics on big movement): keep the action ` +
    `GROUNDED and local — body settled and supported (feet planted when standing/seated, or reclined ` +
    `on the bedding when lying down), hands within a natural reach, the ambient camera + light + ` +
    `steam + a light fabric settle carrying most of the motion. NEVER describe her walking across ` +
    `the room, walking toward the bed, strolling, traversing or moving through the space, or any ` +
    `full-body locomotion — the model renders that as clipping through furniture and floating feet. ` +
    `Avoid fabric or objects that float, morph, or move in physically impossible ways; any fabric ` +
    `motion is a light, natural settle.\n` +
    `2) IMAGE (the overlayPrompt field) — a FULL-FRAME, wide 16:9 still IMAGE that FILLS THE WHOLE ` +
    `SCREEN, used as its own standalone scene (NOT a small window floated over video). It is a ` +
    `clean, editorial luxury-lifestyle still in the SAME world, wardrobe, and warm grade as the ` +
    `video scenes: a composed full-frame moment — a product/detail on a beautiful surface, a serene ` +
    `interior, a tablescape, flowers, a textural close-up. Compose it edge-to-edge for a 16:9 frame ` +
    `(NOT a centered object marooned in negative space). If a person appears, pin the anatomy count ` +
    `(exactly one woman, two hands, five fingers each, anatomically correct); prefer no hands unless ` +
    `the beat needs them. Provide a primary image and a SECOND, DIFFERENT full-frame composition of ` +
    `the same beat (overlayPrompt2) as an alternate — or null if one is enough.\n\n` +
    `Every image prompt MUST read like a brief for a high-end lifestyle campaign and specify: ` +
    `subject, environment, lighting, camera angle, lens (e.g. 35mm/50mm for a wide full-frame look), ` +
    `composition, materials & textures, color palette, mood, and depth of field. Never write a vague ` +
    `prompt like "perfume bottle" — write a full-frame scene: "an elegant crystal perfume bottle on ` +
    `a marble vanity beside white peonies and folded silk, soft morning window light filling the ` +
    `frame, shallow depth of field, champagne-and-ivory palette, 35mm".\n\n` +
    `Ignore any left/right/center placement or window motion — images are now full-screen scenes, ` +
    `so no overlay editing plan is needed; leave overlayPosition / overlayMotion / overlayTransition ` +
    `null.\n\n` +
    `Produce extremely cinematic, richly detailed prompts. Respond ONLY with the structured JSON.`
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
    `ANATOMY (most important): if a person or any body part appears in the BACKGROUND, the ` +
    `positivePrompt MUST state the exact count — e.g. "exactly one woman, two hands, five fingers ` +
    `per hand, anatomically correct". Never compose so extra or duplicated hands/arms could ` +
    `appear; keep at most one person's hands in a close shot.\n\n` +
    `Write, for the BACKGROUND video: positivePrompt (one dense cinematic paragraph), ` +
    `negativePrompt, and the camera, composition, lighting, motion, and colorPalette fields. ` +
    `Then, for the OVERLAY window: overlayPrompt — a portrait 4:5 CLEAN, ISOLATED PRODUCT STILL: ` +
    `the single hero object BY ITSELF on a simple luxury surface (silk / marble / velvet / linen) ` +
    `with negative space and editorial studio light, showing NO hands and NO person by default ` +
    `(a bare product), so it cannot fuse with the background's hands into an impossible body. Only ` +
    `add a hand if the beat truly needs it, and then pin "exactly one hand, five fingers, ` +
    `anatomically correct". Also provide overlayPrompt2: a SECOND, DIFFERENT clean product angle ` +
    `or detail of the same object (still bare, no hands, not a repeat) that the window rotates to ` +
    `on longer scenes — set it to null if this scene only needs one overlay.\n\n` +
    `Also, the BACKGROUND positivePrompt must read as PHOTOREALISTIC LIVE-ACTION footage on a real ` +
    `cinema camera (luxury commercial / Netflix-doc look — not AI art, a catalog still, or a ` +
    `mannequin). If a woman is present she is the primary subject: a real living adult, breathing, ` +
    `blinking, with subtle continuous movement, performing ONE grounded narration-connected ritual ` +
    `(pouring tea, arranging peonies, reading, touching silk, lighting a candle) — never merely ` +
    `standing or posing, never a frozen still. On or beside a BED she is LYING DOWN and gently ` +
    `hugging a pillow or the duvet with both arms (never standing on the bed, never a fingertip ` +
    `touch). Keep her action LOCAL and grounded (settled/reclined, not walking; ` +
    `natural reach); carry the rest of the motion with ambient camera, light, steam, a light ` +
    `fabric settle — do NOT write that she walks, strolls, moves through, or crosses the room.\n\n` +
    `SET THE ENVIRONMENT from THIS narration's meaning (not a default bedroom/living-room): put the ` +
    `beat in the place it would naturally happen (bath/spa for relaxation, café/kitchen for coffee, ` +
    `library/garden for reading, restaurant/terrace for dining, window/lakeside for reflection, …), ` +
    `varied from the neighbouring scenes, within the warm quiet-luxury grade. Keep her performance ` +
    `intentional — ONE action that completes then settles; NO idle filler (no finger wringing, ` +
    `wrist twisting, neck rotation, hair/jewelry touching, swaying) and NO exaggerated wind-up ` +
    `before a reach — shortest natural path, relaxed hand → reach → contact → complete → relaxed.\n\n` +
    `Finally, the OVERLAY EDITING PLAN — choose these deliberately for THIS beat (not by rote):\n` +
    `- overlayPosition: left, center, or right (center only when the overlay should replace the ` +
    `background as a full mood/lifestyle moment; otherwise the side that best preserves the focal ` +
    `subject).\n` +
    `- overlayMotion: the motion for the primary overlay; overlayMotion2: the motion for the ` +
    `second overlay (null if there is no second overlay or it should inherit the primary motion).\n` +
    `- overlayTransition: how the overlay window enters this scene.\n` +
    `Keep the elegant, high-end, soft-luxury editorial aesthetic throughout.`
  );
}

/** Merge a per-scene negative prompt with the global quality-protection baseline. */
export function mergeNegativePrompt(sceneNegative: string): string {
  const parts = [sceneNegative.trim(), HOUSE_STYLE.negativePrompt].filter(Boolean);
  return parts.join(', ');
}

/**
 * Prepend the global realism/physics/anatomy preamble to a scene's positive
 * prompt, so every submission (video + image) leads with the strong "obey real
 * physics, correct anatomy" instruction before the scene-specific description.
 * Applied at submission time (see SceneGenerationService) so it also covers the
 * shared interstitial and borrowed-donor prompts, not just newly-generated ones.
 * Idempotent: skips if the preamble is already present (a re-submit of an
 * already-prefixed prompt won't double it).
 */
export function withRealismPreamble(scenePrompt: string): string {
  const body = scenePrompt.trim();
  if (body.startsWith(HOUSE_STYLE.realismPreamble)) return body;
  return `${HOUSE_STYLE.realismPreamble}\n\n${body}`;
}

/** Aspect ratio string for the render orientation, passed through to 69Labs. */
export function aspectRatioFor(renderFormat: string): string {
  return renderFormat === 'horizontal_1920x1080' ? '16:9' : '9:16';
}

// --- Hand-anatomy vision check ----------------------------------------------
/** System prompt for the vision model that screens a generated frame for hands. */
export function handCheckSystem(): string {
  return (
    `You are a strict QA reviewer for AI-generated luxury video. You inspect a single frame and ` +
    `judge ONLY human hand/arm anatomy — the #1 defect in this footage is impossible hands ` +
    `(a person with three or more hands, duplicated or extra hands/arms, a hand with the wrong ` +
    `number of fingers, or fused/melted/broken fingers). Count the DISTINCT human hands visible. ` +
    `Be conservative: if a hand is clearly malformed or there are more hands than the visible ` +
    `people could have, mark it a failure. A frame with NO hands visible is fine (ok=true, ` +
    `handCount=0). Do not judge anything except hands/fingers. Respond ONLY with the JSON.`
  );
}

/** User prompt paired with the frame image for the hand check. */
export function handCheckUser(): string {
  return (
    `Inspect this frame. Report: handCount (distinct human hands visible), ` +
    `extraOrDuplicatedHands (true if more hands than the visible people plausibly have), ` +
    `deformedHands (true if any hand has the wrong finger count or fused/melted/broken fingers), ` +
    `ok (false if either problem is present, true otherwise), and a one-phrase reason.`
  );
}
