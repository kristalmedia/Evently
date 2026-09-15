import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ClipboardList,
  Coins,
  DollarSign,
  Info,
  MapPin,
  Phone,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { OnAirPill } from "@/components/shared/broadcast-marks";
import { requireSession } from "@/lib/auth";
import { canViewBudget } from "@/lib/permissions";
import {
  canEditDept,
  canEditFinance,
  canEditHr,
  visibleDeptKeysForShadow,
} from "@/lib/kotg-permissions";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import {
  kotgDisplayTitle,
  kotgOrganizerLabel,
  mapKotgBookingToEventStatus,
  projectKotgBookingRow,
  sumShadowBudget,
} from "@/lib/kotg-projection";
import {
  getOrCreateShadowEvent,
  MANAGER_DEPT_KEYS,
} from "@/lib/shadow-events";
import type { ShadowEventKemsStatus } from "@/lib/shadow-events-types";
import type { KotgBookingWithClient } from "@/lib/google-sheets-types";
import { DeptRosterEditor } from "@/components/kotg/dept-roster-editor";
import { HrEditor } from "@/components/kotg/hr-editor";
import { FinanceEditor } from "@/components/kotg/finance-editor";
import { formatBND, formatDateTime } from "@/lib/utils";

const DEPT_LABEL: Record<string, string> = {
  SALES: "Sales",
  FINANCE: "Finance",
  TECH: "Technical",
  IT: "IT",
  CCM: "CCM",
  HR: "HR",
};

