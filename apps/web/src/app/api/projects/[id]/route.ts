import { UpdateProjectSchema, UuidSchema } from '@yulia/core';
import { ProjectService } from '@yulia/domain';
import { route } from '@/lib/api/route';
import { jsonOk } from '@/lib/api/http';

export const runtime = 'nodejs';

type Params = { id: string };

/** GET /api/projects/:id */
export const GET = route<Params>(async ({ ctx, user, params }) => {
  const id = UuidSchema.parse(params.id);
  const service = new ProjectService(ctx);
  return jsonOk({ project: await service.get(id, user.id) });
});

/** PATCH /api/projects/:id */
export const PATCH = route<Params>(async ({ req, ctx, user, params }) => {
  const id = UuidSchema.parse(params.id);
  const body = UpdateProjectSchema.parse(await req.json());
  const service = new ProjectService(ctx);
  return jsonOk({ project: await service.update(id, user.id, body) });
});

/** DELETE /api/projects/:id — removes DB rows (cascade) + all R2 objects. */
export const DELETE = route<Params>(async ({ ctx, user, params }) => {
  const id = UuidSchema.parse(params.id);
  const service = new ProjectService(ctx);
  await service.remove(id, user.id);
  return jsonOk({ ok: true });
});
