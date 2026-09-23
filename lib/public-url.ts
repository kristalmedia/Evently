/**
 * Build absolute URLs (`https://apps.kristal.media/evently/events/BOOK-123`)
 * for cases where a relative path won't do — chiefly links sent inside
 * outgoing emails, since email clients can't resolve `/events/...` against
 * anything meaningful.
 *
 * Source of the app's public base URL, in order of preference:
 *   1. `EVENTLY_PUBLIC_URL` — explicit, purpose-built env var.
 *   2. `BETTER_AUTH_URL` — derived by stripping the trailing `/api/auth`
 *      that better-auth needs (see app/api/auth/[...all]/route.ts for why
 *      that suffix is there). Convenient in the common case where an admin
 *      has already configured BETTER_AUTH_URL correctly for their env and
 *      shouldn't have to duplicate it into a second var.
 *
 * If neither is set, we return the given path unchanged (the caller may
 * still choose to send it — email clients will render it as literal text
 * rather than a clickable link, which is at least honest about the
 * misconfiguration). This is a best-effort helper; it never throws.
 */

function getPublicOrigin(): string | null {
  const explicit = process.env.EVENTLY_PUBLIC_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  const authUrl = process.env.BETTER_AUTH_URL?.trim();
  if (authUrl) {
    // BETTER_AUTH_URL is expected to end in "/api/auth" — see the
    // long-form explanation in app/api/auth/[...all]/route.ts. Peel that
    // suffix off (case-insensitively, whether or not it has a trailing
    // slash) to recover the app's public base URL.
    const stripped = authUrl.replace(/\/api\/auth\/?$/i, "");
    return stripTrailingSlash(stripped);
  }

  return null;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Turn an in-app path like "/events/BOOK-123" into an absolute URL. If the
 * public origin can't be determined, returns the path unchanged so callers
 * can decide whether to send it anyway.
 */
export function publicUrl(path: string): string {
  const origin = getPublicOrigin();
  if (!origin) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}
