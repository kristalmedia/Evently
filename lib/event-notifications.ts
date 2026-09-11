import type { EventConcept } from "./types";
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
