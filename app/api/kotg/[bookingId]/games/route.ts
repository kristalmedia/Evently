import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import {
  clearGamesSelection,
  setGamesSelection,
} from "@/lib/shadow-events";
import {
  AVAILABLE_GAMES,
  type GameName,
} from "@/lib/shadow-events-types";
import { logAudit } from "@/lib/store";

/**
 * Sales-owned optional-games selection on a booking.
 *
 *   PUT     — replace the selection wholesale with { selectedGames: GameName[] }.
 *             Unknown game names are silently dropped; duplicates deduped;
 *             order normalised to AVAILABLE_GAMES order so clients can't
 *             reshuffle the server's canonical display sequence.
 *   DELETE  — explicitly clear the whole selection. Equivalent to a PUT
 *             with an empty array, but stamps a dedicated audit entry
 *             ("cleared") so the trail reflects intent rather than
 *             looking like a save-with-nothing-ticked.
 *
 * Auth: SALES_ADMIN only. Super Admin does NOT bypass (same pattern as
 * the authority-approval route; the whole feature is Sales-restricted
 * per spec). Non-Sales viewers can still READ this field via the event
 * detail page's own render — this route is write-only.
 */

const VALID_GAMES = new Set<string>(AVAILABLE_GAMES);

function sanitizeSelection(raw: unknown): GameName[] {
  if (!Array.isArray(raw)) return [];
  const picked = new Set<GameName>();
  for (const v of raw) {
    if (typeof v === "string" && VALID_GAMES.has(v)) {
      picked.add(v as GameName);
    }
  }
  // Return in AVAILABLE_GAMES order so the stored list is deterministic.
  return AVAILABLE_GAMES.filter((g) => picked.has(g));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasRole(user, "SALES_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { bookingId } = await params;
  const body = (await req.json().catch(() => ({}))) as { selectedGames?: unknown };
  const selectedGames = sanitizeSelection(body.selectedGames);

  const updated = setGamesSelection(
    bookingId,
    { selectedGames },
    user.id,
  );
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details:
      selectedGames.length === 0
        ? "Games selection saved (none ticked)"
        : `Games selection saved: ${selectedGames.join(", ")}`,
  });

  return NextResponse.json({ games: updated.games });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasRole(user, "SALES_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { bookingId } = await params;
  const updated = clearGamesSelection(bookingId, user.id);
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details: "Games selection cleared",
  });

  return NextResponse.json({ games: updated.games });
}
