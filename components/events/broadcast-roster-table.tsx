import { CalendarDays } from "lucide-react";
import { formatDayDate } from "@/lib/roster-calc";
import { DEPT_ROSTER } from "@/lib/constants";
import type { EventConcept, RosterSlot } from "@/lib/types";

/**
 * Renders a compact per-broadcast-day roster:
 *   for each date in s8.schedule, list every staff shift on that date with
 *   name, department, role, start/end, and All Day flag.
 * Falls back gracefully when no schedule or no shifts are defined.
 */
export function BroadcastRosterTable({ event }: { event: EventConcept }) {
  const staff = event.s5?.staff ?? [];
  const schedule = event.s8?.schedule ?? [];

  // Fast lookups.
  const nameToDept = new Map<string, string>();
  const keyToDept = new Map<string, string>();
  for (const d of DEPT_ROSTER) {
    keyToDept.set(d.key, d.label);
    for (const m of d.members) nameToDept.set(m, d.label);
  }

  type Row = {
    staffName: string;
    departmentLabel: string;
    role: string;
    slot: RosterSlot;
  };
  const byDate = new Map<string, Row[]>();

  // Staff who are assigned but have no shifts — surfaced separately below.
  type Unscheduled = { staffName: string; departmentLabel: string; role: string };
  const unscheduled: Unscheduled[] = [];

  for (const line of staff) {
    const displayName =
      (line.assignedTo && line.assignedTo.trim()) ||
      (line.role && line.role.trim()) ||
      "—";
    // Department resolution — prefer the explicit deptKey stored on the
    // staff line (set when added via department checklist), then fall back
    // to a name lookup, then to Internal/External based on the category.
    const deptLabel =
      (line.deptKey && keyToDept.get(line.deptKey)) ||
      nameToDept.get(displayName) ||
      (line.category === "INTERNAL" ? "Internal" : "External");
    const roleLabel = nameToDept.has(line.role)
      ? (line.assignedTo ?? "—")
      : line.role || "—";

    const slots = line.rosterSlots ?? [];
    if (slots.length === 0) {
      unscheduled.push({ staffName: displayName, departmentLabel: deptLabel, role: roleLabel });
      continue;
    }
    for (const slot of slots) {
      const arr = byDate.get(slot.date) ?? [];
      arr.push({ staffName: displayName, departmentLabel: deptLabel, role: roleLabel, slot });
      byDate.set(slot.date, arr);
    }
  }

  const days = schedule.filter((d) => d.date);
  const anyShifts = Array.from(byDate.values()).some((v) => v.length > 0);

  if (days.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
        Broadcast schedule not set — no roster days to display yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-3.5 w-3.5 text-accent" />
        <div className="callsign">Assigned staff by broadcast day</div>
      </div>

      {!anyShifts && (
        <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          No shifts have been rostered against these broadcast days yet.
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="bg-amber-500/10 px-3 py-2 border-b border-amber-500/20">
            <div className="text-xs font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Assigned but not yet scheduled
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {unscheduled.map((u, i) => (
                  <tr key={i} className="border-b last:border-0 border-amber-500/10">
                    <td className="px-3 py-2 font-medium">{u.staffName}</td>
                    <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                      {u.departmentLabel}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                      {u.role}
                    </td>
                    <td className="px-3 py-2 text-[0.7rem] text-muted-foreground italic text-right">
                      No shifts yet
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {days.map((day) => {
        const rows = byDate.get(day.date) ?? [];
        return (
          <div key={day.date} className="rounded-lg border overflow-hidden">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2 border-b">
              <div className="text-sm font-medium">{formatDayDate(day.date)}</div>
              <div className="text-[0.7rem] font-mono text-muted-foreground">
                {rows.length} {rows.length === 1 ? "shift" : "shifts"}
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                No staff rostered on this day.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground border-b">
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Department</th>
                      <th className="text-left px-3 py-2 hidden md:table-cell">Role</th>
                      <th className="text-left px-3 py-2">Start</th>
                      <th className="text-left px-3 py-2">End</th>
                      <th className="text-left px-3 py-2">All Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{r.staffName}</td>
                        <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">
                          {r.departmentLabel}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">
                          {r.role}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.slot.allDay ? "—" : r.slot.start}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.slot.allDay ? "—" : r.slot.end}
                        </td>
                        <td className="px-3 py-2">
                          {r.slot.allDay ? (
                            <span className="rounded bg-accent/10 text-accent px-1.5 py-0.5 text-[0.65rem] font-mono uppercase tracking-wider">
                              All day
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[0.7rem]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
