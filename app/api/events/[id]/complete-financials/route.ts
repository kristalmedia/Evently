import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasAnyRole } from "@/lib/permissions";
import { getEventById, logAudit, updateEvent } from "@/lib/store";

/**
 * Finance Lead (Putri) calls this to finalize Section 5 (Financial) once
 * Managers have completed Staff. Terminal step of the post-approval flow —
 * status FINANCIAL_REVIEW → PUBLISHED.
 *
 * SILENT by design: the organization-wide "new event approved" fan-out
 * (broadcastNotification + SMTP email) already fired earlier, at Jenny's
 * FINAL_APPROVER approve step in /approve. Re-firing here would double-
 * notify every user for the same event, so this endpoint only records the
 * transition + audit line.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Only the Finance Lead(s) or a Super Admin can close out Financials.
  // Secondary-role Finance Leads count too.
  if (!hasAnyRole(user, ["FINANCE_LEAD", "SUPER_ADMIN"])) {
    return NextResponse.json(
      { error: "Only the Finance Lead can complete Financials." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (event.status !== "FINANCIAL_REVIEW") {
    return NextResponse.json(
      {
        error: `Financials can only be completed while under financial review (current status: ${event.status}).`,
      },
      { status: 409 }
    );
  }

  const updated = updateEvent(id, { status: "PUBLISHED" });
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: `Financials completed by ${user.fullName} → PUBLISHED (no user-visible re-notification; fan-out already fired at Jenny's approve)`,
  });

  return NextResponse.json({ event: updated });
}
