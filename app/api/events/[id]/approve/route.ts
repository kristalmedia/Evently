import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { approverRoleForUser, hasRole } from "@/lib/permissions";
import {
  broadcastNotification,
  getAllUsers,
  getEventById,
  getUserByEmail,
  logAudit,
  markNotificationActed,
  pushNotificationTo,
  sendEmail,
  updateEvent,
} from "@/lib/store";
import { APPROVER_EMAILS } from "@/lib/constants";
import type { EventConcept, SignOffEntry } from "@/lib/types";

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
    // fill Staff and Putri later fills Financial — but the organization-wide
    // "new event approved" announcement fires NOW, not later.
    nextStatus = "STAFFING_IN_PROGRESS";

    // 1. Notify every active Manager (primary or secondary role) that Staff
    //    is now unlocked for this event.
    const managers = getAllUsers().filter(
      (u) => u.status === "active" && hasRole(u, "MANAGER")
    );
    for (const m of managers) {
      pushNotificationTo(m.id, {
        kind: "APPROVAL_GRANTED",
        title: `Staff section unlocked: ${event.s1.eventName}`,
        body: `Jenny finalized the event brief. Please fill the Staff section (roster + shifts) so Putri can complete the Financial review.`,
        eventId: event.id,
      });
    }

    // 2. Broadcast to EVERY registered user announcing the approved event.
    broadcastNotification({
      kind: "EVENT_PUBLISHED",
      title: `New event approved: ${event.s1.eventName}`,
      body: `${event.s1.eventName} (${event.s1.eventRefNo}) has been fully approved by Nabeng, Rudy and Jenny. Venue: ${event.s1.venue}.`,
      eventId: event.id,
    });

    // 3. SMTP courtesy email to every active user with an address. Fire-and-
    //    forget so a slow / failing transport doesn't stall Jenny's approve
    //    response — the in-app notification above is the source of truth.
    void notifyAllUsersOfApprovedEvent(event).catch(() => {
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

/**
 * Fan out an "event approved" email to every active user with an address.
 * Runs serially so we don't hammer the SMTP relay's concurrent-connection
 * limit — a Kristal org is dozens, not thousands, of users.
 */
async function notifyAllUsersOfApprovedEvent(event: EventConcept) {
  const recipients = getAllUsers().filter((u) => u.status === "active" && !!u.email);
  const subject = `New event approved: ${event.s1.eventName}`;
  const body =
    `${event.s1.eventName} (${event.s1.eventRefNo}) has been approved by all three approvers ` +
    `(Nabeng, Rudy, Jenny).\n\n` +
    `Venue: ${event.s1.venue}\n` +
    `Start: ${event.s1.startDate ? new Date(event.s1.startDate).toLocaleString("en-GB") : "TBC"}\n` +
    (event.s1.endDate ? `End: ${new Date(event.s1.endDate).toLocaleString("en-GB")}\n` : "") +
    `\nSee the full event brief in KEMS: /events/${event.id}\n\n— Kristal Media`;
  for (const u of recipients) {
    await sendEmail({ to: u.email, subject, body });
  }
}
