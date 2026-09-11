import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasAnyRole } from "@/lib/permissions";
import {
  broadcastNotification,
  getAllUsers,
  getEventById,
  logAudit,
  sendEmail,
  updateEvent,
} from "@/lib/store";
import type { EventConcept } from "@/lib/types";

/**
 * Finance Lead (Putri) calls this to finalize Section 5 (Financial) once
 * Managers have completed Staff. This is the terminal step of the
 * post-approval flow — status FINANCIAL_REVIEW → PUBLISHED, and the
 * "new event" notification + email fan-out to every active user fires
 * here (moved from the /approve handler, where Jenny's approval used
 * to trigger it).
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

  // 1. In-app notification broadcast — the source-of-truth channel.
  broadcastNotification({
    kind: "EVENT_PUBLISHED",
    title: `New upcoming event: ${event.s1.eventName}`,
    body: `${event.s1.eventName} (${event.s1.eventRefNo}) has been fully approved and finalized. Venue: ${event.s1.venue}.`,
    eventId: event.id,
  });

  // 2. SMTP courtesy email. Fire-and-forget so a slow/failing transport
  //    doesn't stall the response — the notification above already reached
  //    everyone via the app itself.
  void notifyAllUsersOfPublishedEvent(updated).catch(() => {
    /* honest simulated=true handling already lives in sendEmail */
  });

  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: `Financials completed by ${user.fullName} → PUBLISHED (all-user fan-out fired)`,
  });

  return NextResponse.json({ event: updated });
}

async function notifyAllUsersOfPublishedEvent(event: EventConcept) {
  const recipients = getAllUsers().filter((u) => u.status === "active" && !!u.email);
  const subject = `New event published: ${event.s1.eventName}`;
  const body =
    `${event.s1.eventName} (${event.s1.eventRefNo}) has been fully approved and is now published.\n\n` +
    `Venue: ${event.s1.venue}\n` +
    `Start: ${event.s1.startDate ? new Date(event.s1.startDate).toLocaleString("en-GB") : "TBC"}\n` +
    (event.s1.endDate ? `End: ${new Date(event.s1.endDate).toLocaleString("en-GB")}\n` : "") +
    `\nSee the full event brief in KEMS: /events/${event.id}\n\n— Kristal Media`;
  for (const u of recipients) {
    await sendEmail({ to: u.email, subject, body });
  }
}
