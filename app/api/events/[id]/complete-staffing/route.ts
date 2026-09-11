import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasAnyRole, hasRole } from "@/lib/permissions";
import {
  getAllUsers,
  getEventById,
  logAudit,
  pushNotificationTo,
  updateEvent,
} from "@/lib/store";

/**
 * Managers call this to signal "Staff section is done" for an event Jenny
 * already finalized. Moves status STAFFING_IN_PROGRESS → FINANCIAL_REVIEW,
 * which unlocks Section 5 (Financial) for Putri (FINANCE_LEAD) and fires
 * her a notification prompting her to complete it.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only Managers (or a Super Admin acting on their behalf) can complete Staff.
  // Secondary-role Managers count too.
  if (!hasAnyRole(user, ["MANAGER", "SUPER_ADMIN"])) {
    return NextResponse.json(
      { error: "Only Managers can mark Staff complete." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (event.status !== "STAFFING_IN_PROGRESS") {
    return NextResponse.json(
      {
        error: `Staff can only be completed while the event is in staffing (current status: ${event.status}).`,
      },
      { status: 409 }
    );
  }

  const updated = updateEvent(id, { status: "FINANCIAL_REVIEW" });

  // Notify all Finance Leads (typically just Putri, but future-proofed in
  // case another Finance Lead is added later). hasRole picks up secondary-
  // role Finance Leads too.
  const financeLeads = getAllUsers().filter(
    (u) => u.status === "active" && hasRole(u, "FINANCE_LEAD")
  );
  for (const fl of financeLeads) {
    pushNotificationTo(fl.id, {
      kind: "APPROVAL_GRANTED",
      title: `Financial section unlocked: ${event.s1.eventName}`,
      body: `Staff roster is complete. Please review the auto-calculated overtime and meal-allowance figures and finalize the Financial section.`,
      eventId: event.id,
    });
  }

  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: `Staff completed by ${user.fullName} → FINANCIAL_REVIEW`,
  });

  return NextResponse.json({ event: updated });
}
