import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, upsertUser } from "@/lib/store";

/**
 * Marks the current user's onboarding tutorial as seen. The client fires
 * this when the modal is dismissed (either close button or "Don't show
 * again"), so the flag persists across sign-outs and browser changes.
 *
 * No body required — the timestamp is set server-side, and the target is
 * always the current session user (never an arbitrary ID). Idempotent:
 * calling twice just updates the timestamp, no error.
 */
export async function POST() {
  const session = await getSession();
  const sessionUser = session?.user;
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  // Re-read from the store rather than trusting the session copy — the
  // session was cached earlier and may not have the latest field state.
  const fresh = getUserById(sessionUser.id);
  if (!fresh) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = { ...fresh, onboardingSeenAt: new Date().toISOString() };
  upsertUser(updated);
  return NextResponse.json({ user: updated });
}
