import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ReportsWithAudit } from "@/components/reports/reports-with-audit";
import { requireSession } from "@/lib/auth";
import { can, canViewBudget } from "@/lib/permissions";
import { getAuditEntries } from "@/lib/store";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import {
  filterVisibleBookings,
  inferKotgCategory,
  kotgDisplayTitle,
  mapKotgBookingToEventStatus,
  sumShadowBudget,
} from "@/lib/kotg-projection";
import { getShadowEvent } from "@/lib/shadow-events";
import type { KotgBookingWithClient } from "@/lib/google-sheets-types";
import type { ReportRow } from "@/components/reports/reports-view";
import { formatDate } from "@/lib/utils";

export default async function ReportsPage() {
  const { user } = await requireSession();
  if (!can(user, "reports.view")) redirect("/dashboard");

  const showBudget = canViewBudget(user);
  let bookings: KotgBookingWithClient[];
  try {
    const raw = await getKotgBookingsWithClients();
    reconcileKotgBookings(raw);
    bookings = filterVisibleBookings(raw);
  } catch {
    bookings = [];
  }

  // Server-side projection — omit financial fields entirely if user isn't
  // authorised. Sheet booking + shadow record are the source of truth;
  // there's no more Section-5-staff / Section-6-costs to sum from.
  const rows: ReportRow[] = bookings.map((b) => {
    const shadow = getShadowEvent(b.booking.BookingID);
    const status = mapKotgBookingToEventStatus(b.booking.Status, shadow?.kemsStatus);
    // Attendance headcount lives on none of the new records — the Sheet
    // doesn't carry it and the shadow store's minimum viable slice omits
    // debrief-time counters. Left null pending a future Debrief-on-shadow
    // pass; the reports table already renders "—" for null.
    const base: ReportRow = {
      id: b.booking.BookingID,
      refNo: b.booking.QuotationNumber || b.booking.BookingID,
      title: kotgDisplayTitle(b),
      venue: b.booking.LocationDetails || "TBC",
      category: inferKotgCategory(b),
      startDate: formatDate(b.booking.StartDate),
      endDate: formatDate(b.booking.EndDate),
      status,
      priority: "MEDIUM",
      // Every Sheet booking is a paid engagement — the Sheet is the Sales
      // team's own commercial pipeline; there's no CSR path through it.
      classification: "COMMERCIAL",
      attendance: null,
    };
    if (showBudget) {
      const sums = sumShadowBudget(shadow);
      base.estCostBND = sums.totalEstBND;
      base.actCostBND = sums.totalActBND;
      base.overtimeBND = sums.overtimeBND;
      base.mealAllowanceBND = sums.mealAllowanceBND;
    }
    return base;
  });

  const auditEntries = getAuditEntries().slice(0, 500); // cap for performance

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="KOTG booking analytics and audit log. Export any tab to CSV or PDF."
      />
      <ReportsWithAudit
        rows={rows}
        showBudget={showBudget}
        auditEntries={auditEntries}
      />
    </div>
  );
}
