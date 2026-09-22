import { PageHeader } from "@/components/shared/page-header";
import { EventsCalendar } from "@/components/events/events-calendar";
import { UnscheduledBookingsStrip } from "@/components/events/unscheduled-bookings-strip";
import { requireSession } from "@/lib/auth";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import {
  filterVisibleBookings,
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

  // Split by whether the booking has a start date. FullCalendar can only
  // render items that carry a date; bookings without one get their own
  // "Unscheduled" strip above so they don't silently disappear from view.
  const scheduled = bookings
    .filter((b) => !!b.booking.StartDate)
    .map(projectKotgCalendarItem);

  const unscheduled = bookings
    .filter((b) => !b.booking.StartDate)
    .map((b) => ({
      id: b.booking.BookingID,
      title: kotgDisplayTitle(b),
      status: mapKotgBookingToEventStatus(
        b.booking.Status,
        getShadowEvent(b.booking.BookingID)?.kemsStatus,
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
