import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EventsTable } from "@/components/events/events-table";
import { requireSession } from "@/lib/auth";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import {
  filterVisibleBookings,
  projectKotgBookingRow,
} from "@/lib/kotg-projection";
import type { KotgBookingWithClient } from "@/lib/google-sheets-types";

export default async function EventsPage() {
  await requireSession();
  // Source of truth: KOTG bookings from the Sales sheet — KEMS no longer
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
  const rows = bookings.map(projectKotgBookingRow);

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
