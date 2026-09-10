import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { approverRoleForUser } from "@/lib/permissions";
import {
  getEventById,
  getUserByEmail,
  logAudit,
  markNotificationActed,
  pushNotificationTo,
  updateEvent,
} from "@/lib/store";
import { APPROVER_EMAILS } from "@/lib/constants";

/**
 * Deny action — reverts event to REVISION_REQUIRED and alerts the previous
 * submitter with the justification text (spec §5).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const stage = approverRoleForUser(user);
  if (!stage || stage === "FIRST_APPROVER") {
    return NextResponse.json({ error: "Not authorised to deny" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    reason?: string;
    notificationId?: string;
  };
  if (!body.reason || body.reason.trim().length < 10) {
    return NextResponse.json(
      { error: "Justification (10+ chars) is required" },
      { status: 400 }
    );
  }

  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Only deny events that are actually awaiting an approver decision. Denying
  // a DRAFT / CANCELLED / already-PUBLISHED event was returning 500s before
  // because the state machine had nowhere to send it.
  const denyable = event.status === "PENDING_APPROVAL" || event.status === "PENDING_FINAL_APPROVAL";
  if (!denyable) {
    return NextResponse.json(
      { error: `Event is not awaiting approval (current status: ${event.status}).` },
      { status: 409 }
    );
  }

  // Older seed rows / drafts can have s11 completely absent; spreading
  // `undefined` throws at runtime. Fall back to an empty entries list so the
  // deny always resolves to a valid Section11_SignOff shape.
  const currentSignoff = event.s11 ?? { entries: [] };
  const updated = updateEvent(id, {
    status: "REVISION_REQUIRED",
    s11: {
      ...currentSignoff,
      entries: currentSignoff.entries ?? [],
      denialReason: body.reason.trim(),
      deniedBy: user.fullName,
      deniedAt: new Date().toISOString(),
    },
  });

  // Alert the previous submitter — first approver if denied at 2nd stage,
  // or the second approver if denied at final stage
  const previousEmail =
    stage === "SECOND_APPROVER"
      ? APPROVER_EMAILS.FIRST_APPROVER
      : APPROVER_EMAILS.SECOND_APPROVER;
  const target = getUserByEmail(previousEmail);
  if (target) {
    pushNotificationTo(target.id, {
      kind: "APPROVAL_DENIED",
      title: `Denied — revision required: ${event.s1.eventName}`,
      body: `${user.fullName} denied approval. Reason: "${body.reason.trim()}"`,
      eventId: event.id,
      denialReason: body.reason.trim(),
    });
  }
  if (body.notificationId) markNotificationActed(body.notificationId);

  logAudit({
    kind: "APPROVAL_DENIED",
    actor: user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: `Denied at ${stage}: ${body.reason.trim()}`,
  });

  return NextResponse.json({ event: updated });
}
