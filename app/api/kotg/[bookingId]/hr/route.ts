import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditHr, canEditHrOvertime } from "@/lib/kotg-permissions";
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
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { announceConfirmedEvent } from "@/lib/event-notifications";

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

  // Split permission: canEditHr covers meal + complete (HR-only);
  // canEditHrOvertime is broader and includes Finance Lead during
  // FINANCE_UNLOCKED so Putri can adjust the OT amounts. A viewer must
  // hold at least one of them to reach this endpoint.
  const canMealOrComplete = canEditHr(user, shadow.kemsStatus);
  const canOt = canEditHrOvertime(user, shadow.kemsStatus);
  if (!canMealOrComplete && !canOt) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submittedMealTicks: MealTickMap =
    body.mealTicks && typeof body.mealTicks === "object" ? body.mealTicks : {};
  const submittedOvertime: OvertimeLine[] = Array.isArray(body.overtime)
    ? body.overtime
    : [];

  // A caller without canEditHr can't alter meal ticks or flip the
  // completed flag — preserve the server-side truth for those two.
  const mealTicks = canMealOrComplete ? submittedMealTicks : shadow.hr.mealTicks;
  // A caller without canEditHrOvertime can't alter OT lines. In
  // practice this shouldn't happen (the client only shows OT inputs
  // when the viewer has canOt), but the server is the enforcement
  // point — never trust the client.
  const overtime = canOt ? submittedOvertime : shadow.hr.overtime;

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

  // Only canEditHr users can mark HR complete; a Finance Lead OT edit
  // must not implicitly close the HR block on them.
  //
  // Fire the "event confirmed" all-hands fan-out ONCE, on the transition
  // from not-completed → completed. markHrComplete is idempotent so a
  // repeat call is a no-op on the shadow record, but the notification
  // would fire again if we keyed off the current flag — hence the
  // pre-write snapshot below.
  const wasHrCompleted = shadow.hr.completed;
  if (body.complete === true && canMealOrComplete) {
    next = markHrComplete(bookingId, user.id);
    if (!wasHrCompleted && next.hr.completed) {
      // Look up the booking from the Sheet to build the announcement
      // payload (name, client, venue, dates). If the Sheet fetch fails,
      // the confirmation still saves — we just skip the email so a
      // Sheets outage never blocks HR from marking complete.
      try {
        const bookings = await getKotgBookingsWithClients();
        const b = bookings.find((x) => x.booking.BookingID === bookingId);
        if (b) {
          void announceConfirmedEvent(b).catch((err) => {
            console.error(
              `announceConfirmedEvent failed for ${bookingId}:`,
              err,
            );
          });
        }
      } catch (err) {
        console.error(
          `Sheet fetch failed for confirmed-event notification ${bookingId}:`,
          err,
        );
      }
    }
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
      body.complete && canMealOrComplete ? " + marked complete" : ""
    }; kemsStatus → ${next.kemsStatus})`,
  });
  return NextResponse.json({ shadow: next });
}
