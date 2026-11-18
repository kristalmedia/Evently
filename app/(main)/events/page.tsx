import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EventsTable } from "@/components/events/events-table";
import { requireSession } from "@/lib/auth";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import {
  filterVisibleBookings,
  projectGroupedBookingRows,
} from "@/lib/kotg-projection";
import type { KotgBookingWithClient } from "@/lib/google-sheets-types";

export default async function EventsPage() {
  await requireSession();
  // Source of truth: KOTG bookings from the Sales sheet — Evently no longer
  // owns event creation, that's a Sales-team responsibility living in the
  // Sheet. Every booking projects into the EventListRow shape the existing
  // table consumes unchanged.
  let bookings: KotgBookingWithClient[];
  try {
    const raw = await getKotgBookingsWithClients();
    reconcileKotgBookings(raw);
    bookings = filterVisibleBookings(raw);
  } catch {
    bookings = [];
  }
  // Grouped projection: Sales occasionally creates several Sheet
  // bookings for a single logical event (e.g. one per day of a
  // multi-day run). Collapse them into one list row keyed on the
  // display title so the Events list reads as "one event per card,"
  // not "one Sheet row per card." See projectGroupedBookingRows.
  const rows = projectGroupedBookingRows(bookings);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event Management"
        title="Events"
        description="Every KOTG booking from the Sales sheet. Filter by status, category, or search by name or reference."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No events yet"
          description="No KOTG bookings have been added to the Sales sheet yet."
        />
      ) : (
        <EventsTable rows={rows} />
      )}
    </div>
  );
}
