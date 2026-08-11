import { cookies, headers } from "next/headers";
import type { Session } from "./types";
import { getUserByEmail, getUserById, provisionEntraUser, upsertUser } from "./store";
import { auth } from "./better-auth";

const SESSION_COOKIE = "km_session";

/**
 * Dual auth: real Microsoft Entra ID SSO (via Better Auth) checked first,
 * with the mock "test environment" cookie session (see login-panel.tsx) as a
 * fallback for exploring KEMS without an Entra account. Everything else in
 * the app depends only on `getSession` / `signInAsUserId` / `signOut`.
 */

export async function getSession(): Promise<Session | null> {
  // 1. Real Entra ID session takes priority.
  const entraSession = await auth.api.getSession({ headers: await headers() });
  const entraEmail = entraSession?.user?.email;
  if (entraEmail) {
    const user =
      getUserByEmail(entraEmail) ??
      provisionEntraUser({ email: entraEmail, fullName: entraSession.user?.name ?? entraEmail });
    if (user.status === "disabled") return null;
    return { user, issuedAt: entraSession.session.createdAt.toISOString() };
  }

  // 2. Fall back to the mock/test-environment cookie session.
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { userId: string; issuedAt: string };
    const user = getUserById(parsed.userId);
    if (!user || user.status === "disabled") return null;
    return { user, issuedAt: parsed.issuedAt };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}

export async function signInAsUserId(userId: string): Promise<Session | null> {
  const user = getUserById(userId);
  if (!user || user.status === "disabled") return null;
  // In the mock scaffold, INVITED users must complete /set-password before signing in.
  if (user.verificationStatus === "INVITED") return null;

  upsertUser({ ...user, lastLoginAt: new Date().toISOString() });

  const jar = await cookies();
  const issuedAt = new Date().toISOString();
  jar.set(SESSION_COOKIE, JSON.stringify({ userId, issuedAt }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h
  });
  return { user, issuedAt };
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  // Also clear Better Auth's own session cookie (dev + secure/prod variants)
  // so signing out ends an Entra ID session too, not just the test-environment one.
  jar.delete("better-auth.session_token");
  jar.delete("__Secure-better-auth.session_token");
}