const KEMS_STATUS_LABEL: Record<ShadowEventKemsStatus, string> = {
  ACTIVE: "Active — awaiting Managers",
  MANAGERS_IN_PROGRESS: "Managers in progress",
  HR_UNLOCKED: "HR filling overtime + meal allowance",
  FINANCE_UNLOCKED: "Finance filling remaining costs",
  PUBLISHED: "Published",
};

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireSession();
  const { id: bookingId } = await params;

  // The event id is now the Sheet BookingID — look it up in the live
  // KOTG bookings feed. Missing → notFound.
  let bookings: KotgBookingWithClient[];
  try {
    bookings = await getKotgBookingsWithClients();
    reconcileKotgBookings(bookings);
  } catch {
    // A Sheet outage shouldn't 500 an event detail page — degrade to
    // notFound so the router shows the standard 404 rather than throwing.
    bookings = [];
  }
  const kotg = bookings.find((b) => b.booking.BookingID === bookingId);
  if (!kotg) notFound();

  const shadow = getOrCreateShadowEvent(bookingId);
  const row = projectKotgBookingRow(kotg);
  const showBudget = canViewBudget(user);
  const budget = sumShadowBudget(shadow);
  const status = mapKotgBookingToEventStatus(kotg.booking.Status, shadow.kemsStatus);

  return (
    <div className="space-y-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1 -ml-3">
          <Link href="/events">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to events
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow={kotg.booking.QuotationNumber || bookingId}
        title={kotgDisplayTitle(kotg)}
        description={kotg.booking.Notes || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {row.isLive && <OnAirPill />}
            <StatusBadge status={status} />
          </div>
        }
      />

      {/* KEMS workflow banner — where in the per-dept / HR / Finance flow
          this booking currently sits. Read-only in this pass; editors
          land in the follow-up work orders. */}
      <Card className="border-accent/30 bg-accent/[0.04]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-accent" />
            KEMS workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <span className="font-medium">{KEMS_STATUS_LABEL[shadow.kemsStatus]}</span>
            {shadow.activeNotifiedAt && (
              <span className="text-muted-foreground text-xs ml-2">
                (all-hands notified{" "}
                {new Date(shadow.activeNotifiedAt).toLocaleString("en-GB")})
              </span>
            )}
          </div>
          <DeptCompletionGrid shadow={shadow} />
        </CardContent>
      </Card>

      {/* Quick facts — pulled straight from the Sheet booking. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickFact
          icon={CalendarClock}
          label="Start"
          value={formatDateTime(kotg.booking.StartDate)}
        />
        <QuickFact
          icon={CalendarClock}
          label="End"
          value={formatDateTime(kotg.booking.EndDate)}
        />
        <QuickFact
          icon={MapPin}
          label="Venue"
          value={kotg.booking.LocationDetails || "TBC"}
        />
        <QuickFact
          icon={Building2}
          label="Client"
          value={kotgOrganizerLabel(kotg)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Booking details from the Sheet */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-accent" />
              Booking details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Service" value={kotg.booking.ServiceName} />
            {kotg.customPackage && (
              <>
                <InfoRow label="Custom package" value={kotg.customPackage.PackageName} />
                {showBudget && (
                  <InfoRow
                    label="Package final price"
                    value={
                      kotg.customPackage.FinalPrice ||
                      kotg.customPackage.ComputedTotal ||
                      "—"
                    }
                  />
                )}
              </>
            )}
            {showBudget && !kotg.customPackage && (
              <InfoRow label="Booking price" value={kotg.booking.Price || "—"} />
            )}
            <InfoRow label="Quantity" value={kotg.booking.Quantity} />
            <InfoRow label="Days of week" value={kotg.booking.DaysOfWeek} />
            <InfoRow label="Booking status (Sheet)" value={kotg.booking.Status} />
            <InfoRow
              label="Confirmation"
              value={kotg.booking.ConfirmationStatus}
            />
            <InfoRow label="Sheet notes" value={kotg.booking.Notes} />
          </CardContent>
        </Card>

        {/* Client contact block */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-accent" />
              Client &amp; contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {kotg.client ? (
              <>
                <InfoRow label="Company" value={kotg.client.CompanyName} />
                <InfoRow label="Client name" value={kotg.client.ClientName} />
                <InfoRow label="Industry" value={kotg.client.Industry} />
                <InfoRow label="Contact person (client)" value={kotg.client.ContactPerson} />
                <InfoRow label="Email" value={kotg.client.Email} />
                <InfoRow label="Phone" value={kotg.client.Phone} />
              </>
            ) : (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                Unmatched client — ClientID {kotg.booking.ClientID || "(blank)"}{" "}
                from the booking wasn't found in the Clients sheet.
              </div>
            )}
            <div className="pt-2 border-t space-y-2">
              <div className="callsign">Booking contact (from ServiceBookings)</div>
              <div className="flex items-center gap-2 text-sm">
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{kotg.booking.ContactPersonName || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-mono">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{kotg.booking.ContactPersonEmail || "—"}</span>
              </div>
              {kotg.booking.AgentEmail && (
                <div className="text-xs text-muted-foreground">
                  Sales agent: {kotg.booking.AgentEmail}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget summary — HR OT/meal + Finance-owned other lines from
          the shadow record. Empty state until the editors are wired. */}
      {showBudget && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-accent" />
              KEMS budget summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <BudgetStat label="Overtime (HR)" value={formatBND(budget.overtimeBND)} />
              <BudgetStat
                label="Meal allowance (HR)"
                value={formatBND(budget.mealAllowanceBND)}
              />
              <BudgetStat
                label="Other (Finance)"
                value={formatBND(budget.otherEstBND)}
              />
            </div>
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <span className="callsign">Grand total (est.)</span>
              <span className="text-lg font-mono font-semibold text-accent">
                {formatBND(budget.totalEstBND)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-dept roster editors — one card per dept this user can see.
          Managers see only their own (in edit mode); HR sees every dept
          in read-only mode once the workflow reaches HR_UNLOCKED;
          Super Admin sees every dept in edit mode until finance freezes. */}
      {(() => {
        const visibleDepts = visibleDeptKeysForShadow(user, shadow.kemsStatus);
        if (visibleDepts.length === 0) return null;
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Department rosters</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleDepts.map((deptKey) => {
                const initial =
                  shadow.rosterByDept[deptKey] ?? {
                    completed: false,
                    slots: [],
                    staff: [],
                  };
                const editable = canEditDept(user, deptKey, shadow.kemsStatus);
                return (
                  <DeptRosterEditor
                    key={deptKey}
                    bookingId={bookingId}
                    deptKey={deptKey}
                    initial={initial}
                    readOnly={!editable}
                  />
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* HR block editor — appears once HR_UNLOCKED. Read-only for
          non-HR viewers once the block is populated. */}
      {(shadow.kemsStatus === "HR_UNLOCKED" ||
        shadow.kemsStatus === "FINANCE_UNLOCKED" ||
        shadow.kemsStatus === "PUBLISHED") &&
        canViewBudget(user) && (
          <HrEditor
            bookingId={bookingId}
            initial={shadow.hr.lines}
            completed={shadow.hr.completed}
            readOnly={!canEditHr(user, shadow.kemsStatus)}
          />
        )}

      {/* Finance block editor — appears once FINANCE_UNLOCKED. */}
      {(shadow.kemsStatus === "FINANCE_UNLOCKED" ||
        shadow.kemsStatus === "PUBLISHED") &&
        canViewBudget(user) && (
          <FinanceEditor
            bookingId={bookingId}
            initial={shadow.finance.lines}
            completed={shadow.finance.completed}
            readOnly={!canEditFinance(user, shadow.kemsStatus)}
          />
        )}

      {/* Program flow — read-only. Editor lands with the roster editor
          work order; for now this just displays whatever's been saved. */}
      {shadow.programFlow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-accent" />
              Program flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {[...shadow.programFlow]
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((step) => (
                  <li
                    key={step.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="font-mono text-sm shrink-0">{step.time}</div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-sm font-medium">{step.activity}</div>
                      <div className="text-xs text-muted-foreground">
                        Owner: {step.owner}
                      </div>
                      {step.notes && (
                        <div className="text-xs text-muted-foreground">
                          {step.notes}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Grid of dept-completion chips + HR/Finance chips. Read-only in this
 *  pass — clicking one will open the corresponding editor in a follow-up. */
function DeptCompletionGrid({
  shadow,
}: {
  shadow: import("@/lib/shadow-events-types").ShadowEventRecord;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {MANAGER_DEPT_KEYS.map((k) => {
        const dept = shadow.rosterByDept[k];
        const completed = dept?.completed === true;
        const started =
          !!dept && (completed || dept.slots.length > 0 || dept.staff.length > 0);
        return (
          <CompletionChip
            key={k}
            label={DEPT_LABEL[k] ?? k}
            state={completed ? "done" : started ? "in-progress" : "not-started"}
          />
        );
      })}
      <CompletionChip
        label="HR (OT + meals)"
        state={
          shadow.hr.completed
            ? "done"
            : shadow.kemsStatus === "HR_UNLOCKED" ||
              shadow.kemsStatus === "FINANCE_UNLOCKED" ||
              shadow.kemsStatus === "PUBLISHED"
            ? "in-progress"
            : "locked"
        }
      />
      <CompletionChip
        label="Finance (other)"
        state={
          shadow.finance.completed
            ? "done"
            : shadow.kemsStatus === "FINANCE_UNLOCKED" ||
              shadow.kemsStatus === "PUBLISHED"
            ? "in-progress"
            : "locked"
        }
      />
    </div>
  );
}

function CompletionChip({
  label,
  state,
}: {
  label: string;
  state: "not-started" | "in-progress" | "done" | "locked";
}) {
  const cls =
    state === "done"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : state === "in-progress"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
      : state === "locked"
      ? "bg-muted text-muted-foreground border-border"
      : "bg-secondary text-foreground/70 border-border";
  const icon = state === "done" ? "✓" : state === "in-progress" ? "…" : state === "locked" ? "🔒" : "○";
  return (
    <div
      className={`rounded-md border px-2.5 py-1.5 text-xs flex items-center gap-2 ${cls}`}
    >
      <span className="font-mono">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function QuickFact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="callsign">{label}</span>
      </div>
      <div className="text-sm font-medium truncate">{value || "—"}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <div className="callsign">{label}</div>
      <div className="text-sm leading-relaxed">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function BudgetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="callsign">{label}</div>
      <div className="text-lg font-mono font-semibold text-foreground">{value}</div>
    </div>
  );
}
