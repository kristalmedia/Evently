/**
 * Whether the "test environment" login flow (seeded-user sign-in without a
 * password) is enabled in the current build. Controls both:
 *   - The UI panel on /login and the dev RoleSwitcher in the top bar.
 *   - The server-side API routes that back them: /api/auth/login and
 *     /api/dev/seed-users. Both refuse when this is false, so hiding the
 *     UI is backed by a real server-side gate (otherwise anyone who knew
 *     the route could still POST a userId and skip Entra ID).
 *
 * Read from NEXT_PUBLIC_ENABLE_TEST_LOGIN so the same value is available
 * in both server and client components — NEXT_PUBLIC_ vars are inlined at
 * build time. Default is OFF so a stock production build is safe by default;
 * set NEXT_PUBLIC_ENABLE_TEST_LOGIN=1 in .env.local (dev) or on the staging
 * VPS to turn it on.
 */
export const TEST_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "1";
