import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditAnyInventoryDept } from "@/lib/inventory-permissions";
import { setInventoryDates } from "@/lib/shadow-events";
import { logAudit } from "@/lib/store";

/**
 * PUT — set/override the inventory-specific date range on a booking.
 * Body: { start?: string, end?: string } — both YYYY-MM-DD, both
 * optional (empty/missing value clears that bound; the UI surfaces
 * fall back to the Sheet's own StartDate/EndDate for any empty bound).
 *
 * Auth: a caller who can edit at least ONE inventory dept on this
 * booking can set the shared date range — the range isn't scoped to a
 * specific dept, it applies to the whole event's inventory view, so
 * gating on per-dept edit would mean a Sales Admin couldn't bump the
 * teardown date even though they own the inventory section. Using
 * canEditAnyInventoryDept keeps the rule aligned with "who can mutate
 * inventory state on this event at all".
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeDate(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!ISO_DATE_RE.test(trimmed)) return undefined;
  return trimmed;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canEditAnyInventoryDept(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { bookingId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    start?: unknown;
    end?: unknown;
  };
  const start = sanitizeDate(body.start);
  const end = sanitizeDate(body.end);

  // Reject an obviously-backwards range so we don't silently store it.
  if (start && end && start > end) {
    return NextResponse.json(
      { error: "Start date must be on or before end date." },
      { status: 400 },
    );
  }

  const updated = setInventoryDates(bookingId, { start, end }, user.id);
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details: `Inventory date range set: ${start ?? "(sheet)"} → ${end ?? "(sheet)"}`,
  });

  return NextResponse.json({ inventoryDates: updated.inventoryDates });
}
