import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditHr } from "@/lib/kotg-permissions";
import {
  getOrCreateShadowEvent,
  markHrComplete,
  updateShadowEvent,
} from "@/lib/shadow-events";
import type {
  MealTickMap,
  OvertimeLine,
} from "@/lib/shadow-events-types";
import { logAudit } from "@/lib/store";

/** Departments whose staff are eligible for overtime. Matched
 *  case-sensitively against User.department (values in lib/types.ts). */
const OT_ELIGIBLE_DEPTS: readonly string[] = ["IT", "Technical"];

/**
 * PUT — replace the HR block with (a) a per-slot meal-tick map and
 *       (b) an overtime list, optionally marking HR complete.
 *
 *       Meal allowance is derived from the ticks (BND 5 per half, both
 *       halves = BND 10) so the client only sends the flags.
 *
 *       Overtime is HR-typed per row; the server validates staffDept is
 *       in the OT-eligible list, refusing the whole PUT on the first bad
 *       row so the client can point HR at the offending line rather than
 *       silently dropping it.
 *
 *       Marking complete flips the shadow record's kemsStatus from
 *       HR_UNLOCKED → FINANCE_UNLOCKED. Idempotent — a repeat with
 *       complete:true is a no-op.
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
    mealTicks?: MealTickMap;
    overtime?: OvertimeLine[];
    complete?: boolean;
  };

  const shadow = getOrCreateShadowEvent(bookingId);
  if (!canEditHr(user, shadow.kemsStatus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const mealTicks: MealTickMap =
    body.mealTicks && typeof body.mealTicks === "object" ? body.mealTicks : {};
  const overtime: OvertimeLine[] = Array.isArray(body.overtime) ? body.overtime : [];

  const badOt = overtime.find((l) => !OT_ELIGIBLE_DEPTS.includes(l.staffDept));
  if (badOt) {
    return NextResponse.json(
      {
        error: `Overtime is limited to ${OT_ELIGIBLE_DEPTS.join(" and ")} staff — got dept "${badOt.staffDept}" for ${badOt.staffName}.`,
      },
      { status: 400 },
    );
  }

  let next = updateShadowEvent(bookingId, {
    hr: { ...shadow.hr, mealTicks, overtime },
  });

  if (body.complete === true) {
    next = markHrComplete(bookingId, user.id);
  }

  const mealCount = Object.values(mealTicks).reduce(
    (n, t) => n + (t.am ? 1 : 0) + (t.pm ? 1 : 0),
    0,
  );
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details: `HR saved (${mealCount} meal ticks, ${overtime.length} OT rows${
      body.complete ? " + marked complete" : ""
    }; kemsStatus → ${next.kemsStatus})`,
  });
  return NextResponse.json({ shadow: next });
}
