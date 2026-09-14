import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasAnyRole } from "@/lib/permissions";
import {
  getEventById,
  getUserById,
  logAudit,
  pushNotificationTo,
  updateEvent,
} from "@/lib/store";

/**
 * Reject the initial budget — Finance Lead only. Reverts the event to
 * DRAFT with a stamped denial reason on s11 so the submitter sees why
 * the budget was sent back. Same shape as the existing /deny handler
 * (which handles the later Rudy / Jenny stages) but scoped to the
 * BUDGET_PENDING pre-approval gate.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasAnyRole(user, ["FINANCE_LEAD", "SUPER_ADMIN"])) {
    return NextResponse.json(
      { error: "Only the Finance Lead can reject the initial budget." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  if (!body.reason || body.reason.trim().length < 10) {
    return NextResponse.json(
      { error: "Justification (10+ chars) is required" },
      { status: 400 }
    );
  }

  const { id } = await params;
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.status !== "BUDGET_PENDING") {
    return NextResponse.json(
      { error: `Event is not awaiting budget approval (current status: ${event.status}).` },
      { status: 409 }
    );
  }

  const currentSignoff = event.s11 ?? { entries: [] };
  const updated = updateEvent(id, {
    status: "DRAFT",
    s11: {
      ...currentSignoff,
      entries: currentSignoff.entries ?? [],
      denialReason: body.reason.trim(),
      deniedBy: user.fullName,
      deniedAt: new Date().toISOString(),
    },
  });

  // Alert the event's original submitter (createdBy) with the reason.
  const submitter = getUserById(event.createdBy);
  if (submitter) {
    pushNotificationTo(submitter.id, {
      kind: "APPROVAL_DENIED",
      title: `Budget rejected — revision required: ${event.s1.eventName}`,
      body: `${user.fullName} rejected the initial budget. Reason: "${body.reason.trim()}"`,
      eventId: event.id,
      denialReason: body.reason.trim(),
    });
  }

  logAudit({
    kind: "APPROVAL_DENIED",
    actor: user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: `Budget rejected at pre-approval: ${body.reason.trim()}`,
  });

  return NextResponse.json({ event: updated });
}
