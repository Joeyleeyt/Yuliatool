import { UuidSchema } from '@yulia/core';
import { ProjectReadService } from '@yulia/domain';
import { route } from '@/lib/api/route';
import { jsonOk } from '@/lib/api/http';

export const runtime = 'nodejs';
type Params = { id: string };

export const GET = route<Params>(async ({ ctx, user, params }) => {
  const id = UuidSchema.parse(params.id);
  return jsonOk(await new ProjectReadService(ctx).render(id, user.id));
});
