import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasAnyRole } from "@/lib/permissions";
import {
  getEventById,
  getUserByEmail,
  logAudit,
  pushNotificationTo,
  updateEvent,
} from "@/lib/store";
import { APPROVER_EMAILS } from "@/lib/constants";

/**
 * Budget approval gate — Finance Lead (Putri) approves the event's budget
 * BEFORE the sign-off chain runs. Advances BUDGET_PENDING → PENDING_APPROVAL,
 * then the normal Nabeng → Rudy → Jenny flow takes over via /approve.
 *
 * Only fires for free (community/CSR) events — paid events skip this gate
 * along with everything else in the approval chain.
 *
 * Notifies Rudy (2nd approver) that his review can begin.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasAnyRole(user, ["FINANCE_LEAD", "SUPER_ADMIN"])) {
    return NextResponse.json(
      { error: "Only the Finance Lead can approve the initial budget." },
      { status: 403 }
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

  const updated = updateEvent(id, { status: "PENDING_APPROVAL" });

  // Notify Rudy — the next approver in the chain.
  const rudy = getUserByEmail(APPROVER_EMAILS.SECOND_APPROVER);
  if (rudy) {
    pushNotificationTo(rudy.id, {
      kind: "APPROVAL_REQUEST",
      title: `Approval requested: ${event.s1.eventName}`,
      body: `Budget approved by ${user.fullName}. Your Approve / Deny is required.`,
      eventId: event.id,
      approverStage: "SECOND_APPROVER",
    });
  }

  logAudit({
    kind: "APPROVAL_GRANTED",
    actor: user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: `Budget approved → PENDING_APPROVAL`,
  });

  return NextResponse.json({ event: updated });
}
