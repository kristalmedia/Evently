import { betterAuth } from "better-auth";
import { memoryAdapter } from "@better-auth/memory-adapter";
import type { MicrosoftEntraIDProfile } from "@better-auth/core/social-providers";

/**
 * Better Auth's own user/session/account records, kept in a plain in-memory
 * object — matches this project's existing "mock scaffold" philosophy (see
 * lib/store.ts) with zero new dependencies. Resets on server restart, same
 * as the rest of the app's data.
 *
 * Evently's own User records (role, department, verificationStatus, etc.) live
 * separately in lib/store.ts and are reconciled by email in lib/auth.ts —
 * Better Auth here is only responsible for the OAuth handshake itself.
 *
 * The memory adapter requires each model's table to already exist as an
 * array on this object — it doesn't lazily create missing ones, it throws
 * ("Model account not found in the DB") instead. These are Better Auth's
 * default core model names (see @better-auth/core/src/db/get-tables.ts).
 *
 * Anchored to globalThis — same pattern as lib/store.ts's `store` — so that
 * Next.js dev-mode module reloading (each route compiles independently on
 * first visit) doesn't wipe an already-signed-in session just because a page
 * you haven't visited yet triggers a fresh evaluation of this module.
 */
const g = globalThis as unknown as { __kristal_better_auth_db?: Record<string, unknown[]> };
const memoryDB: Record<string, unknown[]> =
  g.__kristal_better_auth_db ??
  (g.__kristal_better_auth_db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  });

/**
 * Entra ID doesn't always emit a plain `email` claim for managed/work
 * accounts. Fall back through the claims that reliably carry an email-shaped
 * identifier for org accounts, in order of trustworthiness.
 */
function extractEmail(profile: MicrosoftEntraIDProfile): string | null {
  return (
    profile.email ??
    profile.verified_primary_email?.[0] ??
    profile.upn ??
    profile.preferred_username ??
    null
  );
}

function createAuth() {
  return betterAuth({
    database: memoryAdapter(memoryDB),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    // `next dev` silently falls back to another port when BETTER_AUTH_URL's
    // port is already taken (e.g. 3000 → 3001), which otherwise makes Better
    // Auth reject the request as a cross-origin CSRF attempt. Trust a small
    // range of common local dev ports in addition to the configured URL.
    trustedOrigins:
      process.env.NODE_ENV === "production"
        ? undefined
        : Array.from({ length: 6 }, (_, i) => `http://localhost:${3000 + i}`),
    socialProviders: {
      microsoft: {
        clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
        tenantId: process.env.AZURE_AD_TENANT_ID,
        // Always show the full interactive Microsoft sign-in screen (including
        // MFA) instead of silently reusing an existing browser SSO session —
        // "login" tells Entra ID to disregard any active session for this
        // specific authorization request.
        prompt: "login",
        mapProfileToUser(profile: MicrosoftEntraIDProfile) {
          const email = extractEmail(profile);
          return {
            email,
            name: profile.name,
            emailVerified: true,
          };
        },
      },
    },
  });
}

// Same globalThis-anchoring as memoryDB above — betterAuth() must only run
// once per process, otherwise a fresh instance (with its own closures over
// a fresh memoryAdapter binding) could stop agreeing with itself across
// separately-compiled dev routes even though memoryDB itself is shared.
const authGlobal = globalThis as unknown as { __kristal_better_auth?: ReturnType<typeof createAuth> };
export const auth = authGlobal.__kristal_better_auth ?? (authGlobal.__kristal_better_auth = createAuth());
