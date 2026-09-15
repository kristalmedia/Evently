import type { KotgBookingWithClient } from "./google-sheets-types";
import {
  broadcastNotification,
  getAllUsers,
  pushNotificationTo,
  sendEmail,
} from "./store";
import { hasRole } from "./permissions";

/**
 * Sheet-sourced fan-out helper — fires when a KOTG booking transitions to
 * Active in the Sales team's Sheet. Only called once per booking
 * (idempotency lives in lib/shadow-events.ts via the `activeNotifiedAt`
 * flag on the shadow record).
 *
 * Fan-out is a three-part broadcast:
 *   1. Per-Manager in-app notification asking them to fill their
 *      department's roster block.
 *   2. Org-wide in-app EVENT_PUBLISHED broadcast.
 *   3. Fire-and-forget SMTP courtesy email to every active user.
 *
 * The booking's identity in KEMS is its BookingID (used as the eventId on
 * notifications) — the event detail page accepts a BookingID as its route
 * param and lazy-inits a shadow record on visit.
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

  // 1. Per-Manager notification — each Manager fills only their own dept.
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
