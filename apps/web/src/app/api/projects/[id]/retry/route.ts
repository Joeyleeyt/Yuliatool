import { UuidSchema } from '@yulia/core';
import { ProjectService } from '@yulia/domain';
import { route } from '@/lib/api/route';
import { jsonOk } from '@/lib/api/http';

export const runtime = 'nodejs';
type Params = { id: string };

/** POST /api/projects/:id/retry — resume a FAILED project from where it stalled. */
export const POST = route<Params>(
  async ({ ctx, user, params }) => {
    const id = UuidSchema.parse(params.id);
    const project = await new ProjectService(ctx).retry(id, user.id);
    return jsonOk({ project });
  },
  { rateLimit: { key: 'projects:retry', limit: 20, windowSec: 60 } },
);
