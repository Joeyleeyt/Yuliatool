import { z } from 'zod';
import { LIMITS } from '../constants/pipeline.js';

const allowed = LIMITS.allowedAudioMimeTypes as readonly string[];

/** Request body for issuing a signed voiceover upload URL. */
export const CreateVoiceoverUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z
    .string()
    .refine((v) => allowed.includes(v), { message: 'Unsupported audio content type' }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(LIMITS.maxAudioBytes, { message: 'Audio file exceeds size limit' }),
});
export type CreateVoiceoverUploadInput = z.infer<typeof CreateVoiceoverUploadSchema>;

/** Client calls this after the PUT to R2 succeeds. */
export const CompleteUploadSchema = z.object({
  assetId: z.string().uuid(),
});
export type CompleteUploadInput = z.infer<typeof CompleteUploadSchema>;
