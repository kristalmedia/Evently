import { PageHeader } from "@/components/shared/page-header";
import { EventsCalendar } from "@/components/events/events-calendar";
import { requireSession } from "@/lib/auth";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import {
  filterVisibleBookings,
  projectKotgCalendarItem,
} from "@/lib/kotg-projection";
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

  const items = bookings
    // Drop bookings with no StartDate — FullCalendar can't place them and
    // an "unscheduled" chip in the calendar view would be more confusing
    // than helpful; those bookings still appear in the KOTG list.
    .filter((b) => !!b.booking.StartDate)
    .map(projectKotgCalendarItem);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event Management"
        title="Calendar"
        description="Every KOTG booking from the Sales sheet, colour-coded by category. Filter above; hover for a preview."
      />
      <EventsCalendar events={items} />
    </div>
  );
}
