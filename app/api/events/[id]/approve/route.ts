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
import { announceApprovedEvent } from "@/lib/event-notifications";
import { APPROVER_EMAILS } from "@/lib/constants";
import type { SignOffEntry } from "@/lib/types";

/**
 * Approve action — advances the event through the sequential workflow:
 *   PENDING_APPROVAL       →  Rudy (2nd) approves     → PENDING_FINAL_APPROVAL
 *   PENDING_FINAL_APPROVAL →  Jenny (Final) approves  → STAFFING_IN_PROGRESS
 *
 * At Jenny's Final approve (all 3 sign-offs done), two things happen:
 *   1. In-app notification pushed to all Managers so they know Staff is
 *      unlocked for the post-approval fill flow.
 *   2. The organization-wide announcement fires — broadcastNotification to
 *      every user + SMTP email fan-out — because per product spec the
 *      "event is approved by 3 approvers" moment is the public announcement.
 *      /complete-financials still transitions to PUBLISHED at the end of
 *      Putri's review but is silent (no re-notification).
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

  // Widen the type from the earlier PENDING_* narrowing so the FINAL_APPROVER
  // branch can assign "PUBLISHED" (the state machine advances beyond the
  // narrowed pair).
  let nextStatus: import("@/lib/types").EventStatus = event.status;
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
    // 3rd of 3 approvals done. Advance to STAFFING_IN_PROGRESS so Managers
    // fill Staff and Putri later fills Financial. The organization-wide
    // announcement (Manager fan-out + broadcast + SMTP) fires now via the
    // shared helper — the paid-submission path uses the same helper.
    nextStatus = "STAFFING_IN_PROGRESS";
    void announceApprovedEvent(event, { source: "final_approval" }).catch(() => {
      /* honest simulated=true handling already lives in sendEmail */
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
