import type { AnalysisOutput, ScenePromptOutput } from '@yulia/core';

/**
 * Reference-derived demo: a real luxury faceless YouTube video (513s, 37 shots)
 * reverse-engineered from a sample via Gemini video analysis, then mapped onto
 * the pipeline's own schemas. This is what AnalysisService + PromptGenerationService
 * would emit for a video "like the sample" — usable as a seed/fixture and as a
 * preview of the house aesthetic in action.
 *
 * NOTE ON CADENCE: unlike the live pipeline (rigid even=8s-video / odd=5s-still
 * alternation, scenes clamped 5-8s — see @yulia/core pipeline.ts), this reference
 * is a topic-grouped "listicle": ~13.8s avg shots, content-driven video vs still,
 * with long still product montages (up to 32s). Durations + visualType below are
 * the reference's REAL values, preserved so this previews the actual format. To
 * render this shape the pipeline would need variable durations + content-driven
 * visual typing rather than index parity.
 */

export const REFERENCE_LUXURY_ANALYSIS: AnalysisOutput = {
  summary:
    'A serene, indulgent faceless luxury lifestyle film built as a curated list of "small ' +
    'luxuries" — signature scent, pure silk, fresh flowers, nourishing hand cream, the ' +
    'morning beverage ritual, matching sleepwear, a heavy crafted pen, the tailored white ' +
    'shirt. An elegant woman moves through hotel rooms, balconies, flower markets, cafes and ' +
    'libraries; each topic pairs a few intimate lifestyle beats with a glossy still product ' +
    'montage, held together by a warm gold-champagne grade and recurring peonies.',
  emotionalArc: [
    { beat: 'Waking calm — morning hydration and quiet ritual', emotion: 'peaceful', intensity: 0.35 },
    { beat: 'Sensory indulgence — scent, silk, golden light', emotion: 'indulgent', intensity: 0.6 },
    { beat: 'Confident presence — city, gallery, boardroom', emotion: 'confident', intensity: 0.7 },
    { beat: 'Restful intimacy — silk sleep, evening reading', emotion: 'serene', intensity: 0.5 },
    { beat: 'Elegant resolution — reprise of every luxury', emotion: 'magnificent', intensity: 0.8 },
  ],
  visualMotifs: [
    'White peonies in crystal vases',
    'Macro liquid droplets',
    'Silk textures',
    'Gold accents',
    'Tea and coffee rituals',
  ],
  styleGuide: {
    palette: ['#F5F5F5', '#E8DCC4', '#D4AF37', '#2F4F4F', '#8B0000', '#FFFFFF'],
    lighting: 'Soft natural window light, warm interior practicals, golden-hour sun.',
    cameraLanguage: 'Slow dollies, gentle push-ins, static beauty shots, shallow depth of field.',
    mood: 'Sophisticated, serene, indulgent.',
    wardrobe: 'Silk pajamas, cashmere loungewear, tailored blazers, white button-down shirts.',
    setting: 'Luxury hotel rooms, upscale bedrooms, flower markets, European cafes, libraries.',
  },
  promptStrategy: {
    guidance:
      'Hold one consistent, polished woman and a warm gold-champagne grade across every scene. ' +
      'Lead with texture and light (silk sheen, steam, mist, droplets) and keep faces soft/faceless. ' +
      'Pair each luxury topic with intimate lifestyle motion beats and clean, glossy product stills.',
    doList: [
      'Soft natural window light and golden-hour warmth',
      'Shallow depth of field with creamy bokeh',
      'Recurring white peonies and gold accents in frame',
      'Rule-of-thirds, generous negative space, magazine-clean composition',
      'Subtle life in video shots: rising steam, drifting curtains, flowing silk',
    ],
    avoidList: [
      'Harsh flash or clinical white balance',
      'Cluttered or busy backgrounds',
      'Visible brand logos or on-screen text',
      'Oversaturated or cartoon/CGI look',
      'Distorted faces or hands',
    ],
  },
  continuityAnchors: [
    "Narrator's polished look (same woman, refined grooming)",
    'White peonies present or implied in the background',
    'Consistent warm champagne-and-gold color grade',
    'High-end interior decor and styling',
  ],
};

