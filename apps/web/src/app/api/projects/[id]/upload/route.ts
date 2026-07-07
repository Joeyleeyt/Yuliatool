import { CreateVoiceoverUploadSchema, UuidSchema } from '@yulia/core';
import { UploadService } from '@yulia/domain';
import { route } from '@/lib/api/route';
import { jsonOk } from '@/lib/api/http';

export const runtime = 'nodejs';

type Params = { id: string };

/**
 * POST /api/projects/:id/upload
 * Issue a signed R2 PUT URL for the voiceover and move the project to
 * UPLOADING_AUDIO. Client PUTs the file directly to R2, then calls /complete.
 */
export const POST = route<Params>(
  async ({ req, ctx, user, params }) => {
    const projectId = UuidSchema.parse(params.id);
    const body = CreateVoiceoverUploadSchema.parse(await req.json());
    const service = new UploadService(ctx);
    const ticket = await service.createVoiceoverUpload(user.id, projectId, body);
    return jsonOk(ticket, { status: 201 });
  },
  { rateLimit: { key: 'uploads:create', limit: 20, windowSec: 60 } },
);
