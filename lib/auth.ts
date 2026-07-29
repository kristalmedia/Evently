import { cookies } from "next/headers";
import type { Session } from "./types";
import { getUserById, upsertUser } from "./store";

const SESSION_COOKIE = "km_session";

/**
 * MOCK AUTH SCAFFOLD.
 * -----------------------------------------------------------------------------
 * The API surface here (`getSession`, `signInAsUserId`, `signOut`) is the
 * intended contract. When you're ready to swap in Microsoft Entra ID, keep this
 * file's exports the same and rewrite the internals to validate a real JWT /
 * NextAuth session. Everything else in the app depends only on these functions.
 * -----------------------------------------------------------------------------
 */

export async function getSession(): Promise<Session | null> {
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
}
