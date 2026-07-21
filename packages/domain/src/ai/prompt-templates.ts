import {
  HOUSE_STYLE,
  SEGMENT_WINDOW_SEC,
  type SceneVisualType,
  type SubjectOutput,
} from '@yulia/core';
import type { TranscriptUnit } from './transcript-units.js';

/**
 * System/user prompt builders for the three OpenAI stages. These encode the
 * house aesthetic and the continuity contract; the OpenAIService stays generic.
 */

/**
 * Person-language for the DETECTED subject, so the scene prompts stop assuming a
 * woman. The tool serves multiple channels — fashion (a woman), nostalgia (a man
 * / period people / none), product reviews (the product) — so who appears must
 * follow the narration.
 *
 * Returns the noun + pronouns the template splices in, plus a headline directive
 * that overrides the historical "she is a woman" wording. The anatomy/physics
 * guards elsewhere stay — they just apply to whatever PERSON (if any) this
 * describes, not specifically a woman.
 */
/**
 * Casting for the on-screen people. Client direction: everyone in every video and
 * image is European. Kept as one constant so it's the single place to change the
 * cast look; it's woven into every subject case (woman / man / both / incidental /
 * any person in a product scene) so no person is ever left to the model's default.
 */
const PERSON_ETHNICITY = 'European (fair to light complexion, natural European facial features)';

interface SubjectLang {
  /** Directive placed at the top of the scene system prompt. */
  headline: string;
  /** Singular person noun, e.g. "woman", "man", "person". */
  noun: string;
  /** Subject / possessive / object pronouns for that noun. */
  they: string;
  their: string;
  them: string;
  /** The anatomy-count phrase, e.g. "exactly one woman, two hands, five fingers each". */
  anatomy: string;
  /** True when a specific recurring person's identity should be held across scenes. */
  holdsIdentity: boolean;
}

export function subjectLang(subject: SubjectOutput): SubjectLang {
  const brief = subject.description?.trim();
  if (subject.presence === 'none') {
    return {
      headline:
        `SUBJECT — this video is NOT about a specific recurring person; it is about ` +
        `${brief || 'the product / place / topic itself'}. Do NOT insert a person into scenes by ` +
        `default. Center each scene on the OBJECT, PLACE, or MOMENT the narration names. A person ` +
        `appears ONLY when a specific beat's narration clearly calls for one; when that happens, ` +
        `they are ${PERSON_ETHNICITY}, and pin their anatomy exactly as below. Most scenes should ` +
        `have NO person in frame.`,
      noun: 'person',
      they: 'they',
      their: 'their',
      them: 'them',
      anatomy:
        'if a person appears: exactly one person, two hands, five fingers on each hand, ' +
        'anatomically correct natural human proportions',
      holdsIdentity: false,
    };
  }
  if (subject.presence === 'incidental') {
    return {
      headline:
        `SUBJECT — people may appear (${brief || 'period-appropriate figures, passers-by'}) but ` +
        `there is NO single recurring individual to keep identical across scenes. Do not hold one ` +
        `face; cast whoever the beat needs. Every person is ${PERSON_ETHNICITY}. Keep every person ` +
        `anatomically correct.`,
      noun: 'person',
      they: 'they',
      their: 'their',
      them: 'them',
      anatomy:
        'each visible person: two hands, five fingers on each hand, anatomically correct ' +
        'natural human proportions; no extra or duplicated limbs',
      holdsIdentity: false,
    };
  }
  // presence === 'primary' — one recurring person the video centers on.
  const man = subject.gender === 'man';
  const both = subject.gender === 'both';
  if (both) {
    return {
      headline:
        `SUBJECT — this video features BOTH A WOMAN AND A MAN ` +
        `(${brief || 'a woman and a man sharing everyday moments'}). ` +
        `The script is not tied to one gender, so show both across the ` +
        `video, EACH performing the narration's actions and motions — some scenes lead with the ` +
        `woman, some with the man, and some show them TOGETHER in the same moment (the exact beat ` +
        `the narration describes). Do not make the whole video one gender. BOTH the woman and the ` +
        `man are ${PERSON_ETHNICITY}. Keep each person's ` +
        `identity consistent across the scenes they appear in. ANATOMY SAFETY: when both share a ` +
        `frame, stage them clearly separated (not hands overlapping in one tight close-up) and keep ` +
        `at most ONE person's hands in any close shot, so no extra/duplicated limbs can form.`,
      noun: 'person',
      they: 'they',
      their: 'their',
      them: 'them',
      anatomy:
        'each person: exactly two hands, five fingers on each hand, anatomically correct; never ' +
        'more hands or arms than the visible people can have',
      holdsIdentity: true,
    };
  }
  const noun = man ? 'man' : 'woman';
  return {
    headline:
      `SUBJECT — this video centers on ${brief || `an adult ${noun}`}. The recurring on-screen ` +
      `subject is a ${noun}, ${PERSON_ETHNICITY}; keep ${man ? 'his' : 'her'} identity (face, hair, ` +
      `age, grooming) consistent across scenes.`,
    noun,
    they: man ? 'he' : 'she',
    their: man ? 'his' : 'her',
    them: man ? 'him' : 'her',
    anatomy: `exactly one ${noun}, two hands, five fingers on each hand, anatomically correct`,
    holdsIdentity: true,
  };
}

