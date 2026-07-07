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
  ],
  descriptor:
    'Cinematic, high-end editorial fashion aesthetic centered on an elegant, classy woman. ' +
    'Soft luxury mood: refined color grading, beautiful natural and golden-hour lighting, ' +
    'shallow depth of field, tasteful composition, modern sophistication. YouTube faceless ' +
    'channel production quality.',
  colorPalette: ['warm champagne', 'soft ivory', 'muted gold', 'deep espresso', 'blush', 'cream'],
  /** Global negative prompt applied to every generation to protect quality. */
  negativePrompt:
    'lowres, blurry, deformed, disfigured, extra limbs, bad anatomy, watermark, text, ' +
    'logo, cartoon, cgi look, plastic skin, oversaturated, harsh flash, cluttered background, ' +
    'amateur, distorted face, mutated hands',
} as const;
