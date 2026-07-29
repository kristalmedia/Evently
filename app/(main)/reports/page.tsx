import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ReportsWithAudit } from "@/components/reports/reports-with-audit";
import { requireSession } from "@/lib/auth";
import { can, canViewBudget } from "@/lib/permissions";
import { calculateStaffing } from "@/lib/roster-calc";
import { getAllEvents, getAuditEntries } from "@/lib/store";
import type { ReportRow } from "@/components/reports/reports-view";
import { formatDate } from "@/lib/utils";

export default async function ReportsPage() {
  const { user } = await requireSession();
  if (!can(user, "reports.view")) redirect("/dashboard");

  const showBudget = canViewBudget(user);
  const events = getAllEvents();

  // Server-side projection — omit financial fields entirely if user isn't authorised.
  const rows: ReportRow[] = events.map((e) => {
    const manualEst = e.s6.costs.reduce((s, c) => s + c.estimatedBND, 0);
    const manualAct = e.s6.costs.reduce((s, c) => s + (c.actualBND ?? 0), 0);
    const staffing = calculateStaffing(e.s5.staff ?? []);
    const base: ReportRow = {
      id: e.id,
      refNo: e.s1.eventRefNo,
      title: e.s1.eventName,
      venue: e.s1.venue,
      category: e.category ?? "—",
      startDate: formatDate(e.s1.startDate),
      endDate: formatDate(e.s1.endDate),
      status: e.status,
      priority: e.priority,
      classification: e.s2.classification,
      attendance: e.s10.actualAttendance ?? e.s1.expectedAttendance ?? null,
    };
    if (showBudget) {
      base.estCostBND = manualEst + staffing.overtimeBND + staffing.mealAllowanceBND;
      base.actCostBND = manualAct + staffing.overtimeBND + staffing.mealAllowanceBND;
      base.overtimeBND = staffing.overtimeBND;
      base.mealAllowanceBND = staffing.mealAllowanceBND;
    }
    return base;
  });

  const auditEntries = getAuditEntries().slice(0, 500); // cap for performance

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Event analytics and audit log. Export any tab to CSV or PDF."
      />
      <ReportsWithAudit
        rows={rows}
        showBudget={showBudget}
        auditEntries={auditEntries}
      />
    </div>
  );
}
