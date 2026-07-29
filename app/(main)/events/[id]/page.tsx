import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Users, CalendarClock, DollarSign, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { ExportPDFButton } from "@/components/events/export-pdf-button";
import { EditEventLink } from "@/components/events/edit-event-link";
import { BroadcastRosterTable } from "@/components/events/broadcast-roster-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { OnAirPill, Callsign } from "@/components/shared/broadcast-marks";
import { requireSession } from "@/lib/auth";
import { canViewBudget, canEditEvent } from "@/lib/permissions";
import { getEventById, projectRow } from "@/lib/store";
import { formatBND, formatDateTime } from "@/lib/utils";
import { calculateStaffing, formatDayDate } from "@/lib/roster-calc";
import { EVENT_TYPES, TIMELINE_PHASE_LABEL, VOG_PILLARS } from "@/lib/constants";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;
  const event = getEventById(id);
  if (!event) notFound();

  const row = projectRow(event);
  const showBudget = canViewBudget(user);
  const staffing = calculateStaffing(event.s5.staff ?? []);
  const totalEstManual = event.s6.costs.reduce((s, c) => s + c.estimatedBND, 0);
  const totalEst = totalEstManual + staffing.overtimeBND + staffing.mealAllowanceBND;

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
        eyebrow={event.s1.eventRefNo}
        title={event.s1.eventName}
        description={event.s3.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {row.isLive && <OnAirPill />}
            <StatusBadge status={event.status} />
            <PriorityBadge priority={event.priority} />
            {canEditEvent(user) && <EditEventLink eventId={event.id} />}
            <ExportPDFButton event={event} showBudget={showBudget} />
          </div>
        }
      />

      {/* Quick facts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickFact
          icon={CalendarClock}
          label="Start"
          value={formatDateTime(event.s1.startDate)}
        />
        <QuickFact
          icon={CalendarClock}
          label="End"
          value={formatDateTime(event.s1.endDate)}
        />
        <QuickFact icon={MapPin} label="Venue" value={event.s1.venue} />
        <QuickFact
          icon={Users}
          label="Expected attendance"
          value={
            event.s1.expectedAttendance
              ? event.s1.expectedAttendance.toLocaleString()
              : "—"
          }
        />
      </div>

      {/* Budget Summary — moved above Concept & Objectives (spec §4) */}
      {showBudget && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-accent" />
              Budget summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <BudgetStat label="Manual costs" value={formatBND(totalEstManual)} />
              <BudgetStat
                label="Auto (roster)"
                value={formatBND(staffing.overtimeBND + staffing.mealAllowanceBND)}
              />
              <BudgetStat label="Grand total" value={formatBND(totalEst)} />
            </div>
            {event.s6.costs.length > 0 && (
              <div className="mt-4 pt-4 border-t space-y-1.5">
                <div className="callsign">Cost lines</div>
                <div className="text-sm font-mono text-muted-foreground">
                  {event.s6.costs.length} lines across{" "}
                  {new Set(event.s6.costs.map((c) => c.group)).size} groups ·{" "}
                  {staffing.slotCount} roster shifts
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Concept + Broadcast */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Concept & objectives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Description" value={event.s3.description} />
            <InfoRow
              label="Broadcast / content angle"
              value={event.s3.broadcastAngle}
            />
            <div>
              <div className="callsign mb-2">Objectives</div>
              {event.s3.objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">None recorded.</p>
              ) : (
                <ol className="space-y-1.5">
                  {event.s3.objectives.map((o, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground pt-0.5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <InfoRow label="Target audience" value={event.s3.targetAudience} />
            <InfoRow label="Success metrics" value={event.s3.successMetrics} />
            <InfoRow label="Brand link" value={event.s3.brandLink} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-accent" />
              Broadcast & content plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow
              label="Live broadcast"
              value={
                event.s8.liveBroadcast === "YES"
                  ? "Yes"
                  : event.s8.liveBroadcast === "NO"
                    ? "No"
                    : "TBC"
              }
            />
            <InfoRow
              label="Platforms"
              value={event.s8.platforms.join(", ") || "—"}
            />
            {event.s8.schedule && event.s8.schedule.length > 0 && (
              <div>
                <div className="callsign mb-2">Broadcast schedule</div>
                <div className="space-y-1.5">
                  {event.s8.schedule.map((day, di) => (
                    <div key={di} className="text-sm">
                      <span className="font-medium">{formatDayDate(day.date)}</span>
                      <span className="text-muted-foreground">
                        {" — "}
                        {day.slots
                          .map((s) => `${s.start}–${s.end}`)
                          .join(", ") || "no slots"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Roster per broadcast day (spec §3) */}
            <div className="pt-2">
              <BroadcastRosterTable event={event} />
            </div>
            <InfoRow
              label="Social platforms"
              value={event.s8.socialPlatforms.join(", ") || "—"}
            />
            <InfoRow label="Hashtags" value={event.s8.hashtags.join(" ") || "—"} />
          </CardContent>
        </Card>
      </div>

      {/* Nature */}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Nature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="callsign mb-2">Event types</div>
              <div className="flex flex-wrap gap-1.5">
                {event.s2.types.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  event.s2.types.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-secondary px-2 py-1 text-xs font-medium"
                    >
                      {EVENT_TYPES.find((e) => e.value === t)?.label ?? t}
                    </span>
                  ))
                )}
              </div>
            </div>
            <InfoRow
              label="Classification"
              value={
                event.s2.classification === "COMMERCIAL"
                  ? "💰 Commercial / Paid"
                  : "🤝 Community / CSR"
              }
            />
            {event.s2.classification === "COMMUNITY_CSR" && event.s2.vogPillars?.length ? (
              <div>
                <div className="callsign mb-2">Voice of Good</div>
                <div className="flex flex-wrap gap-1.5">
                  {event.s2.vogPillars.map((p) => {
                    const meta = VOG_PILLARS.find((v) => v.value === p);
                    return (
                      <span
                        key={p}
                        className="rounded-md bg-accent/10 text-accent px-2 py-1 text-xs font-medium"
                      >
                        {meta?.icon} {meta?.label ?? p}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {event.s2.classification === "COMMERCIAL" && (
              <>
                <InfoRow label="Client" value={event.s2.clientName} />
                {showBudget && (
                  <InfoRow
                    label="Agreed fee"
                    value={formatBND(event.s2.agreedFeeBND ?? 0)}
                  />
                )}
                <InfoRow label="Scope" value={event.s2.scopeOfServices} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline progress */}
      {event.s7.tasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {(
                ["CONCEPT_APPROVAL", "PRODUCTION_LOGISTICS", "BROADCAST_CONTENT", "EVENT_DAY", "POST_EVENT"] as const
              ).map((phase) => {
                const tasks = event.s7.tasks.filter((t) => t.phase === phase);
                const done = tasks.filter((t) => t.status === "DONE").length;
                return (
                  <div key={phase} className="space-y-1.5 rounded-lg border p-3">
                    <div className="callsign">{TIMELINE_PHASE_LABEL[phase]}</div>
                    <div className="text-lg font-mono">
                      {done}
                      <span className="text-muted-foreground">/{tasks.length}</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{
                          width: tasks.length ? `${(done / tasks.length) * 100}%` : "0%",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debrief if present */}
      {event.status === "COMPLETED" && event.s10.overallRating && (
        <Card>
          <CardHeader>
            <CardTitle>Debrief</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <BudgetStat label="Attendance" value={event.s10.actualAttendance?.toString() ?? "—"} />
              <BudgetStat label="Broadcast reach" value={event.s10.broadcastReach?.toString() ?? "—"} />
              <BudgetStat label="Rating" value={`${event.s10.overallRating} / 5`} />
            </div>
            <InfoRow label="What went well" value={event.s10.whatWentWell} />
            <InfoRow label="Improvements" value={event.s10.improvements} />
          </CardContent>
        </Card>
      )}
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
      <div className="text-sm font-medium truncate">{value}</div>
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

function BudgetStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "rose";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="space-y-1">
      <div className="callsign">{label}</div>
      <div className={`text-lg font-mono font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
