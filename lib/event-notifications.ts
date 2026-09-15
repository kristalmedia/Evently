import type { EventConcept } from "./types";
import type { KotgBookingWithClient } from "./google-sheets-types";
import {
  broadcastNotification,
  getAllUsers,
  pushNotificationTo,
  sendEmail,
} from "./store";
import { hasRole } from "./permissions";

/**
 * Fires the "event is happening, please act" fan-out that runs the moment an
 * event enters `STAFFING_IN_PROGRESS`. Called from two places:
 *
 *   1. `/api/events/[id]/approve` — Jenny's FINAL_APPROVER approve step for
 *      free (COMMUNITY_CSR) events.
 *   2. `/api/events` POST — direct submission of a paid (COMMERCIAL) event
 *      that skips the approval chain entirely.
 *
 * Both paths need identical downstream behavior, so the logic lives here.
 *
 * What it does:
 *   - Pushes an in-app Manager notification to every active user holding the
 *     MANAGER role (primary or secondary) — "Staff section unlocked for {event}".
 *   - Broadcasts an in-app `EVENT_PUBLISHED` notification to every user.
 *   - Fires a fire-and-forget SMTP email to every active user with an
 *     address. If SMTP isn't configured, sendEmail() honestly reports
 *     simulated=true instead of failing the caller.
 *
 * The email fan-out runs serially so the SMTP relay's connection ceiling
 * isn't stressed — a Kristal org is dozens, not thousands, of users.
 */
export async function announceApprovedEvent(
  event: EventConcept,
  opts: { source: "final_approval" | "paid_submission" }
): Promise<void> {
  const isPaid = opts.source === "paid_submission";

  // 1. Manager Staff-unlock notification.
  const managers = getAllUsers().filter(
    (u) => u.status === "active" && hasRole(u, "MANAGER")
  );
  const managerBody = isPaid
    ? `A new paid event was submitted and skipped the approval chain. Please fill the Staff section (roster + shifts) so the Finance Lead can complete the Financial review.`
    : `Jenny finalized the event brief. Please fill the Staff section (roster + shifts) so the Finance Lead can complete the Financial review.`;
  for (const m of managers) {
    pushNotificationTo(m.id, {
      kind: "APPROVAL_GRANTED",
      title: `Staff section unlocked: ${event.s1.eventName}`,
      body: managerBody,
      eventId: event.id,
    });
  }

  // 2. Org-wide in-app broadcast.
  const broadcastTitle = isPaid
    ? `New paid event: ${event.s1.eventName}`
    : `New event approved: ${event.s1.eventName}`;
  const broadcastBody = isPaid
    ? `${event.s1.eventName} (${event.s1.eventRefNo}) was submitted as a paid engagement — no approval chain needed. Venue: ${event.s1.venue}.`
    : `${event.s1.eventName} (${event.s1.eventRefNo}) has been fully approved by Nabeng, Rudy and Jenny. Venue: ${event.s1.venue}.`;
  broadcastNotification({
    kind: "EVENT_PUBLISHED",
    title: broadcastTitle,
    body: broadcastBody,
    eventId: event.id,
  });

  // 3. SMTP courtesy email to every active user. Fire-and-forget from the
  //    caller — errors here must not fail Jenny's approve or a paid submit.
  const recipients = getAllUsers().filter((u) => u.status === "active" && !!u.email);
  const subject = isPaid
    ? `New paid event: ${event.s1.eventName}`
    : `New event approved: ${event.s1.eventName}`;
  const intro = isPaid
    ? `${event.s1.eventName} (${event.s1.eventRefNo}) was submitted as a paid engagement (no approval chain required).`
    : `${event.s1.eventName} (${event.s1.eventRefNo}) has been approved by all three approvers (Nabeng, Rudy, Jenny).`;
  const body =
    `${intro}\n\n` +
    `Venue: ${event.s1.venue}\n` +
    `Start: ${event.s1.startDate ? new Date(event.s1.startDate).toLocaleString("en-GB") : "TBC"}\n` +
    (event.s1.endDate ? `End: ${new Date(event.s1.endDate).toLocaleString("en-GB")}\n` : "") +
    `\nSee the full event brief in KEMS: /events/${event.id}\n\n— Kristal Media`;
  for (const u of recipients) {
    await sendEmail({ to: u.email, subject, body });
  }
}

/**
 * Sheet-sourced counterpart to announceApprovedEvent — fires when a KOTG
 * booking transitions to Active in the Sales team's Sheet. Only called
 * once per booking (idempotency lives in lib/shadow-events.ts via the
 * `activeNotifiedAt` flag on the shadow record).
 *
 * Fan-out is the same three-part broadcast as an approved event:
 *   1. Per-Manager in-app notification asking them to fill their
 *      department's roster block.
 *   2. Org-wide in-app EVENT_PUBLISHED broadcast.
 *   3. Fire-and-forget SMTP courtesy email to every active user.
 *
 * The booking's identity in KEMS is its BookingID (used as the eventId on
 * notifications) — the event detail page is expected to accept a BookingID
 * as its route param and lazy-init a shadow record on visit.
 */
export async function announceActiveBooking(
  booking: KotgBookingWithClient,
): Promise<void> {
  const bookingId = booking.booking.BookingID;
  const displayName =
    booking.customPackage?.PackageName ||
    booking.booking.ServiceName ||
    `KOTG booking ${bookingId}`;
  const clientName =
    booking.client?.CompanyName || booking.client?.ClientName || "—";
  const venue = booking.booking.LocationDetails || "TBC";
  const start = booking.booking.StartDate || "TBC";
  const end = booking.booking.EndDate ? ` → ${booking.booking.EndDate}` : "";

  // 1. Per-Manager notification — same "fill your section" prompt, adapted
  //    for the new per-dept flow: each Manager only fills their own dept.
  const managers = getAllUsers().filter(
    (u) => u.status === "active" && hasRole(u, "MANAGER"),
  );
  for (const m of managers) {
    pushNotificationTo(m.id, {
      kind: "APPROVAL_GRANTED",
      title: `Roster action needed: ${displayName}`,
      body: `A KOTG booking for ${clientName} is now Active. Please fill your department's roster block. HR completes overtime + meal allowance once all departments finish.`,
      eventId: bookingId,
    });
  }

  // 2. Org-wide broadcast — "a new booking is happening".
  broadcastNotification({
    kind: "EVENT_PUBLISHED",
    title: `New KOTG booking: ${displayName}`,
    body: `${displayName} (${clientName}) is now Active. Venue: ${venue}. Dates: ${start}${end}.`,
    eventId: bookingId,
  });

  // 3. SMTP courtesy email — fire-and-forget serial send.
  const recipients = getAllUsers().filter((u) => u.status === "active" && !!u.email);
  const subject = `New KOTG booking: ${displayName}`;
  const body =
    `${displayName} (booking ${bookingId}) is now Active.\n\n` +
    `Client: ${clientName}\n` +
    `Venue: ${venue}\n` +
    `Dates: ${start}${end}\n\n` +
    `See details in KEMS: /events/${bookingId}\n\n— Kristal Media`;
  for (const u of recipients) {
    await sendEmail({ to: u.email, subject, body });
  }
}
