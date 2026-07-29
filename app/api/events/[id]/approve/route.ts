import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { approverRoleForUser } from "@/lib/permissions";
import {
  broadcastNotification,
  getEventById,
  getUserByEmail,
  logAudit,
  markNotificationActed,
  pushNotificationTo,
  updateEvent,
} from "@/lib/store";
import { APPROVER_EMAILS } from "@/lib/constants";
import type { SignOffEntry } from "@/lib/types";

/**
 * Approve action — moves the event to the next approver in the chain.
 * Rudy (2nd) approves → routes to Jenny (Final) with an APPROVAL_REQUEST.
 * Jenny (Final) approves → event marked PUBLISHED.
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
    return NextResponse.json({ error: "Not authorised to approve" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { notificationId?: string };
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Enforce stage-vs-status alignment — you can only approve at the event's
  // current stage. Rudy on PENDING_APPROVAL, Jenny on PENDING_FINAL_APPROVAL.
  const expectedStatus =
    stage === "SECOND_APPROVER" ? "PENDING_APPROVAL" : "PENDING_FINAL_APPROVAL";
  if (event.status !== expectedStatus) {
    return NextResponse.json(
      {
        error: `Event is not awaiting your approval (current status: ${event.status}).`,
      },
      { status: 409 }
    );
  }

  // Stamp sign-off entry
  const entry: SignOffEntry = {
    role: stage,
    name: user.fullName,
    signedAt: new Date().toISOString(),
  };
  const nextEntries = [
    ...event.s11.entries.filter((e) => e.role !== stage),
    entry,
  ];

  let nextStatus = event.status;
  if (stage === "SECOND_APPROVER") {
    nextStatus = "PENDING_FINAL_APPROVAL";
    // Dispatch to Jenny
    const jenny = getUserByEmail(APPROVER_EMAILS.FINAL_APPROVER);
    if (jenny) {
      pushNotificationTo(jenny.id, {
        kind: "APPROVAL_REQUEST",
        title: `Final approval requested: ${event.s1.eventName}`,
        body: `${user.fullName} approved this event. Your final Approve / Deny is required.`,
        eventId: event.id,
        approverStage: "FINAL_APPROVER",
      });
    }
  } else if (stage === "FINAL_APPROVER") {
    nextStatus = "PUBLISHED";
    // Broadcast to EVERY registered user announcing the upcoming event.
    broadcastNotification({
      kind: "EVENT_PUBLISHED",
      title: `New upcoming event: ${event.s1.eventName}`,
      body: `${event.s1.eventName} (${event.s1.eventRefNo}) has been fully approved by Nabeng, Rudy and Jenny. Venue: ${event.s1.venue}.`,
      eventId: event.id,
    });
  }

  const updated = updateEvent(id, { status: nextStatus, s11: { ...event.s11, entries: nextEntries } });
  if (body.notificationId) markNotificationActed(body.notificationId);

  logAudit({
    kind: "APPROVAL_GRANTED",
    actor: user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: `Stage: ${stage} → status ${nextStatus}`,
  });

  return NextResponse.json({ event: updated });
}
