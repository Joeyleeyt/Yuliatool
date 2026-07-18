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
    // legs/feet — reinforced because ~30% of stills are now full-body (head-to-toe)
    'extra legs, third leg, duplicated legs, extra feet, malformed feet, deformed feet, ' +
    'distorted legs, elongated legs, fused legs, missing feet, bad proportions, ' +
    // legs/feet DISSOLVING (client: legs melting into the floor behind a table, low contrast)
    'legs melting into the floor, feet dissolving into the ground, legs fading into the floor, ' +
    'feet merging with the floor, blurred lower body, legs tapering into a blur, feet without ' +
    'clear boundary, legs disappearing behind furniture, feet clipped by the table, ' +
    'smeared shins, indistinct feet, feet blending into a pale floor, ' +
    // --- generic quality ---
    'lowres, blurry, deformed, disfigured, watermark, text, logo, cartoon, cgi look, ' +
    'plastic skin, oversaturated, harsh flash, cluttered background, amateur, ' +
    // --- fabric / geometry / motion coherence ---
    'morphing, warping, flickering, unstable geometry, floating objects, levitating fabric, ' +
    'unnatural motion, physically impossible movement, melting, jittering, wobbling walls, ' +
    'inconsistent lighting between frames, ' +
    // --- object support / gravity (client: a box/drawer floating in mid-air) ---
    'floating object, levitating object, object hovering in mid-air, floating drawer, ' +
    'levitating box, floating tray, unsupported object, object suspended in air, ' +
    'floating furniture, object not resting on any surface, object held by nothing, ' +
    'gravity-defying object, item floating away from the hands, ' +
    // --- subject locomotion / clipping ---
    'person walking through furniture, body clipping through objects, limbs passing through ' +
    'solid surfaces, feet not touching the floor, sinking into furniture, teleporting, ' +
    'phasing through walls, objects merging together, object passing through another object, ' +
    'mismatched scale, duplicated subject, ' +
    // --- jewelry / tiny-object defects ---
    'broken jewelry, deformed metal, melted gemstones, asymmetric earrings, extra prongs, ' +
    'malformed clasp, warped ring, distorted bracelet, ' +
    // clusters of tiny intricate items render as blobs — forbid the whole composition,
    // not just the per-item defect (client: melted jewelry in an open display tray).
    'cluttered jewelry tray, jewelry box full of pieces, display case of many rings, ' +
    'array of tiny objects, dozens of small items, cluttered tray of small objects, ' +
    'many small blurred trinkets, indistinct tiny objects, melted small objects, ' +
    'blobby jewelry, undefined small shapes',

  /**
   * Positive realism preamble PREPENDED to every generation's positive prompt
   * (video + image) right before submission. Negatives alone don't fully stop
   * the physics/anatomy failures the client flagged ("three hands", objects
   * merging, clipping) — a strong positive instruction to obey real-world
   * physics and anatomy pushes the model harder than the same terms phrased as
   * negatives. Kept as a single dense paragraph the scene's own prompt is
   * appended to (see withRealismPreamble). Client-supplied wording, preserved
   * verbatim so the exact phrasing they validated is what ships.
   */
  realismPreamble:
    'Ultra-realistic, physically accurate, photorealistic cinematic scene. Strictly follow ' +
    'real-world physics and object interactions. Maintain consistent character identity, ' +
    'anatomy, proportions, clothing, and environment throughout the entire generation. No extra ' +
    'fingers, extra limbs, duplicate body parts, deformed hands, distorted faces, asymmetrical ' +
    'eyes, unnatural expressions, warped features, or incorrect anatomy. No floating, melting, ' +
    'morphing, stretching, clipping, merging, or disappearing objects. No objects passing through ' +
    'each other. All objects must remain solid, separate, and maintain consistent size, shape, ' +
    'position, and material properties. Human hands must have exactly five fingers with natural ' +
    'movements and realistic grasping. All hand-object interactions must be physically correct, ' +
    'with proper contact, weight, and motion. Maintain stable backgrounds, consistent lighting, ' +
    'accurate shadows, reflections, and perspective. No flickering, jitter, frame-to-frame ' +
    'inconsistencies, sudden transformations, or abrupt appearance/disappearance of objects. ' +
    'Ensure smooth, coherent motion, realistic physics, natural movements, and continuity across ' +
    'all frames. High-detail, cinematic, ultra-photorealistic quality.',
} as const;
