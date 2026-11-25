import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Radio,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { OnAirPill, Callsign } from "@/components/shared/broadcast-marks";
import { EmptyState } from "@/components/shared/empty-state";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";
import {
  filterVisibleBookings,
  projectGroupedBookingRows,
} from "@/lib/kotg-projection";
import type { KotgBookingWithClient } from "@/lib/google-sheets-types";

export default async function DashboardPage() {
  const { user } = await requireSession();
  // Source of truth: Sales team's Google Sheet. Any transitions to Active
  // detected here fire the all-hands notification once (idempotent).
  let bookings: KotgBookingWithClient[];
  try {
    const raw = await getKotgBookingsWithClients();
    reconcileKotgBookings(raw);
    // Reconcile against the raw list (so an Active→Cancelled Sheet
    // transition still purges the shadow record), then hide Cancelled
    // from the dashboard so no viewer sees them here.
    bookings = filterVisibleBookings(raw);
  } catch {
    // Sheet outage — degrade to an empty dashboard rather than 500'ing.
    // The KOTG bookings page shows the actual error to Sales users who
    // are the ones equipped to notice/fix a broken service account.
    bookings = [];
  }
  // Grouped projection so the dashboard's counts match the /events list
  // one-for-one — otherwise a two-booking event would inflate Total by
  // one and drag the arithmetic for Completed/Ongoing/Upcoming out of
  // sync with what the user sees in the list.
  const rows = projectGroupedBookingRows(bookings);

  // Partition rows into the three tiles' buckets using the SAME
  // predicates each one uses to populate itself, so Total = Completed +
  // Ongoing + Upcoming always holds (cancelled bookings are already
  // filtered out upstream via filterVisibleBookings). Previously
  // "Ongoing" checked status === "ONGOING" — a status the KOTG
  // projection never emits, so the tile was permanently 0; and
  // "Upcoming" only counted the legacy UPCOMING/APPROVED statuses, so
  // active bookings sitting in STAFFING_IN_PROGRESS / PUBLISHED fell
  // through every bucket and silently disappeared from the summary.
  const completed = rows.filter((r) => r.status === "COMPLETED");
  const ongoing = rows.filter((r) => r.isLive);
  const upcomingRows = rows.filter(
    (r) => !r.isLive && r.status !== "COMPLETED",
  );
  const counts = {
    total: rows.length,
    upcoming: upcomingRows.length,
    ongoing: ongoing.length,
    completed: completed.length,
  };

  // Timeline card below the tiles — same "future, not live, not done"
  // definition as counts.upcoming, so the list and the number match.
  const upcoming = [...upcomingRows]
    .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
    .slice(0, 5);

  const live = ongoing;

  // Recent events panel — the 5 most recently completed events, newest
  // first, so the dashboard shows what just finished without having to
  // jump to the Events list and flip the status filter off "Recent".
  // Sorted by endDate (then startDate as a tiebreaker) so two events
  // that ended the same day order by the one that started later first,
  // which tracks what "most recent" feels like to Sales.
  const recent = [...completed]
    .sort((a, b) => {
      const endCmp = +new Date(b.endDate) - +new Date(a.endDate);
      if (endCmp !== 0) return endCmp;
      return +new Date(b.startDate) - +new Date(a.startDate);
    })
    .slice(0, 5);

  const canCreate = can(user, "events.create");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Signed in as ${user.department}`}
        title={`Welcome back, ${user.fullName.split(" ")[0]}.`}
        description="Here's what's on the schedule — sourced live from the Sales team's bookings sheet."
        actions={
          canCreate && (
            <Button asChild variant="accent" className="gap-2">
              <Link href="/sales/kotg-bookings">
                <ClipboardList className="h-4 w-4" />
                KOTG bookings
              </Link>
            </Button>
          )
        }
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total events"
          value={counts.total}
          icon={ListChecks}
          hint="All statuses"
        />
        <StatCard
          label="Upcoming"
          value={counts.upcoming}
          icon={CalendarClock}
          tone="accent"
          hint="Approved or planned"
        />
        <StatCard
          label="Ongoing"
          value={counts.ongoing}
          icon={Radio}
          tone="onair"
          hint="Live right now"
        />
        <StatCard
          label="Completed"
          value={counts.completed}
          icon={Trophy}
          tone="emerald"
          hint="Debrief pending or done"
        />
      </div>

      {/* Ongoing events — formerly "Live now". Rendered only when at
          least one event's date range covers today; the OnAirPill makes
          the "happening right now" status visually distinct from the
          Upcoming and Recent panels below. */}
      {live.length > 0 && (
        <Card className="border-onair/40 bg-onair/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <OnAirPill />
              <CardTitle>Ongoing events</CardTitle>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/events?filter=live" className="gap-1">
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {live.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-secondary/50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{e.title}</span>
                    <Callsign value={e.refNo} />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.venue}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent events — the 5 most recently completed events, newest
          first. Hidden when nothing has completed yet so an empty org
          doesn't see an empty "Recent" rail. */}
      {recent.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-500" />
              <CardTitle>Recent events</CardTitle>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/events" className="gap-1">
                All events <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="flex items-start gap-4 rounded-lg p-3 hover:bg-secondary/60 transition-colors"
              >
                <div className="w-16 shrink-0 text-center">
                  <div className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-foreground">
                    {new Date(e.endDate || e.startDate).toLocaleDateString("en-GB", {
                      month: "short",
                    })}
                  </div>
                  <div className="text-2xl font-semibold leading-none">
                    {new Date(e.endDate || e.startDate).getDate()}
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{e.title}</span>
                    <StatusBadge status={e.status} />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 truncate">
                    <Callsign value={e.refNo} />
                    <span>·</span>
                    <span className="truncate">{e.venue}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground self-center shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upcoming timeline */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Upcoming events</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/events" className="gap-1">
                All events <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing scheduled"
                description="No upcoming KOTG bookings from the Sales sheet."
                action={
                  canCreate && (
                    <Button asChild variant="accent" size="sm" className="gap-2">
                      <Link href="/sales/kotg-bookings">
                        <ClipboardList className="h-4 w-4" /> View KOTG bookings
                      </Link>
                    </Button>
                  )
                }
              />
            ) : (
              <div className="space-y-1">
                {upcoming.map((e) => (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    className="flex items-start gap-4 rounded-lg p-3 hover:bg-secondary/60 transition-colors"
                  >
                    <div className="w-16 shrink-0 text-center">
                      <div className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-foreground">
                        {new Date(e.startDate).toLocaleDateString("en-GB", {
                          month: "short",
                        })}
                      </div>
                      <div className="text-2xl font-semibold leading-none">
                        {new Date(e.startDate).getDate()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{e.title}</span>
                        <StatusBadge status={e.status} />
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 truncate">
                        <Callsign value={e.refNo} />
                        <span>·</span>
                        <span className="truncate">{e.venue}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground self-center shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {canCreate && (
              <QuickAction
                href="/sales/kotg-bookings"
                icon={ClipboardList}
                title="KOTG bookings"
                subtitle="Live from the Sales sheet"
              />
            )}
            <QuickAction
              href="/calendar"
              icon={CalendarClock}
              title="View calendar"
              subtitle="Month / week / day"
            />
            <QuickAction
              href="/events"
              icon={ListChecks}
              title="All events"
              subtitle="Filter, sort, search"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-secondary/60 transition-colors group"
    >
      <div className="rounded-md bg-accent/10 p-2 text-accent">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}
