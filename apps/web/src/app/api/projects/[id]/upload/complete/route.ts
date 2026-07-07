import { CompleteUploadSchema, UuidSchema } from '@yulia/core';
import { UploadService } from '@yulia/domain';
import { route } from '@/lib/api/route';
import { jsonOk } from '@/lib/api/http';

export const runtime = 'nodejs';

type Params = { id: string };

/**
 * POST /api/projects/:id/upload/complete
 * Confirm the R2 object exists, mark the asset stored, and advance the project
 * to TRANSCRIBING (Phase 3 enqueues the transcription job).
 */
export const POST = route<Params>(async ({ req, ctx, user, params }) => {
  const projectId = UuidSchema.parse(params.id);
  const { assetId } = CompleteUploadSchema.parse(await req.json());
  const service = new UploadService(ctx);
  const project = await service.completeUpload(user.id, projectId, assetId);
  return jsonOk({ project });
});
