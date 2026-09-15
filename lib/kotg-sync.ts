import type { KotgBookingWithClient } from "./google-sheets-types";
import { announceActiveBooking } from "./event-notifications";
import {
  getOrCreateShadowEvent,
  markActiveNotified,
  purgeMissingShadowEvents,
} from "./shadow-events";

/**
 * Reconciles the KOTG bookings we just fetched from the Sheet against the
 * KEMS shadow-event store. Called opportunistically after every server-side
 * fetch of the bookings list (page load, API refresh) — the pivot spec
 * option (a) for polling: on-visit transition detection with no background
 * worker.
 *
 * What it does per call:
 *   - For every Sheet booking whose Status is "Active" (case-insensitive,
 *     trimmed): lazy-init the shadow record, and if `activeNotifiedAt` was
 *     unset (first time this booking appears Active in KEMS), fire the
 *     all-hands announceActiveBooking fan-out. Fully idempotent — the
 *     shadow record's activeNotifiedAt flag prevents double-notification
 *     across concurrent visits.
 *   - Garbage-collect shadow records whose bookingIds are no longer
 *     present in the Sheet (Sales deletes are rare but should not
 *     accumulate orphan KEMS state).
 *
 * Notification sends run fire-and-forget (Promise.allSettled) so a slow
 * SMTP relay never delays the caller's page render.
 */
export function reconcileKotgBookings(
  bookings: KotgBookingWithClient[],
): { newlyNotified: number; purged: number } {
  const active = bookings.filter(
    (b) => b.booking.Status.trim().toLowerCase() === "active",
  );

  let newlyNotified = 0;
  const pending: Promise<void>[] = [];
  for (const b of active) {
    const bookingId = b.booking.BookingID;
    if (!bookingId) continue;
    // Lazy-init so any subsequent read from getShadowEvent finds a record.
    getOrCreateShadowEvent(bookingId);
    const fired = markActiveNotified(bookingId);
    if (fired) {
      newlyNotified += 1;
      // Kick off the fan-out but don't block the caller — the shadow flag
      // was already set atomically above, so a slow email send doesn't risk
      // re-firing on a concurrent request.
      pending.push(
        announceActiveBooking(b).catch((err) => {
          // Swallow — logged via sendEmail, and re-throwing here would only
          // reach an unhandled-rejection handler. The user-visible booking
          // still appears; only the notification's absence would be the
          // consequence.
          console.error(
            `announceActiveBooking failed for booking ${bookingId}:`,
            err,
          );
        }),
      );
    }
  }

  // Fire-and-forget — deliberately unawaited. The pattern matches the
  // existing announceApprovedEvent callers.
  if (pending.length > 0) {
    void Promise.allSettled(pending);
  }

  const activeBookingIds = new Set(bookings.map((b) => b.booking.BookingID).filter(Boolean));
  const purged = purgeMissingShadowEvents(activeBookingIds);

  return { newlyNotified, purged };
}
