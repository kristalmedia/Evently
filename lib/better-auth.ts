import { betterAuth } from "better-auth";
import { memoryAdapter } from "@better-auth/memory-adapter";
import type { MicrosoftEntraIDProfile } from "@better-auth/core/social-providers";

/**
 * Better Auth's own user/session/account records, kept in a plain in-memory
 * object — matches this project's existing "mock scaffold" philosophy (see
 * lib/store.ts) with zero new dependencies. Resets on server restart, same
 * as the rest of the app's data.
 *
 * KEMS's own User records (role, department, verificationStatus, etc.) live
 * separately in lib/store.ts and are reconciled by email in lib/auth.ts —
 * Better Auth here is only responsible for the OAuth handshake itself.
 */
const memoryDB: Record<string, unknown[]> = {};

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

export const auth = betterAuth({
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
      mapProfileToUser(profile) {
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
