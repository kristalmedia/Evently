import Link from "next/link";
import {
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  DollarSign,
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
import { can, canViewBudget } from "@/lib/permissions";
import { calculateStaffing } from "@/lib/roster-calc";
import { getAllEvents, getEventRows } from "@/lib/store";
import { formatBND, formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const { user } = await requireSession();
  const rows = getEventRows();
  const showBudget = canViewBudget(user);

  // Budget rollup (only computed if user can see it)
  const events = showBudget ? getAllEvents() : [];
  const budget = events.reduce(
    (acc, e) => {
      const staffing = calculateStaffing(e.s5.staff ?? []);
      const manual = e.s6.costs.reduce((s, c) => s + c.estimatedBND, 0);
      const total = manual + staffing.overtimeBND + staffing.mealAllowanceBND;
      acc.totalEst += total;
      acc.overtime += staffing.overtimeBND;
      acc.meals += staffing.mealAllowanceBND;
      return acc;
    },
    { totalEst: 0, overtime: 0, meals: 0 }
  );

  const counts = {
    total: rows.length,
    upcoming: rows.filter((r) => r.status === "UPCOMING" || r.status === "APPROVED").length,
    ongoing: rows.filter((r) => r.status === "ONGOING").length,
    completed: rows.filter((r) => r.status === "COMPLETED").length,
  };

  const upcoming = rows
    .filter((r) => ["UPCOMING", "APPROVED", "PENDING_APPROVAL"].includes(r.status))
    .sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate))
    .slice(0, 5);

  const live = rows.filter((r) => r.isLive);

  const canCreate = can(user, "events.create");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Signed in as ${user.department}`}
        title={`Welcome back, ${user.fullName.split(" ")[0]}.`}
        description="Here's what's on the schedule."
        actions={
          canCreate && (
            <Button asChild variant="accent" className="gap-2">
              <Link href="/events/new">
                <CalendarPlus className="h-4 w-4" />
                Create event
              </Link>
            </Button>
          )
        }
      />

      {/* Budget Summary — top of page for authorised users */}
      {showBudget && (
        <Card className="border-accent/30 bg-gradient-to-br from-accent/[0.04] to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-accent" />
              Budget summary — all events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="callsign">Total estimated (est.)</div>
                <div className="text-2xl font-mono font-semibold text-accent">
                  {formatBND(budget.totalEst)}
                </div>
                <div className="text-xs text-muted-foreground">Across {events.length} events</div>
              </div>
              <div className="space-y-1">
                <div className="callsign">Overtime</div>
                <div className="text-2xl font-mono font-semibold">
                  {formatBND(budget.overtime)}
                </div>
                <div className="text-xs text-muted-foreground">Auto from rosters</div>
              </div>
              <div className="space-y-1">
                <div className="callsign">Meal allowance</div>
                <div className="text-2xl font-mono font-semibold">
                  {formatBND(budget.meals)}
                </div>
                <div className="text-xs text-muted-foreground">Auto from rosters</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Live now */}
      {live.length > 0 && (
        <Card className="border-onair/40 bg-onair/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <OnAirPill />
              <CardTitle>Live now</CardTitle>
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
                description="Create a new event to see it here."
                action={
                  canCreate && (
                    <Button asChild variant="accent" size="sm" className="gap-2">
                      <Link href="/events/new">
                        <CalendarPlus className="h-4 w-4" /> New event
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
                href="/events/new"
                icon={CalendarPlus}
                title="Create event"
                subtitle="Start a new concept brief"
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
              title="Manage events"
              subtitle="Filter, sort, edit"
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
