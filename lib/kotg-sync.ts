import type { KotgBookingWithClient } from "./google-sheets-types";
import {
  announceActiveBooking,
  announceConfirmedEvent,
} from "./event-notifications";
import {
  getOrCreateShadowEvent,
  getShadowEvent,
  markActiveNotified,
  markConfirmedNotified,
  purgeMissingShadowEvents,
} from "./shadow-events";

/**
 * Reconciles the KOTG bookings we just fetched from the Sheet against the
 * Evently shadow-event store. Called opportunistically after every server-side
 * fetch of the bookings list (page load, API refresh) — the pivot spec
 * option (a) for polling: on-visit transition detection with no background
 * worker.
 *
 * What it does per call:
 *   - For every Sheet booking whose Status is "Active" (case-insensitive,
 *     trimmed): lazy-init the shadow record, and if `activeNotifiedAt` was
 *     unset (first time this booking appears Active in Evently), fire the
 *     all-hands announceActiveBooking fan-out. Fully idempotent — the
 *     shadow record's activeNotifiedAt flag prevents double-notification
 *     across concurrent visits.
 *   - Garbage-collect shadow records whose bookingIds are no longer
 *     present in the Sheet (Sales deletes are rare but should not
 *     accumulate orphan Evently state).
 *
 * Notification sends run fire-and-forget (Promise.allSettled) so a slow
 * SMTP relay never delays the caller's page render.
 */
export function reconcileKotgBookings(
  bookings: KotgBookingWithClient[],
): { newlyNotified: number; newlyConfirmed: number; purged: number } {
  const active = bookings.filter(
    (b) => b.booking.Status.trim().toLowerCase() === "active",
  );

  let newlyNotified = 0;
  let newlyConfirmed = 0;
  const pending: Promise<void>[] = [];
  for (const b of active) {
    const bookingId = b.booking.BookingID;
    if (!bookingId) continue;
    // Lazy-init so any subsequent read from getShadowEvent finds a record.
    getOrCreateShadowEvent(bookingId);

    // Active-status fan-out — fires once per booking on first transition
    // to Active.
    const firedActive = markActiveNotified(bookingId);
    if (firedActive) {
      newlyNotified += 1;
      pending.push(
        announceActiveBooking(b).catch((err) => {
          console.error(
            `announceActiveBooking failed for booking ${bookingId}:`,
            err,
          );
        }),
      );
    }

    // Confirmed-event fan-out — fires once per booking when eventlyStatus
    // reaches PUBLISHED. Checked on EVERY reconcile so a Sheet outage
    // or SMTP failure at HR-complete time doesn't permanently lose the
    // email; the next page load retries until markConfirmedNotified
    // finally flips the flag.
    const shadow = getShadowEvent(bookingId);
    if (shadow && shadow.eventlyStatus === "PUBLISHED") {
      const firedConfirmed = markConfirmedNotified(bookingId);
      if (firedConfirmed) {
        newlyConfirmed += 1;
        pending.push(
          announceConfirmedEvent(b).catch((err) => {
            console.error(
              `announceConfirmedEvent failed for booking ${bookingId}:`,
              err,
            );
          }),
        );
      }
    }
  }

  // Fire-and-forget — deliberately unawaited. Sheet re-fetches must not
  // wait on SMTP round-trips for the notification broadcast.
  if (pending.length > 0) {
    void Promise.allSettled(pending);
  }

  const activeBookingIds = new Set(bookings.map((b) => b.booking.BookingID).filter(Boolean));
  const purged = purgeMissingShadowEvents(activeBookingIds);

  return { newlyNotified, newlyConfirmed, purged };
}
