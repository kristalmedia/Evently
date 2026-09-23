import { PageHeader } from "@/components/shared/page-header";
import { EventsCalendar } from "@/components/events/events-calendar";
import { UnscheduledBookingsStrip } from "@/components/events/unscheduled-bookings-strip";
import { requireSession } from "@/lib/auth";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import {
  filterVisibleBookings,
  hasScheduledDate,
  inferKotgCategory,
  kotgDisplayTitle,
  mapKotgBookingToEventStatus,
  projectKotgCalendarItem,
} from "@/lib/kotg-projection";
import { getShadowEvent } from "@/lib/shadow-events";
import type { KotgBookingWithClient } from "@/lib/google-sheets-types";

export default async function CalendarPage() {
  await requireSession();
  // Source of truth: KOTG bookings from the Sales team's Sheet.
  // Same reconciliation pass as every other Sheet-consuming page —
  // detects Active-status transitions and fires the fan-out once.
  let bookings: KotgBookingWithClient[];
  try {
    const raw = await getKotgBookingsWithClients();
    reconcileKotgBookings(raw);
    bookings = filterVisibleBookings(raw);
  } catch {
    bookings = [];
  }

  // Split by whether the booking has a genuinely parseable start date —
  // NOT just a non-empty StartDate cell. The Sheet is hand-typed, and a
  // booking that's Active but not yet locked in commonly gets "TBC" (or
  // similar placeholder text) typed into StartDate instead of being left
  // blank. A plain truthy check would treat that as "has a date" and hand
  // FullCalendar an unparseable string, which it silently drops — the
  // booking then never appears anywhere on the page. hasScheduledDate
  // validates the string actually parses before routing it to the
  // calendar grid, so every visible booking ends up somewhere: either on
  // the calendar or in the Unscheduled strip below.
  const scheduled = bookings
    .filter(hasScheduledDate)
    .map(projectKotgCalendarItem);

  const unscheduled = bookings
    .filter((b) => !hasScheduledDate(b))
    .map((b) => ({
      id: b.booking.BookingID,
      title: kotgDisplayTitle(b),
      status: mapKotgBookingToEventStatus(
        b.booking.Status,
        getShadowEvent(b.booking.BookingID)?.eventlyStatus,
      ),
      category: inferKotgCategory(b),
      venue: b.booking.LocationDetails || undefined,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event Management"
        title="Calendar"
        description="Every KOTG booking from the Sales sheet, colour-coded by category. Filter above; hover for a preview."
      />
      <UnscheduledBookingsStrip items={unscheduled} />
      <EventsCalendar events={scheduled} />
    </div>
  );
}
