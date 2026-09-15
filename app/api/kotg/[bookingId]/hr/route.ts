import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditHr } from "@/lib/kotg-permissions";
import {
  getOrCreateShadowEvent,
  markHrComplete,
  updateShadowEvent,
} from "@/lib/shadow-events";
import type { HrFinancialLine } from "@/lib/shadow-events-types";
import { logAudit } from "@/lib/store";

/**
 * PUT — replace the HR block's lines (overtime + meal-allowance), and
 *       optionally mark HR complete. Marking complete flips the shadow
 *       record's kemsStatus from HR_UNLOCKED → FINANCE_UNLOCKED (via the
 *       shadow store's recompute) so the Finance Lead is next in line.
 *
 *       Auth: canEditHr must hold at the record's kemsStatus.
 *
 *       Complete is idempotent — a second call with complete:true is a
 *       no-op (shadow store handles that internally).
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { bookingId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    lines?: HrFinancialLine[];
    complete?: boolean;
  };

  const shadow = getOrCreateShadowEvent(bookingId);
  if (!canEditHr(user, shadow.kemsStatus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Line validation — reject if any line has neither OVERTIME nor
  // MEAL_ALLOWANCE (the HR block is scoped to those two kinds only).
  const lines: HrFinancialLine[] = Array.isArray(body.lines) ? body.lines : [];
  const bad = lines.find(
    (l) => l.kind !== "OVERTIME" && l.kind !== "MEAL_ALLOWANCE",
  );
  if (bad) {
    return NextResponse.json(
      { error: `HR line kind must be OVERTIME or MEAL_ALLOWANCE, got "${bad.kind}"` },
      { status: 400 },
    );
  }

  // Save the lines first (whether or not `complete` is being flipped).
  let next = updateShadowEvent(bookingId, {
    hr: { ...shadow.hr, lines },
  });

  if (body.complete === true) {
    next = markHrComplete(bookingId, user.id);
  }

  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details: `HR lines saved (${lines.length} rows${
      body.complete ? " + marked complete" : ""
    }; kemsStatus → ${next.kemsStatus})`,
  });
  return NextResponse.json({ shadow: next });
}