// --- Stage 1: global analysis -----------------------------------------------
export function analysisSystem(): string {
  return (
    `You are a world-class creative director for a faceless cinematic YouTube channel. ` +
    `${HOUSE_STYLE.descriptor} You translate narration into a cohesive, elegant visual identity ` +
    `that FITS THE NARRATION'S OWN TOPIC — the channel's polish is constant, but WHO or WHAT is on ` +
    `screen is dictated by the script, never assumed. ` +
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
    `the SUBJECT; and continuity anchors.\n\n` +
    `SUBJECT — determine, FROM THE WHOLE NARRATION (not a single line), who or what the video is ` +
    `about on screen. Do NOT default to a woman; read the entire script and decide:\n` +
    `  - presence: 'primary' whenever the video is about a PERSON or people / a human lifestyle ` +
    `(a beauty or fashion piece, a personal story, "your morning routine", advice to a viewer); ` +
    `'incidental' if people only appear as background with no through-line (a nostalgia piece with ` +
    `period crowds, a street scene); 'none' ONLY when the whole script is genuinely about a PRODUCT, ` +
    `place, or concept with no human focus at all (a gadget review, a documentary about a city).\n` +
    `  - gender (this is the key decision):\n` +
    `      • if the WHOLE script is about a WOMAN (feminine pronouns, a woman's name, women's ` +
    `products/topics) → 'woman';\n` +
    `      • if the WHOLE script is about a MAN (masculine pronouns, a man's name, men's ` +
    `products/topics) → 'man';\n` +
    `      • if it is a people/lifestyle video but NOT tied to a specific gender (no clear ` +
    `gender cues, addressed to "you", general human topics) → 'both' (the video will show BOTH a ` +
    `woman and a man);\n` +
    `      • use 'na' ONLY when presence is 'incidental' or 'none'.\n` +
    `    Judge from the ENTIRE script, not one phrase — one stray "he" or "she" does not override an ` +
    `otherwise gender-neutral video.\n` +
    `  - description: a one-line casting/subject brief the scene prompts will reuse, e.g. ` +
    `"an elegant adult woman", "a middle-aged man recalling his youth", "a woman and a man sharing ` +
    `everyday moments", "the product itself, shown hero-style with no fixed presenter".\n\n` +
    `CONTINUITY ANCHORS — the few things that MUST persist across every scene: for a 'primary' ` +
    `subject, that person's IDENTITY (face, hair, age, grooming); always the overall film grade. ` +
    `NOT a fixed location or outfit — environment, wardrobe, background, and colors CHANGE per scene ` +
    `to follow the narration. For 'incidental'/'none' subjects, anchor only the grade and recurring ` +
    `motifs, NOT a single person.`
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
    `continuityNotes. The ENVIRONMENT must be chosen from THIS scene's narration and should VARY ` +
    `from neighbouring scenes (a new, fitting location per beat — avoid repeating one room); the ` +
    `subject/visualIntent should depict what the narration actually names. CONTENT SAFETY: never ` +
    `describe a visualIntent/subject that puts a CHILD or MINOR with smoking, cigarettes (real or ` +
    `candy), alcohol, drugs, weapons, or any adult/vice/suggestive/violent context (a downstream ` +
    `generator refuses such shots and the whole video fails). For a beat like that, make the ` +
    `visualIntent a SAFE alternative — the product/candy as a still object, the vintage shop or era, ` +
    `or an adult reminiscing — never a child using or mimicking it. continuityNotes carry ` +
    `only the woman's identity and the warm grade forward (NOT a fixed room or outfit). Group scenes ` +
    `that belong to the same topic under the SAME title so the pipeline can number them as one ` +
    `listicle item. Each scene must be visually self-contained.`
  );
}

