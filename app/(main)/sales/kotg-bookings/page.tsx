import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { KotgBookingsView } from "@/components/sales/kotg-bookings-view";
import { requireSession } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/permissions";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import type { KotgBookingWithClient } from "@/lib/google-sheets-types";

export default async function KotgBookingsPage() {
  const { user } = await requireSession();
  if (!can(user, "events.create")) redirect("/dashboard");

  // Server-side initial fetch for a fast first paint (no loading spinner on
  // arrival). The client component's Refresh button hits the API route
  // directly for subsequent updates, bypassing the 30s cache on request.
  let initialBookings: KotgBookingWithClient[];
  let initialError: string | null = null;
  try {
    initialBookings = await getKotgBookingsWithClients();
    // Detect fresh Active-status transitions on every visit — see
    // lib/kotg-sync.ts for the on-visit polling rationale. Runs before the
    // page paints so the notification fan-out for a just-flipped booking
    // fires as early as possible, but is idempotent (shadow.activeNotifiedAt
    // flag) so repeated visits don't spam.
    reconcileKotgBookings(initialBookings);
  } catch (err) {
    initialBookings = [];
    initialError = (err as Error).message;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales Integration"
        title="KOTG Bookings"
        description="Live from the Sales team's ServiceBookings Sheet — Category = Kristal On The Go, joined with Clients."
      />
      <KotgBookingsView
        initialBookings={initialBookings}
        initialError={initialError}
        viewerDepartment={user.department}
        viewerIsSuperAdmin={isSuperAdmin(user)}
      />
    </div>
  );
}
