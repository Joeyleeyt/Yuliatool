// Liveness probe for Fly.io. Intentionally dependency-free and unauthenticated.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', ts: new Date().toISOString() });
}
