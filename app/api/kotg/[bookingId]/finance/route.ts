import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditFinance } from "@/lib/kotg-permissions";
import {
  getOrCreateShadowEvent,
  markFinanceComplete,
  updateShadowEvent,
} from "@/lib/shadow-events";
import type { FinanceFinancialLine } from "@/lib/shadow-events-types";
import { logAudit } from "@/lib/store";

/**
 * PUT — replace the Finance Lead's block (equipment / production /
 *       marketing lines) and optionally mark Finance complete. Marking
 *       complete flips the shadow record's kemsStatus to PUBLISHED (via
 *       the shadow store's recompute), freezing the whole record.
 *
 *       Auth: canEditFinance must hold at the record's kemsStatus
 *       (FINANCE_UNLOCKED — Putri only).
 *
 *       Complete is idempotent — second call with complete:true is a no-op.
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
    lines?: FinanceFinancialLine[];
    complete?: boolean;
  };

  const shadow = getOrCreateShadowEvent(bookingId);
  if (!canEditFinance(user, shadow.kemsStatus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lines: FinanceFinancialLine[] = Array.isArray(body.lines) ? body.lines : [];
  const bad = lines.find(
    (l) => l.group !== "EQUIPMENT_LOGISTICS" && l.group !== "PRODUCTION_MARKETING",
  );
  if (bad) {
    return NextResponse.json(
      {
        error: `Finance line group must be EQUIPMENT_LOGISTICS or PRODUCTION_MARKETING (HR owns OT/meal-allowance); got "${bad.group}"`,
      },
      { status: 400 },
    );
  }

  let next = updateShadowEvent(bookingId, {
    finance: { ...shadow.finance, lines },
  });

  if (body.complete === true) {
    next = markFinanceComplete(bookingId, user.id);
  }

  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details: `Finance lines saved (${lines.length} rows${
      body.complete ? " + marked complete → PUBLISHED" : ""
    })`,
  });
  return NextResponse.json({ shadow: next });
}
