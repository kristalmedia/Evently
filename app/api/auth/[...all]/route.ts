import { NextRequest } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/better-auth";

/**
 * When the app is served under NEXT_BASE_PATH (e.g. "/evently"), Next.js
 * strips that prefix from `req.url` before this route handler ever sees the
 * request — that's how basePath auto-prefixing works for everything else.
 *
 * better-auth, however, derives a single `ctx.baseURL` from BETTER_AUTH_URL
 * at startup and uses THAT SAME value for two different jobs: (1) matching
 * the incoming (already-stripped) request path against its own routes, and
 * (2) building the absolute OAuth redirect_uri it sends to providers like
 * Microsoft. Job (1) needs BETTER_AUTH_URL without "/evently" (to match what
 * Next actually delivers); job (2) needs it WITH "/evently" (so Microsoft
 * redirects back to a URL that actually exists). No single value satisfies
 * both — see the write-up in git history for the investigation.
 *
 * The fix: restore the stripped prefix on the request URL ourselves before
 * handing it to better-auth's handler, so ITS view of the request matches
 * BETTER_AUTH_URL (which stays "https://.../evently", correct for building
 * the external redirect_uri). This is the only place in the app that needs
 * to know about this quirk.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function restoreBasePath(req: NextRequest): NextRequest {
  if (!BASE_PATH) return req;
  const url = new URL(req.url);
  if (url.pathname.startsWith(BASE_PATH)) return req;
  url.pathname = `${BASE_PATH}${url.pathname}`;
  return new NextRequest(url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    // Node's fetch (undici) requires this when a request has a streamed body.
    duplex: "half",
  });
}

const { GET: authGET, POST: authPOST } = toNextJsHandler(auth);

export function GET(req: NextRequest) {
  return authGET(restoreBasePath(req));
}

export function POST(req: NextRequest) {
  return authPOST(restoreBasePath(req));
}