/** A demo scene = the pipeline's scene row + its generated 69Labs prompt. */
export interface DemoScene {
  index: number;
  title: string;
  startSec: number;
  endSec: number;
  /** Content-driven, as observed in the reference (not index parity). */
  visualType: 'video' | 'image';
  narrationHint: string;
  prompt: ScenePromptOutput;
}

const NEG =
  'lowres, blurry, deformed, disfigured, extra limbs, bad anatomy, watermark, text, logo, ' +
  'cartoon, cgi look, plastic skin, oversaturated, harsh flash, cluttered background, amateur, ' +
  'distorted face, mutated hands';

export const REFERENCE_LUXURY_SCENES: DemoScene[] = [
  {
    index: 0, title: 'Morning Hydration', startSec: 0, endSec: 6, visualType: 'video',
    narrationHint: 'The first small luxury is how you begin the day.',
    prompt: {
      positivePrompt:
        'An elegant woman in light-blue silk pajamas sips a glass of water by a floor-to-ceiling window in a sunlit luxury hotel room, backlit by soft morning glow with sheer curtains drifting, cinematic soft-luxury editorial, shallow depth of field, warm champagne grade.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static with a whisper of push-in',
      composition: 'Subject centered, backlit, generous negative space',
      lighting: 'Bright soft natural window light',
      motion: 'Sipping water, curtains drifting, dust motes in light',
      colorPalette: ['#FFFFFF', '#ADD8E6', '#E8DCC4'],
    },
  },
  {
    index: 1, title: 'Balcony Tea', startSec: 6, endSec: 14, visualType: 'video',
    narrationHint: 'Take your ritual somewhere beautiful.',
    prompt: {
      positivePrompt:
        'The same woman in a beige cashmere set cradles a cup of tea on a stone balcony above a coastal golden-hour sunset, steam curling from the cup, warm rim light on her hair, refined editorial luxury, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium-long shot, static',
      composition: 'Subject right-third, coastal view left-third',
      lighting: 'Warm golden-hour sunlight',
      motion: 'Sipping tea, steam rising, gentle sea breeze',
      colorPalette: ['#E8DCC4', '#FFD700', '#F5F5F5'],
    },
  },
  {
    index: 2, title: 'Silk Lounging', startSec: 14, endSec: 21, visualType: 'video',
    narrationHint: 'Let softness be a habit, not a treat.',
    prompt: {
      positivePrompt:
        'The woman in an emerald-green silk slip reclines on white silk sheets in an ornate bedroom, fabric catching a soft sheen, warm interior light, sensual yet tasteful editorial luxury, creamy shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, slow push-in',
      composition: 'Subject centered on the bed, shallow DOF',
      lighting: 'Soft warm interior lighting',
      motion: 'Subtle shift on the bed, silk rippling',
      colorPalette: ['#006400', '#F5F5F5', '#E8DCC4'],
    },
  },
  {
    index: 3, title: 'Liquid Macro', startSec: 21, endSec: 29, visualType: 'video',
    narrationHint: 'The details are the whole point.',
    prompt: {
      positivePrompt:
        'Extreme macro of a single golden oil droplet falling in slow motion from a glass dropper, sparkling high-key highlights against a warm blurred background, pristine refined product cinematography.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Extreme close-up, macro lens',
      composition: 'Dropper centered vertically, droplet mid-fall',
      lighting: 'High-key with sparkling specular highlights',
      motion: 'Droplet falling in slow motion',
      colorPalette: ['#D4AF37', '#FFFFFF'],
    },
  },
  {
    index: 4, title: 'Scent Display', startSec: 29, endSec: 61, visualType: 'image',
    narrationHint: 'Luxury #1 — your signature scent.',
    prompt: {
      positivePrompt:
        'An elegant perfume bottle beside a cluster of white peonies on a wooden table with stacked books, soft side window light, rule-of-thirds, editorial magazine-quality still, warm champagne grade, impeccable fine detail.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium close-up, static',
      composition: 'Flowers left-third, bottle right-third',
      lighting: 'Soft side lighting from a window',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#FFFFFF', '#D4AF37', '#E8DCC4'],
    },
  },
  {
    index: 5, title: 'Applying Scent', startSec: 61, endSec: 69, visualType: 'video',
    narrationHint: 'A scent becomes yours by wearing it daily.',
    prompt: {
      positivePrompt:
        'The woman in a gold silk robe applies perfume to her neck, seen through an ornate vanity mirror, a fine mist catching glamorous warm light, sophisticated editorial luxury, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot through mirror reflection',
      composition: 'Subject centered in the mirror frame',
      lighting: 'Warm glamorous vanity lighting',
      motion: 'Spraying perfume, visible mist',
      colorPalette: ['#D4AF37', '#8B4513', '#FFFFFF'],
    },
  },
  {
    index: 6, title: 'Fragrance Collection', startSec: 69, endSec: 87, visualType: 'image',
    narrationHint: 'Build a small, deliberate wardrobe of scent.',
    prompt: {
      positivePrompt:
        'A curated montage of elegant frosted and clear perfume bottles on clean bright surfaces, even studio light, minimalist aspirational product styling, magazine editorial gloss, crisp fine detail.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Close-ups, static',
      composition: 'Centered product shots, generous negative space',
      lighting: 'Bright even studio lighting',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#FFFFFF', '#000000', '#D4AF37'],
    },
  },
  {
    index: 7, title: 'City Elegance', startSec: 87, endSec: 95, visualType: 'video',
    narrationHint: 'Carry that quiet confidence outside.',
    prompt: {
      positivePrompt:
        'The woman in a tailored camel blazer walks a bright city sidewalk, hair moving in the wind, warm bokeh of the street behind her, confident editorial fashion cinematography, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, tracking with the subject',
      composition: 'Subject centered, city bokeh behind',
      lighting: 'Natural daylight',
      motion: 'Walking, hair drifting in wind',
      colorPalette: ['#8B4513', '#FFFFFF', '#E8DCC4'],
    },
  },
  {
    index: 8, title: 'Niche Scents', startSec: 95, endSec: 127, visualType: 'image',
    narrationHint: 'Seek out the scents no one else wears.',
    prompt: {
      positivePrompt:
        'A grouped still of niche perfume bottles arranged on a polished silver tray, soft diffused light, shallow depth of field, refined curated luxury product photography, warm neutral grade.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Close-ups, static',
      composition: 'Grouped products, shallow DOF',
      lighting: 'Soft diffused light',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#C0C0C0', '#F5F5F5', '#D4AF37'],
    },
  },
  {
    index: 9, title: 'Final Application', startSec: 127, endSec: 135, visualType: 'video',
    narrationHint: 'Scent on the pulse points, last thing before you go.',
    prompt: {
      positivePrompt:
        'The woman in a deep-red silk robe dabs perfume to her pulse points in a dimly lit ornate bedroom, profile view, warm low-key light modeling her form, intimate editorial luxury, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium close-up, static',
      composition: 'Subject centered, profile view',
      lighting: 'Warm low-key lighting',
      motion: 'Dabbing perfume on wrist and neck',
      colorPalette: ['#8B0000', '#D4AF37'],
    },
  },
  {
    index: 10, title: 'Silk Pillowcase', startSec: 135, endSec: 141, visualType: 'image',
    narrationHint: 'Luxury #2 — pure silk against your skin.',
    prompt: {
      positivePrompt:
        'A pristine white silk pillowcase on a neatly made bed catching soft natural light, minimalist clean composition, editorial still, delicate sheen and fine weave detail, airy bright bedroom.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Pillow centered, minimalist',
      lighting: 'Soft natural light',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#FFFFFF', '#F5F5F5'],
    },
  },
  {
    index: 11, title: 'Silk Detail', startSec: 141, endSec: 147, visualType: 'video',
    narrationHint: 'Feel the difference in every fiber.',
    prompt: {
      positivePrompt:
        'Extreme close-up gliding across folds of gold silk fabric with a liquid sheen, side light raking the weave, abstract luxurious texture study, slow elegant camera drift.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Close-up, slow pan',
      composition: 'Abstract full-frame texture',
      lighting: 'Side lighting emphasizing the sheen',
      motion: 'Camera panning across fabric folds',
      colorPalette: ['#D4AF37', '#B8860B'],
    },
  },
  {
    index: 12, title: 'Restful Sleep', startSec: 147, endSec: 155, visualType: 'image',
    narrationHint: 'Better sleep is the quietest luxury.',
    prompt: {
      positivePrompt:
        'The woman rests peacefully hugging a grey silk pillow, eyes closed, soft cool-toned morning light, serene editorial portrait, shallow depth of field, faceless-channel softness.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Subject centered, eyes closed',
      lighting: 'Soft cool-toned light',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#808080', '#FFFFFF'],
    },
  },
  {
    index: 13, title: 'Sleeping Beauty', startSec: 155, endSec: 161, visualType: 'video',
    narrationHint: 'Wake with your skin and hair intact.',
    prompt: {
      positivePrompt:
        'The woman sleeps on white silk in soft morning light, the faintest facial movement and breath, tranquil editorial luxury, warm-white grade, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Subject centered on silk',
      lighting: 'Soft morning light',
      motion: 'Slight facial movement, gentle breathing',
      colorPalette: ['#FFFFFF', '#F5F5F5'],
    },
  },
  {
    index: 14, title: 'Silk Variety', startSec: 161, endSec: 167, visualType: 'image',
    narrationHint: 'Choose a shade that feels like you.',
    prompt: {
      positivePrompt:
        'A soft montage of blush-pink silk pillowcases on a bright bed, even gentle light, tender pastel editorial styling, delicate sheen, clean minimalist composition.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Close-up montage, static',
      composition: 'Centered products',
      lighting: 'Soft even light',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#FFC0CB', '#FFFFFF'],
    },
  },
  {
    index: 15, title: 'Bed Styling', startSec: 167, endSec: 173, visualType: 'video',
    narrationHint: 'Make the bed like it matters — it does.',
    prompt: {
      positivePrompt:
        'The woman in a white robe smooths a silk pillowcase onto a pillow in an ornate bedroom, meticulous graceful hands, warm interior light, refined editorial lifestyle, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Subject centered',
      lighting: 'Warm interior light',
      motion: 'Adjusting and smoothing the pillowcase',
      colorPalette: ['#FFFFFF', '#E8DCC4'],
    },
  },
  {
    index: 16, title: 'Silk Lifestyle', startSec: 173, endSec: 184, visualType: 'video',
    narrationHint: 'It becomes the texture of your rest.',
    prompt: {
      positivePrompt:
        'The woman lounges and stretches languidly across silk bedding in soft morning light, restful and graceful, warm editorial luxury, creamy shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shots, gentle push-in',
      composition: 'Subject centered on bedding',
      lighting: 'Soft morning light',
      motion: 'Stretching, shifting on silk',
      colorPalette: ['#F5F5F5', '#ADD8E6'],
    },
  },
  {
    index: 17, title: 'Flower Market', startSec: 184, endSec: 206, visualType: 'video',
    narrationHint: 'Luxury #3 — fresh flowers, always.',
    prompt: {
      positivePrompt:
        'The woman browses an outdoor flower market, lifting a bunch of peonies to her face, dappled natural daylight, vibrant yet tasteful editorial lifestyle, shallow depth of field, warm grade.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium tracking shots',
      composition: 'Subject within a rich flower-stall environment',
      lighting: 'Natural daylight',
      motion: 'Walking, browsing, lifting flowers',
      colorPalette: ['#FF69B4', '#008000', '#FFFFFF'],
    },
  },
  {
    index: 18, title: 'Floral Arrangement', startSec: 206, endSec: 216, visualType: 'video',
    narrationHint: 'Arranging them is half the pleasure.',
    prompt: {
      positivePrompt:
        'The woman trims rose stems over an elegant kitchen counter, white peonies and roses in a crystal vase beside her, bright natural light, therapeutic refined lifestyle, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium close-up, static',
      composition: 'Subject centered, blooms foregrounded',
      lighting: 'Bright natural light',
      motion: 'Trimming stems, arranging flowers',
      colorPalette: ['#FFFFFF', '#008000', '#E8DCC4'],
    },
  },
  {
    index: 19, title: 'Floral Lifestyle', startSec: 216, endSec: 246, visualType: 'video',
    narrationHint: 'Let them follow you everywhere.',
    prompt: {
      positivePrompt:
        'A montage of the woman carrying wrapped bouquets through market, home and car, blooms everywhere, joyful warm editorial lifestyle, mixed natural and interior light, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shots, gentle handheld',
      composition: 'Subject with flowers across settings',
      lighting: 'Mixed natural and interior',
      motion: 'Walking, arranging, carrying bouquets',
      colorPalette: ['#FFC0CB', '#FFFFFF', '#E8DCC4'],
    },
  },
  {
    index: 20, title: 'Hand Care', startSec: 246, endSec: 261, visualType: 'video',
    narrationHint: 'Luxury #4 — hands that tell no age.',
    prompt: {
      positivePrompt:
        'Close on the woman massaging nourishing cream into her hands at a sunlit European cafe table, soft glisten on skin, elegant gestures, refined self-care editorial, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium close-up, static',
      composition: 'Hands centered on the table',
      lighting: 'Natural daylight',
      motion: 'Applying and massaging lotion',
      colorPalette: ['#E8DCC4', '#FFFFFF'],
    },
  },
  {
    index: 21, title: 'Cream Collection', startSec: 261, endSec: 282, visualType: 'image',
    narrationHint: 'Keep one in every bag.',
    prompt: {
      positivePrompt:
        'A pristine montage of luxury hand-cream tubes arranged on marble surfaces, bright clean light, minimalist glossy product styling, editorial magazine detail, cool-neutral grade.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Close-up montage, static',
      composition: 'Centered products on marble',
      lighting: 'Bright clean light',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#FFFFFF', '#C0C0C0'],
    },
  },
  {
    index: 22, title: 'Polished Hands', startSec: 282, endSec: 297, visualType: 'video',
    narrationHint: 'Well-kept hands make every gesture elegant.',
    prompt: {
      positivePrompt:
        'The woman’s manicured hands cradle a cappuccino cup at a cafe, soft daylight and creamy bokeh, refined tactile editorial luxury, shallow depth of field, warm grade.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Close-up, static',
      composition: 'Hands and cup centered',
      lighting: 'Soft daylight',
      motion: 'Lifting and sipping coffee',
      colorPalette: ['#8B4513', '#FFFFFF'],
    },
  },
  {
    index: 23, title: 'Tea Ritual', startSec: 297, endSec: 318, visualType: 'video',
    narrationHint: 'Luxury #5 — the morning beverage ritual.',
    prompt: {
      positivePrompt:
        'Slow pour of amber tea from an elegant pot into a fine cup on a warm-lit table, rising steam and golden reflections, calm ceremonial editorial luxury, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium close-up, static',
      composition: 'Teapot and cup centered',
      lighting: 'Warm soft practicals',
      motion: 'Liquid pouring, steam rising',
      colorPalette: ['#D4AF37', '#FFFFFF'],
    },
  },
  {
    index: 24, title: 'Beverage Tools', startSec: 318, endSec: 339, visualType: 'image',
    narrationHint: 'The right tools make it a ceremony.',
    prompt: {
      positivePrompt:
        'A cozy still of elegant tea and coffee equipment grouped on a wooden table, warm practical lighting, artisanal editorial product styling, gold and espresso tones, rich fine detail.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Close-up montage, static',
      composition: 'Grouped objects, rule of thirds',
      lighting: 'Warm practicals',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#8B4513', '#D4AF37'],
    },
  },
  {
    index: 25, title: 'Balcony Moment', startSec: 339, endSec: 347, visualType: 'video',
    narrationHint: 'Then enjoy it slowly, somewhere lovely.',
    prompt: {
      positivePrompt:
        'The woman sips tea on a bright balcony, calm and unhurried, soft natural daylight, coastal air, serene editorial luxury, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Subject right-third, open view left',
      lighting: 'Natural daylight',
      motion: 'Sipping tea, light breeze',
      colorPalette: ['#ADD8E6', '#FFFFFF'],
    },
  },
  {
    index: 26, title: 'Navy Silk', startSec: 347, endSec: 364, visualType: 'image',
    narrationHint: 'Luxury #6 — a matching sleepwear set.',
    prompt: {
      positivePrompt:
        'A neatly styled navy silk pajama set laid on a made bed in soft natural light, classic editorial still, crisp piping detail and gentle sheen, clean minimalist composition.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Set centered on the bed',
      lighting: 'Soft natural light',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#000080', '#FFFFFF'],
    },
  },
  {
    index: 27, title: 'Sleepwear Variety', startSec: 364, endSec: 383, visualType: 'image',
    narrationHint: 'Own a few, in colors you love.',
    prompt: {
      positivePrompt:
        'A bright curated montage of silk pajama sets in blush and powder-blue on clean interiors, even soft light, tasteful editorial styling, delicate sheen, generous negative space.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shots, static',
      composition: 'Centered sets',
      lighting: 'Bright even light',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#FFC0CB', '#ADD8E6'],
    },
  },
  {
    index: 28, title: 'Evening Reading', startSec: 383, endSec: 392, visualType: 'video',
    narrationHint: 'End the day in something beautiful.',
    prompt: {
      positivePrompt:
        'The woman in deep-red silk pajamas reads on a library sofa under warm low-key light, turning a page, gold lamp glow, sophisticated intimate editorial luxury, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Subject centered with a warm lamp',
      lighting: 'Warm low-key lighting',
      motion: 'Turning pages',
      colorPalette: ['#8B0000', '#D4AF37'],
    },
  },
  {
    index: 29, title: 'Hydration Reprise', startSec: 392, endSec: 407, visualType: 'video',
    narrationHint: 'And still — begin and end with water.',
    prompt: {
      positivePrompt:
        'The woman in light-blue silk pajamas drinks water in a bright hotel room, echoing the opening, natural window light, peaceful editorial luxury, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Subject centered by the window',
      lighting: 'Natural light',
      motion: 'Drinking water, curtains breathing',
      colorPalette: ['#ADD8E6', '#FFFFFF'],
    },
  },
  {
    index: 30, title: 'Writing Ritual', startSec: 407, endSec: 433, visualType: 'video',
    narrationHint: 'Luxury #7 — a heavy, well-made pen.',
    prompt: {
      positivePrompt:
        'The woman writes in a leather journal with a weighty crafted fountain pen at a warm-lit library desk, deliberate graceful strokes, focused editorial luxury, shallow depth of field, gold accents.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium close-up, static',
      composition: 'Subject and journal centered',
      lighting: 'Warm focused desk light',
      motion: 'Writing, pen gliding across the page',
      colorPalette: ['#8B4513', '#D4AF37'],
    },
  },
  {
    index: 31, title: 'Pen Collection', startSec: 433, endSec: 453, visualType: 'image',
    narrationHint: 'A tool worth keeping for decades.',
    prompt: {
      positivePrompt:
        'A refined still of luxury fountain pens resting on a desk and in presentation boxes, focused highlights on polished barrels, authoritative editorial product photography, black and gold grade.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Close-up montage, static',
      composition: 'Centered products, shallow DOF',
      lighting: 'Focused highlights',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#000000', '#D4AF37'],
    },
  },
  {
    index: 32, title: 'Gallery Style', startSec: 453, endSec: 473, visualType: 'video',
    narrationHint: 'Luxury #8 — the perfect white shirt.',
    prompt: {
      positivePrompt:
        'The woman in a crisp tailored white shirt walks through a bright minimalist art gallery, clean daylight, chic confident editorial fashion cinematography, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, slow tracking',
      composition: 'Subject within airy gallery space',
      lighting: 'Bright clean light',
      motion: 'Walking through the gallery',
      colorPalette: ['#FFFFFF', '#000000'],
    },
  },
  {
    index: 33, title: 'Shirt Styling', startSec: 473, endSec: 494, visualType: 'image',
    narrationHint: 'One shirt, styled a dozen ways.',
    prompt: {
      positivePrompt:
        'A clean montage of a white button-down styled different ways against minimalist backgrounds, bright natural light, versatile editorial fashion stills, crisp fabric detail, generous negative space.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shots, static',
      composition: 'Centered wardrobe stills',
      lighting: 'Bright natural light',
      motion: 'None (Ken Burns slow zoom in render)',
      colorPalette: ['#FFFFFF', '#ADD8E6'],
    },
  },
  {
    index: 34, title: 'Professional Look', startSec: 494, endSec: 505, visualType: 'video',
    narrationHint: 'It reads as effortless competence.',
    prompt: {
      positivePrompt:
        'The woman in a tailored white shirt stands composed in a bright modern boardroom, clean office light, poised competent editorial presence, shallow depth of field, cool-neutral grade.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Medium shot, static',
      composition: 'Subject centered in the room',
      lighting: 'Clean office light',
      motion: 'Speaking, subtle gestures',
      colorPalette: ['#FFFFFF', '#2F4F4F'],
    },
  },
  {
    index: 35, title: 'Elegant Outro', startSec: 505, endSec: 513, visualType: 'video',
    narrationHint: 'Small luxuries, chosen daily, become a life.',
    prompt: {
      positivePrompt:
        'A warm golden montage reprising every luxury — sipping tea, drifting silk, falling droplet, blooming peonies — soft dissolves, magnificent resolving editorial luxury, shallow depth of field.',
      negativePrompt: NEG,
      overlayPrompt:
        'A tight editorial detail insert in the same warm soft-luxury grade — a signature object, texture, or grooming close-up in portrait framing, shallow depth of field, magazine-quality.',
      overlayNegativePrompt: NEG,
      overlayPrompt2: null,
      camera: 'Mixed, gentle moves',
      composition: 'Mixed reprise framing',
      lighting: 'Warm golden light',
      motion: 'Sipping, drifting silk, macro droplet',
      colorPalette: ['#D4AF37', '#FFFFFF'],
    },
  },
];

export const REFERENCE_LUXURY_DEMO = {
  meta: {
    source: 'Gemini video analysis of a reference luxury faceless YouTube video',
    totalDurationSec: 513,
    sceneCount: REFERENCE_LUXURY_SCENES.length,
    aspectRatio: '16:9' as const,
    averageShotLengthSec: 13.8,
  },
  analysis: REFERENCE_LUXURY_ANALYSIS,
  scenes: REFERENCE_LUXURY_SCENES,
} as const;
