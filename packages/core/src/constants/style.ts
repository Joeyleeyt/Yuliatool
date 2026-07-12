/**
 * The house visual identity. This is the aesthetic contract every generated
 * prompt inherits, injected into the OpenAI system prompt so segmentation and
 * prompt engineering never drift from the brand.
 */
export const HOUSE_STYLE = {
  title: 'Soft Luxury Editorial',
  keywords: [
    'classy woman',
    'luxury',
    'elegant',
    'high-end',
    'sophisticated',
    'modern',
    'aesthetic cinematic',
    'beautiful lighting',
    'fashion',
    'soft luxury',
    'editorial',
    'white peonies',
    'silk textures',
    'gold accents',
    'tea and coffee ritual',
    'faceless lifestyle',
  ],
  descriptor:
    'Cinematic, high-end editorial fashion aesthetic centered on an elegant, classy woman. ' +
    'Soft luxury mood: warm refined color grading with muted gold accents, soft natural window ' +
    'light, warm interior practicals and golden-hour sun, shallow depth of field, tasteful ' +
    'rule-of-thirds composition, modern sophistication. Camera language of slow dollies, gentle ' +
    'push-ins and static beauty shots; recurring motifs of white peonies, silk textures and ' +
    'macro liquid droplets. YouTube faceless channel production quality.',
  colorPalette: ['warm champagne', 'soft ivory', 'muted gold', 'deep teal', 'deep crimson', 'crystal white'],
  /**
   * Global negative prompt applied to every generation to protect quality.
   *
   * ANATOMY group is FRONT-LOADED and heavily reinforced on purpose — the #1
   * client-reported failure is impossible human anatomy ("3 hands for a woman",
   * extra/duplicated hands and arms, malformed fingers). Text-to-image/video
   * models weight negative terms by prominence and repetition, so the hand/limb
   * count terms lead the list and are stated several ways; the positive side
   * (scenePromptSystem) additionally pins an explicit "exactly one person, two
   * hands, five fingers each" constraint, which suppresses duplication far
   * better than negatives alone. Other groups:
   *   - fabric/geometry: cloth that drifts/morphs unnaturally mid-clip.
   *   - subject-locomotion: a person walking THROUGH furniture / floating feet
   *     (the "walks through the bed" failure) — Veo breaks physics most on
   *     full-body traversal, so scenePromptSystem steers to grounded micro-
   *     actions and these terms are the backstop.
   *   - jewelry-defect: broken/melted metal + gemstones (the malformed-earrings
   *     failure) — reduces, cannot eliminate, model hallucination on intricate
   *     jewelry; scenePromptSystem prefers a single clean object per overlay.
   */
  negativePrompt:
    // --- ANATOMY (front-loaded, highest priority) ---
    'extra hands, third hand, three hands, extra arms, third arm, duplicated hands, ' +
    'duplicate arm, cloned limbs, extra limbs, too many fingers, extra fingers, ' +
    'fused fingers, missing fingers, malformed hands, mutated hands, deformed hands, ' +
    'disfigured hands, distorted hands, bad hands, extra body parts, conjoined limbs, ' +
    'floating hand, disembodied hand, bad anatomy, deformed anatomy, malformed anatomy, ' +
    'anatomically incorrect, distorted face, deformed face, extra head, ' +
    // --- generic quality ---
    'lowres, blurry, deformed, disfigured, watermark, text, logo, cartoon, cgi look, ' +
    'plastic skin, oversaturated, harsh flash, cluttered background, amateur, ' +
    // --- fabric / geometry / motion coherence ---
    'morphing, warping, flickering, unstable geometry, floating objects, levitating fabric, ' +
    'unnatural motion, physically impossible movement, melting, jittering, wobbling walls, ' +
    'inconsistent lighting between frames, ' +
    // --- subject locomotion / clipping ---
    'person walking through furniture, body clipping through objects, limbs passing through ' +
    'solid surfaces, feet not touching the floor, sinking into furniture, teleporting, ' +
    'phasing through walls, objects merging together, object passing through another object, ' +
    'mismatched scale, duplicated subject, ' +
    // --- jewelry defects ---
    'broken jewelry, deformed metal, melted gemstones, asymmetric earrings, extra prongs, ' +
    'malformed clasp, warped ring, distorted bracelet',
} as const;
