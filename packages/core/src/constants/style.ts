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
  /** Global negative prompt applied to every generation to protect quality. */
  negativePrompt:
    'lowres, blurry, deformed, disfigured, extra limbs, bad anatomy, watermark, text, ' +
    'logo, cartoon, cgi look, plastic skin, oversaturated, harsh flash, cluttered background, ' +
    'amateur, distorted face, mutated hands',
} as const;
