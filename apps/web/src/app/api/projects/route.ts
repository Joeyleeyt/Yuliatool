import { CreateProjectSchema, ProjectListQuerySchema } from '@yulia/core';
import { ProjectService } from '@yulia/domain';
import { route } from '@/lib/api/route';
import { jsonOk } from '@/lib/api/http';

export const runtime = 'nodejs';

/** GET /api/projects — list the caller's projects (paginated, filterable). */
export const GET = route(async ({ req, ctx, user }) => {
  const url = new URL(req.url);
  const query = ProjectListQuerySchema.parse(Object.fromEntries(url.searchParams));
  const service = new ProjectService(ctx);
  return jsonOk(await service.list(user.id, query));
});

/** POST /api/projects — create a project. */
export const POST = route(
  async ({ req, ctx, user }) => {
    const body = CreateProjectSchema.parse(await req.json());
    const service = new ProjectService(ctx);
    const project = await service.create(user.id, body);
    return jsonOk({ project }, { status: 201 });
  },
  { rateLimit: { key: 'projects:create', limit: 30, windowSec: 60 } },
);
