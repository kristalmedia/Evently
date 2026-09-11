import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { approverRoleForUser, hasRole } from "@/lib/permissions";
import {
  getAllUsers,
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
 * Approve action — advances the event through the sequential workflow:
 *   PENDING_APPROVAL       →  Rudy (2nd) approves     → PENDING_FINAL_APPROVAL
 *   PENDING_FINAL_APPROVAL →  Jenny (Final) approves  → STAFFING_IN_PROGRESS
 *                                                       (notifies all Managers)
 *
 * Onward transitions to FINANCIAL_REVIEW (Managers finish Staff) and to
 * PUBLISHED (Putri finishes Financial + fan-out to all users) live in
 * their own /complete-staffing and /complete-financials endpoints.
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
    // Jenny's approval no longer publishes the event directly — it hands off
    // to Managers to fill Section 5 (Staff) first. The "publish to everyone"
    // fan-out moved to /complete-financials, which fires once Putri finishes
    // the Financial section.
    nextStatus = "STAFFING_IN_PROGRESS";

    // Notify every active Manager that Staff is now unlocked for this event.
    // Uses hasRole so users with Manager as their SECONDARY role are also
    // included in the fan-out.
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