// --- Stage 3: per-scene cinematic prompt ------------------------------------
// A scene is a picture-in-picture composite: a wide cinematic BACKGROUND video
// plus a portrait OVERLAY "window" (detail/product shot) over it. We prompt for
// both layers at once so they read as one art-directed frame. `visualType` is
// retained for signature compatibility but no longer selects a single medium.
export function scenePromptSystem(_visualType: SceneVisualType, subject: SubjectOutput): string {
  const s = subjectLang(subject);
  return (
    `You are a senior creative director and prompt engineer for the 69Labs generative model, ` +
    `art-directing a picture-in-picture luxury shot for a premium editorial YouTube channel. ` +
    `${HOUSE_STYLE.descriptor} You craft TWO complementary prompts per scene, PLUS the overlay's ` +
    `editing plan (position, motion, transition).\n\n` +
    // Subject headline FIRST — this OVERRIDES any "woman" wording later in this
    // prompt. Later text was written for the original single (woman) channel; when
    // the detected subject is a man / both / a product, follow THIS block and read
    // every "she/woman" below as "the subject described here".
    `${s.headline}\n` +
    `Throughout the rest of these instructions, wherever older wording says "she"/"the woman", ` +
    `it means THE SUBJECT above (${s.noun}); use ${s.they}/${s.their} accordingly and apply the ` +
    `same rules to that subject.\n\n` +
    `#1 RULE — HUMAN ANATOMY MUST BE REALISTIC (this is the most important instruction; the ` +
    `client's top complaint is impossible bodies like "three hands"): whenever a ` +
    `person or a body part appears in EITHER layer, the prompt MUST explicitly pin the count. ` +
    `Write phrases such as "${s.anatomy}" (for a person) or "a single pair of well-manicured hands, ` +
    `exactly two hands, ten fingers total, anatomically correct" (for hand close-ups). NEVER ` +
    `describe a composition that could imply extra or duplicated hands/arms — do NOT put two ` +
    `people's hands reaching into the same tight frame, do NOT describe "hands" ambiguously, and ` +
    `keep at most ONE person's hands in any close shot. Prefer showing the product with NO hands ` +
    `at all when hands aren't essential.\n\n` +
    `#2 RULE — INTRICATE SMALL OBJECTS MUST STAY SIMPLE AND LARGE (client complaint: melted / ` +
    `malformed jewelry). The model renders many tiny detailed objects as blurred blobs, so NEVER ` +
    `compose a cluttered CLUSTER of small intricate items: no jewelry tray/box/organizer packed ` +
    `with many rings and earrings, no display case full of pieces, no shelf of many small figurines, ` +
    `no table strewn with dozens of tiny objects. Instead show ONE hero piece (at most two or three) ` +
    `LARGE, close, and centered — a single ring, a single necklace, one pair of earrings — so it ` +
    `fills enough of the frame to render cleanly with correct metal, prongs, and gemstones. This ` +
    `applies to BOTH the background video and the image. If the narration is about jewelry, show ` +
    `the ONE piece the beat names, big and in focus (on a hand, or on a clean surface) — never an ` +
    `open drawer/tray of assorted pieces. Same rule for any fiddly small object (watch faces, ` +
    `coins, keys, cosmetics minutiae): few, large, simple — never a dense array of tiny ones.\n\n` +
    `#3 RULE — OBJECT PHYSICS / SUPPORT (client complaint: a box/drawer floating in mid-air). EVERY ` +
    `object in frame MUST be physically SUPPORTED and obey gravity — there is exactly one correct ` +
    `place for it: RESTING on a surface (table, dresser, tray on a counter, shelf, floor), FIRMLY ` +
    `HELD in a hand with a clear, correct grip (fingers wrapped around it, weight visibly carried), ` +
    `or HANGING from a fixture (hook, rail, rack). State the support explicitly in the prompt — say ` +
    `WHERE the object sits or HOW it is held. NEVER describe or imply an object floating, hovering, ` +
    `suspended, or mid-air with nothing under it. A drawer or jewelry box is INSIDE or ON a piece of ` +
    `furniture (a dresser, vanity, console) — never detached and floating in front of a person. If a ` +
    `person interacts with an object, their hands must make believable contact and bear its weight ` +
    `(both hands under a tray, fingers gripping a handle), not hover near it. This applies to the ` +
    `BACKGROUND video and the IMAGE, and to fabric, furniture, and props alike: everything rests, ` +
    `hangs, or is held — nothing levitates.\n\n` +
    `#4 RULE — LOWER BODY / FEET INTEGRITY (client complaint: legs and feet melting/dissolving into ` +
    `the floor). Feet are the hardest thing for the model to render, and they fail most when they ` +
    `are (a) partially HIDDEN behind furniture, (b) LOW-CONTRAST against the floor (light shoes/hem ` +
    `on a pale floor, backlit), or (c) small and far. So when a person is shown FULL-LENGTH: place ` +
    `their feet in CLEAR, UNOBSTRUCTED view — standing on OPEN floor, feet fully visible and NOT ` +
    `occluded by a table, sofa, or rug edge cutting across the shins/ankles. Give the feet CONTRAST ` +
    `with the floor (e.g. defined shoes, a shadow grounding them) so the boundary reads. State it in ` +
    `the prompt: "both feet fully visible and flat on the floor, clearly separated from the ground, ` +
    `natural shoes, grounded with a soft contact shadow". If the setting would force the feet behind ` +
    `an object or into a washed-out low-contrast floor, DO NOT fake a full-length shot there — either ` +
    `move the person to open floor, or frame from the KNEES/THIGHS UP (a clean three-quarter or ` +
    `medium shot) so no melted feet are shown at all. A clean knee-up shot is FAR better than a ` +
    `full-length shot with dissolving feet. Never let legs blur, taper, fuse, or melt into the ` +
    `floor.\n\n` +
    `#5 RULE — CONTENT SAFETY (a scene the generator REFUSES fails the whole video; a prompt that ` +
    `depicts minors with adult/vice imagery is blocked every time). NEVER depict a CHILD or MINOR ` +
    `together with smoking, cigarettes (real OR candy/pretend), vaping, alcohol, drugs, weapons, ` +
    `gambling, or any suggestive/violent context — even nostalgically or humorously. If the ` +
    `narration mentions such a thing (e.g. "candy cigarettes", "sweets shaped like cigars"), depict ` +
    `it SAFELY: show the CANDY/PRODUCT ITSELF as a still-life hero object (a candy cigarette in its ` +
    `retro packaging on a counter), or an ADULT reminiscing, or the vintage shop/era — but NEVER a ` +
    `child using or mimicking it. More generally, keep every prompt to imagery a mainstream ` +
    `video/image model will generate without refusal: no minors in any adult/vice/suggestive/` +
    `dangerous scenario, no graphic violence, no explicit content, no hateful or protected-symbol ` +
    `imagery. When a beat's literal content would be unsafe to depict, reframe it to the nearest ` +
    `SAFE visual that still follows the narration (the object, the place, the era, or an adult), and ` +
    `NEVER put a person in the frame for that beat if the only person the words imply is a child in ` +
    `a blocked context.\n\n` +
    `WHAT STAYS vs WHAT CHANGES (client's key note: scenes look too samey — the background, ` +
    `environment, wardrobe, colors, and actions barely change). ONLY these stay constant across the ` +
    `whole video: the WOMAN'S IDENTITY (same face, hair, age, refined grooming) and the overall warm ` +
    `quiet-luxury FILM GRADE. EVERYTHING ELSE must actively CHANGE from scene to scene to match each ` +
    `beat's narration: the ENVIRONMENT/location, the BACKGROUND and its dominant COLORS, her ` +
    `WARDROBE/outfit, and her ACTION. Consecutive scenes must look visibly DIFFERENT — a new place, ` +
    `often a new outfit suited to that place, and a different action. Do NOT reuse the previous ` +
    `scene's room, outfit, or color scheme unless the narration explicitly continues the same moment.\n\n` +
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
    `   ACTION — FOLLOW THE VOICEOVER FIRST (client's core requirement: the visual must show what ` +
    `the narration is actually talking about). Read THIS scene's narration and give her ONE primary ` +
    `action that DEPICTS the specific subject being spoken — the exact object, product, ritual, or ` +
    `moment the words name. If the narration mentions a handbag, she is choosing/holding that ` +
    `handbag; a skincare step → she is applying that product; a morning coffee → she is making that ` +
    `coffee; a book/idea → she is reading that book. The on-screen subject must MATCH the words, not ` +
    `a generic stand-in. ONLY when the narration is abstract and names nothing showable (a feeling, ` +
    `an idea with no object) do you fall back to a neutral quiet-luxury ritual — pouring tea or ` +
    `coffee, arranging white peonies in a vase, reading or writing in a journal, touching or folding ` +
    `silk/linen, lighting a candle, holding a cup, adjusting a cuff, opening curtains at the window ` +
    `— chosen to fit the narration's mood. She performs the action like a professional actress: it ` +
    `begins, completes, and then she SETTLES into a relaxed, natural posture — not an endless ` +
    `repeating gesture. Never reduce her to "standing", "posing", or "wearing a dress" — she is ` +
    `always DOING the thing the narration is about, but only ONE thing.\n` +
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
    `SCREEN, used as its own standalone scene (NOT a small window floated over video). It must ` +
    `DEPICT THE SPECIFIC SUBJECT THIS SCENE'S NARRATION NAMES (client's core requirement: images ` +
    `must follow the voiceover) — if the words are about a perfume, show THAT perfume; a piece of ` +
    `jewelry, THAT piece; a dish, THAT dish; a destination, THAT place. It is a clean, editorial ` +
    `luxury-lifestyle still that keeps the SAME woman's identity and the warm film grade, but whose ` +
    `SETTING, SURFACES, WARDROBE, and COLORS match THIS beat's narration (not a repeat of the ` +
    `previous scene's world): a composed full-frame moment built around the narrated subject (that ` +
    `product/detail on a ` +
    `beautiful surface, the serene interior being described, the specific tablescape, flowers, or ` +
    `textural close-up the words evoke). Only when the narration names nothing concrete may it be a ` +
    `neutral mood still that fits the beat. Compose it edge-to-edge for a 16:9 frame ` +
    `(NOT a centered object marooned in negative space). If a person appears, prefer a full-length ` +
    `head-to-toe editorial shot — BUT only when the feet can be shown cleanly on open, contrasting ` +
    `floor (see #4). If the setting would push the feet behind furniture or into a washed-out floor, ` +
    `frame from the KNEES/THIGHS UP instead (a clean medium shot) rather than risk melted feet. ` +
    `Either way she is ACTIVELY connected to the EXACT object this scene's narration names — ` +
    `holding, using, wearing, or presenting that specific object (not a generic prop, not a vague ` +
    `background item) so the object and the woman clearly belong to the same beat and the object ` +
    `stays readable and in focus. Pin the anatomy count ` +
    `(exactly one woman, full body, head to toe, two hands, five fingers each, two feet, correct ` +
    `natural human proportions, anatomically correct); keep exactly one person in frame. Provide a ` +
    `primary image and a SECOND, DIFFERENT full-frame composition of ` +
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
  /** The on-screen subject detected from the narration (woman/man/both/none). */
  subject: SubjectOutput;
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
  /**
   * When true, THIS scene's IMAGE (overlayPrompt) must FEATURE THE WOMAN with the
   * narrated object (object still the hero); when false, the object alone. Set
   * deterministically upstream so ~30% of stills include a person (client note:
   * images were coming out object-only). Harmless on VIDEO scenes.
   */
  imageFeaturesWoman?: boolean;
}

export function scenePromptUser(c: ScenePromptContext): string {
  const s = subjectLang(c.subject);
  // Continuity wording adapts to the detected subject: hold ONE identity only for
  // a 'primary' person; for incidental/none subjects, carry just the grade.
  const identityClause = s.holdsIdentity
    ? `the SAME ${s.noun} (same face, hair, age, look) and the same film grade`
    : `the same film grade and overall look (there is no single recurring person to hold)`;
  const prev = c.previous
    ? `PREVIOUS SCENE ("${c.previous.title}") prompt was:\n${c.previous.positivePrompt}\n` +
      `Continuity means ${identityClause} — NOT the same room or outfit. This scene's ENVIRONMENT, ` +
      `WARDROBE, BACKGROUND, COLORS, and ACTION must CHANGE to match THIS scene's narration (see ` +
      `below); do not simply repeat the previous scene's setting or clothing.`
    : s.holdsIdentity
      ? `This is the opening scene — establish the ${s.noun}'s look (identity + grade) that later ` +
        `scenes keep, while each later scene's setting, wardrobe, and action shift to follow its narration.`
      : `This is the opening scene — establish the look and grade that later scenes keep, while each ` +
        `scene's setting and content shift to follow its narration.`;
  const next = c.next
    ? `NEXT SCENE ("${c.next.title}"): ${c.next.summary}. Compose so the cut into it feels natural.`
    : `This is the final scene — give it a sense of resolution.`;

  return (
    `${s.headline}\n(Wherever wording below says "she"/"the woman", it means this subject: ` +
    `${s.noun}, ${s.they}/${s.their}.)\n\n` +
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
    `Then, for the IMAGE: overlayPrompt — a FULL-FRAME 16:9 editorial luxury still that MUST FOLLOW ` +
    `THIS SCENE'S VOICEOVER (client's core requirement): whatever the narration is talking about in ` +
    `this beat is what the image shows. Read the Narration above and depict ITS actual content — ` +
    `if it names an object/product/dish, show THAT exact object as the hero; if it describes a place, ` +
    `show THAT place; if it describes an action or ritual, show THAT action; if it conveys a feeling ` +
    `or idea with nothing concrete, show a mood still that visibly matches that idea. The image must ` +
    `never be a generic luxury filler that ignores the words — a viewer hearing the voiceover should ` +
    `recognise the image as the SAME subject. When the beat names a concrete object it stays the ` +
    `clear FOCAL POINT and hero. ` +
    // WEARABLE-GARMENT RULE (highest priority for this image): clothing must be
    // shown WORN by the subject, never displayed empty. A suit on a chair / a
    // dress on a hanger / shoes on a shelf reads as a catalog, not editorial —
    // and it's the exact "mannequin/dress-form" look the client rejected. So if
    // THIS beat's object is something a person wears, always feature the matched
    // person wearing it, regardless of the 30% object/person mix below.
    `WEARABLE CHECK (do this first) — is the object THIS beat names something a person WEARS ` +
    `(a suit, jacket, blazer, coat, dress, shirt, trousers, skirt, knitwear, shoes, a bag/scarf/hat ` +
    `worn on the body, jewelry on a person)? If YES: the image MUST show a person WEARING / carrying ` +
    `that exact garment in an elegant full-length editorial shot — NEVER the garment alone on a ` +
    `chair, hanger, mannequin, or dress form. ` +
    (s.holdsIdentity
      ? `Use the SAME recurring ${s.noun} as the model (keep ${s.their} identity).`
      : `Cast a model whose GENDER MATCHES THE GARMENT — a man for menswear (a men's suit, men's ` +
        `shirt), a woman for womenswear — read the narration and the item to decide; if genuinely ` +
        `unisex, either is fine.`) +
    ` The person is the model; the garment the narration names is the hero. Pin the anatomy (exactly ` +
    `one person, two hands with five fingers each, two feet, full body head-to-toe, anatomically ` +
    `correct), exactly one person in frame. This overrides the object/person choice below.\n` +
    (c.imageFeaturesWoman
      ? `FOR THIS IMAGE (non-wearable object), FEATURE THE ${s.noun.toUpperCase()} together WITH the ` +
        `object (do NOT show the object alone) — the client wants more images that include a person, ` +
        `not only objects.\n` +
        `   SUBJECT-OBJECT MATCH (critical) — the object with ${s.them} must be the EXACT object THIS ` +
        `scene's narration names (the same product / detail the object-only images would show), ` +
        `and ${s.they} must be ACTIVELY CONNECTED to it, not just near it: ${s.they} is holding, ` +
        `using, wearing, or presenting THAT specific object so the viewer instantly reads "this ` +
        `${s.noun} with this object". Name the object explicitly in the prompt and make it clearly ` +
        `readable and in-focus; do NOT substitute a generic prop or leave the object as a vague ` +
        `background item. The object and the ${s.noun} must obviously belong to the same beat.\n` +
        `   FRAMING (critical) — show ${s.their} FULL BODY, head-to-toe, in an elegant full-length ` +
        `editorial shot within the setting the beat describes (a wide/medium-wide composition that ` +
        `includes ${s.them} from head to feet, standing or seated naturally) WHILE the narrated object ` +
        `stays clearly visible and connected to ${s.them}. ${s.they[0]!.toUpperCase()}${s.they.slice(1)} ` +
        `is a real, living, naturally proportioned adult ${s.noun} (not a mannequin, not a frozen ` +
        `pose), posed elegantly. Keep it a poised, high-end fashion full-body look. Pin the anatomy: ` +
        `"${s.anatomy}, full body, head to toe, two feet, correct natural human proportions"; keep ` +
        `exactly one person in frame so nothing can fuse into an impossible body. Staged in beautiful ` +
        `editorial light, composed edge-to-edge for the 16:9 frame.\n` +
        `   Also provide overlayPrompt2: a SECOND, DIFFERENT full-frame composition of the SAME beat ` +
        `(another angle / staging) that the gallery rotates to on longer scenes — it MAY show the ` +
        `object alone for variety (UNLESS the object is wearable, in which case keep it worn) — or ` +
        `null if one image is enough.\n\n`
      : `FOR THIS IMAGE (non-wearable object only — if the object is WEARABLE, follow the WEARABLE ` +
        `CHECK above and show it worn instead), show the hero object BY ITSELF (no person, no hands): ` +
        `beautifully staged on a luxury surface (silk / marble / velvet / linen) with editorial ` +
        `light, composed edge-to-edge for the 16:9 frame (NOT marooned in negative space, NOT a ` +
        `centered dot).\n` +
        `   Also provide overlayPrompt2: a SECOND, DIFFERENT full-frame composition of the SAME ` +
        `object (another angle / detail / staging, not a repeat) that the gallery rotates to on ` +
        `longer scenes — set it to null if this scene only needs one image.\n\n`) +
    `Also, the BACKGROUND positivePrompt must read as PHOTOREALISTIC LIVE-ACTION footage on a real ` +
    `cinema camera (luxury commercial / Netflix-doc look — not AI art, a catalog still, or a ` +
    `mannequin). If a woman is present she is the primary subject: a real living adult, breathing, ` +
    `blinking, with subtle continuous movement, performing ONE grounded action that DEPICTS THIS ` +
    `SCENE'S NARRATED SUBJECT (show the exact object/product/moment the words name) — falling back to ` +
    `a neutral ritual (pouring tea, arranging peonies, reading, touching silk, lighting a candle) ` +
    `ONLY when the narration names nothing showable — never merely standing or posing, never a ` +
    `frozen still. On or beside a BED she is LYING DOWN and gently ` +
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
