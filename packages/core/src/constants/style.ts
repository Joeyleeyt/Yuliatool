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
   * Global negative prompt applied to every generation to protect quality. The
   * motion/physics terms target the temporal-coherence failures typical of
   * text-to-video:
   *   - fabric/geometry group: a curtain or cloth that drifts or morphs
   *     unnaturally mid-clip (client feedback on a "floating-cloth" scene).
   *   - subject-locomotion group: a person walking THROUGH furniture, feet not
   *     touching the floor, limbs passing through objects — the failure behind
   *     the "woman walks through the bed" scene. Veo breaks physics most often
   *     on full-body traversal, so these are named explicitly and the prompt
   *     side (scenePromptSystem) additionally steers subjects to grounded,
   *     stationary micro-actions rather than walking across a room.
   */
  negativePrompt:
    'lowres, blurry, deformed, disfigured, extra limbs, bad anatomy, watermark, text, ' +
    'logo, cartoon, cgi look, plastic skin, oversaturated, harsh flash, cluttered background, ' +
    'amateur, distorted face, mutated hands, ' +
    'morphing, warping, flickering, unstable geometry, floating objects, levitating fabric, ' +
    'unnatural motion, physically impossible movement, melting, jittering, wobbling walls, ' +
    'inconsistent lighting between frames, ' +
    'person walking through furniture, body clipping through objects, limbs passing through ' +
    'solid surfaces, feet not touching the floor, sinking into furniture, teleporting, ' +
    'phasing through walls, objects merging together, object passing through another object, ' +
    'mismatched scale, duplicated subject',
} as const;
