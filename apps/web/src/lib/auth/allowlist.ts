/**
 * Access allowlist — this is a private, invite-only tool for a fixed set of
 * users (no public sign-up). Only these email addresses may sign in and use the
 * app; every other authenticated session is rejected server-side (dashboard
 * guard + API `requireUser`).
 *
 * Override at deploy time with the `ALLOWED_EMAILS` env var (comma-separated).
 * Emails are not secrets, so they can live in code as the default.
 */
const DEFAULT_ALLOWED = ['admin@classy.com', 'demo@example.com'];

export const ALLOWED_EMAILS: readonly string[] = (
  process.env.ALLOWED_EMAILS ?? DEFAULT_ALLOWED.join(',')
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** True only for the fixed set of permitted accounts (case-insensitive). */
export function isEmailAllowed(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase());
}
