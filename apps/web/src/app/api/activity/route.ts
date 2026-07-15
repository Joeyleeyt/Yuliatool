import { ProjectService } from '@yulia/domain';
import { route } from '@/lib/api/route';
import { jsonOk } from '@/lib/api/http';

export const runtime = 'nodejs';

/** GET /api/activity — cross-project activity feed for the caller's productions. */
export const GET = route(async ({ ctx, user }) => {
  return jsonOk({ activity: await new ProjectService(ctx).activity(user.id, 50) });
});
