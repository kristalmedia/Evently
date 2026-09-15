"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Coffee,
  Download,
  FileDown,
  Lock,
  Save,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  MealTickMap,
  OvertimeLine,
} from "@/lib/shadow-events-types";
import { formatBND } from "@/lib/utils";
import { exportHrCsv, exportHrPdf, type HrExportBundle } from "@/lib/hr-export";

/** One row of the flat cross-dept roster the HR editor works from —
 *  every roster slot from every department, with the staff user
 *  already resolved server-side so the client can filter for OT
 *  eligibility without a second fetch. */
export interface FlatRosterRow {
  slotId: string;
  deptKey: string;
  deptLabel: string;
  staffUserId: string;
  staffName: string;
  /** User.department of the staff member. Cached at page render; the
   *  server does the resolution so a client-side directory-fetch race
   *  can't produce a row that suddenly loses its dept. */
  staffDept: string;
  date: string;
  start: string;
  end: string;
}

/** OT is restricted to these departments by business rule (matches
 *  OT_ELIGIBLE_DEPTS in app/api/kotg/[bookingId]/hr/route.ts). */
const OT_ELIGIBLE_DEPTS = ["IT", "Technical"];

function mealForTick(t: { am: boolean; pm: boolean }): number {
  return (t.am ? 5 : 0) + (t.pm ? 5 : 0);
}

/** Auto-classify a roster shift into AM / PM / Full-day based purely on
 *  its start and end times. Cutoff at 12:00.
 *
 *    ends at/before 12:00 (e.g. 08:00–12:00)  → AM  only
 *    starts at/after 12:00 (e.g. 13:00–22:00) → PM  only
 *    spans 12:00          (e.g. 09:00–22:00) → both (full day)
 *
 *  Used as the default meal-allowance tick for any slot HR hasn't
 *  explicitly touched — so ticks pre-populate to what the shift's own
 *  times imply. HR can still override by clicking any tick. */
export function classifyShift(start: string, end: string): { am: boolean; pm: boolean } {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (!s || !e) return { am: false, pm: false };
  const startsBefore12 = s.localeCompare("12:00") < 0;
  const endsAfter12 = e.localeCompare("12:00") > 0;
  return { am: startsBefore12, pm: endsAfter12 };
}

/** Convenience wrapper — was the shift's time range naturally a full
 *  day (spans both halves)? Used for the mobile ★ hint on the
 *  "Full day" chip. */
function isFullDayShift(start: string, end: string): boolean {
  const c = classifyShift(start, end);
  return c.am && c.pm;
}

/**
 * HR block editor — rewritten post-pivot:
 *   • Meal allowance is derived from a per-slot AM/PM tick grid at
 *     BND 5 per half (both = BND 10). HR ticks; the sum is display-only.
 *   • Overtime is HR-typed per row, but only for staff whose User.department
 *     is IT or Technical AND who appear in the current roster.
 *   • Two separate totals + a grand total.
 *   • Export as PDF or CSV.
 *
 * The Meal and OT sections don't share state; they can be edited in
 * any order and saved together with a single PUT.
 */
export function HrEditor({
  bookingId,
  bundleInfo,
  roster,
  initialMealTicks,
  initialOvertime,
  completed,
  readOnly = false,
  viewerDiagnostic,
}: {
  bookingId: string;
  /** Booking header info for the exports — title, client, venue. Passed
   *  from the server so the exports don't need a second fetch. */
  bundleInfo: { displayTitle: string; clientName: string; venue: string };
  roster: FlatRosterRow[];
  initialMealTicks: MealTickMap;
  initialOvertime: OvertimeLine[];
  completed: boolean;
  readOnly?: boolean;
  /** Server-computed diagnostic — displayed in the read-only banner so
   *  the user can see exactly why edits are frozen (role mismatch,
   *  wrong workflow stage, block already completed). Removed once the
   *  permission story stabilises. */
  viewerDiagnostic?: {
    role: string;
    secondaryRole?: string;
    kemsStatus: string;
    isSuperAdmin: boolean;
    isHr: boolean;
  };
}) {
  const router = useRouter();
  // Seed the ticks state with a time-based auto-classification for
  // any roster slot HR hasn't explicitly ticked yet. That way a fresh
  // HR editor opens with sensible defaults derived from the shift
  // times (09:00–12:00 → AM, 13:00–22:00 → PM, 09:00–22:00 → both)
  // rather than everything empty. HR can still override any tick.
  const [ticks, setTicks] = useState<MealTickMap>(() => {
    const seeded: MealTickMap = { ...initialMealTicks };
    for (const r of roster) {
      if (!(r.slotId in seeded)) {
        seeded[r.slotId] = classifyShift(r.start, r.end);
      }
    }
    return seeded;
  });

  // Overtime: keyed by slotId. OT rows are auto-generated per
  // IT/Technical shift in the roster (see otRows below) — HR just
  // types an amount into each pre-existing row. That mirrors how the
  // meal-allowance grid works: nothing to add, nothing to remove,
  // only per-shift values to fill in.
  const [otAmounts, setOtAmounts] = useState<Record<string, number>>(() => {
    const seeded: Record<string, number> = {};
    for (const l of initialOvertime) {
      if (l.slotId) seeded[l.slotId] = l.amountBND;
    }
    return seeded;
  });
  const [otNotes, setOtNotes] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const l of initialOvertime) {
      if (l.slotId && l.notes) seeded[l.slotId] = l.notes;
    }
    return seeded;
  });
  const [busy, setBusy] = useState(false);

  // Every roster shift whose staff belongs to an OT-eligible dept —
  // these become the OT input rows one-for-one. Rows appear the
  // moment a Manager adds an IT/Technical shift; no picker needed.
  const otRows = useMemo(
    () => roster.filter((r) => OT_ELIGIBLE_DEPTS.includes(r.staffDept)),
    [roster],
  );

  // Meal tick manipulation
  function toggleTick(slotId: string, half: "am" | "pm") {
    setTicks((prev) => {
      const cur = prev[slotId] ?? { am: false, pm: false };
      const next: MealTickMap = {
        ...prev,
        [slotId]: { ...cur, [half]: !cur[half] },
      };
      return next;
    });
  }

  /** Toggle both halves at once. If either half is off, turn both on;
   *  if both are on, turn both off. Convenient for full-day shifts. */
  function toggleBoth(slotId: string) {
    setTicks((prev) => {
      const cur = prev[slotId] ?? { am: false, pm: false };
      const bothOn = cur.am && cur.pm;
      return {
        ...prev,
        [slotId]: { am: !bothOn, pm: !bothOn },
      };
    });
  }

  function setOtAmount(slotId: string, amount: number) {
    setOtAmounts((prev) => ({ ...prev, [slotId]: amount }));
  }
  function setOtNote(slotId: string, note: string) {
    setOtNotes((prev) => ({ ...prev, [slotId]: note }));
  }

  /** Materialise the current OT state back into the OvertimeLine[]
   *  shape the API expects. Only rows with a positive amount are sent
   *  — a zero row means "HR didn't grant OT for this shift", which
   *  shouldn't take up a row in the persisted record. */
  function materializeOtLines(): OvertimeLine[] {
    return otRows
      .map((r) => {
        const amt = otAmounts[r.slotId] ?? 0;
        if (!(amt > 0)) return null;
        return {
          id: `otl_${r.slotId}`,
          slotId: r.slotId,
          staffUserId: r.staffUserId,
          staffName: r.staffName,
          staffDept: r.staffDept,
          amountBND: amt,
          notes: otNotes[r.slotId] || undefined,
        } as OvertimeLine;
      })
      .filter((l): l is OvertimeLine => l !== null);
  }

  // Totals — kept fully derived, never stored.
  const mealTotal = useMemo(
    () => Object.values(ticks).reduce((s, t) => s + mealForTick(t), 0),
    [ticks],
  );
  const overtimeTotal = useMemo(
    () =>
      otRows.reduce((s, r) => {
        const amt = otAmounts[r.slotId] ?? 0;
        return s + (Number.isFinite(amt) ? amt : 0);
      }, 0),
    [otRows, otAmounts],
  );

  async function put(complete: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/kotg/${bookingId}/hr`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealTicks: ticks,
          overtime: materializeOtLines(),
          complete,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(complete ? "HR marked complete — Finance next" : "HR saved", {
        position: "bottom-center",
      });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function buildBundle(): HrExportBundle {
    return {
      bookingId,
      displayTitle: bundleInfo.displayTitle,
      clientName: bundleInfo.clientName,
      venue: bundleInfo.venue,
      meal: roster
        .map((r) => {
          const t = ticks[r.slotId] ?? { am: false, pm: false };
          const amount = mealForTick(t);
          if (amount === 0) return null;
          return {
            kind: "meal" as const,
            dept: r.deptLabel,
            staff: r.staffName || "—",
            date: r.date,
            shift: [t.am ? "AM" : null, t.pm ? "PM" : null].filter(Boolean).join(" + "),
            amount,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      overtime: otRows
        .map((r) => {
          const amt = otAmounts[r.slotId] ?? 0;
          if (!(amt > 0)) return null;
          return {
            kind: "overtime" as const,
            dept: r.staffDept,
            staff: r.staffName,
            date: r.date,
            shift: `${r.start}–${r.end}`,
            amount: amt,
            notes: otNotes[r.slotId] || undefined,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      mealTotal,
      overtimeTotal,
    };
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>HR — Overtime &amp; Meal Allowance</span>
          {completed && (
            <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Explicit read-only banner — the ticks and inputs render but
            silently ignore clicks when readOnly / completed. Without
            this, a viewer would rightfully wonder why the checkboxes
            do nothing. */}
        {(readOnly || completed) && (
          <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              {completed ? (
                <div>
                  <span className="font-medium">Read-only — HR block completed.</span>{" "}
                  Ticks and OT rows are frozen. Super Admin can reopen by
                  editing the shadow record directly.
                </div>
              ) : (
                <div>
                  <span className="font-medium">Read-only — you don't have HR edit access.</span>{" "}
                  Only users with the HR role (or Super Admin) can tick meal
                  allowance / edit overtime on this booking.
                </div>
              )}
              {viewerDiagnostic && (
                <div className="font-mono text-[0.68rem] text-muted-foreground pt-1 border-t border-border/60 mt-1">
                  You are: role={viewerDiagnostic.role}
                  {viewerDiagnostic.secondaryRole
                    ? ` (+${viewerDiagnostic.secondaryRole})`
                    : ""}
                  {" · "}kemsStatus={viewerDiagnostic.kemsStatus}
                  {" · "}completed={String(completed)}
                  {" · "}readOnly={String(readOnly)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Distinct totals — meal on the left, OT on the right, grand
            total on its own row so the two never visually blur. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border p-3 bg-emerald-500/[0.04] border-emerald-500/30">
            <div className="callsign inline-flex items-center gap-1.5">
              <Coffee className="h-3 w-3" /> Meal allowance
            </div>
            <div className="font-mono text-xl font-semibold text-emerald-700 dark:text-emerald-400">
              {formatBND(mealTotal)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              BND 5 per AM/PM tick
            </div>
          </div>
          <div className="rounded-md border p-3 bg-amber-500/[0.04] border-amber-500/30">
            <div className="callsign inline-flex items-center gap-1.5">
              <Timer className="h-3 w-3" /> Overtime
            </div>
            <div className="font-mono text-xl font-semibold text-amber-700 dark:text-amber-400">
              {formatBND(overtimeTotal)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              IT &amp; Technical only
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="callsign">Grand total</div>
            <div className="font-mono text-xl font-semibold">
              {formatBND(mealTotal + overtimeTotal)}
            </div>
          </div>
        </div>

        {/* Export row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="callsign">Export</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportHrPdf(buildBundle()).catch((e) => toast.error((e as Error).message))}
            className="gap-1.5"
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportHrCsv(buildBundle())}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </div>

        {/* Meal allowance grid — one row per roster slot across every
            dept. Renders as a card list on mobile (< sm) and a compact
            table on tablet/desktop, so HR can tick from a phone at
            venue without horizontal-scrolling a table. */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="callsign inline-flex items-center gap-1.5">
              <Coffee className="h-3 w-3" /> Meal allowance — tick per shift
            </div>
            <div className="text-[0.68rem] text-muted-foreground">
              Auto-ticked from shift times · ends by 12:00 = AM, starts at 12:00
              or later = PM, spans 12:00 = full day. Click any tick to override.
            </div>
          </div>
          {roster.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No roster shifts exist yet — Managers haven't finished their
              blocks. HR ticks appear here once shifts are entered.
            </div>
          ) : (
            <>
              {/* Desktop / tablet: real table for density. Toggle
                  cells are explicit <button>s (not native <input
                  type=checkbox>) because the native control's
                  disabled/checked state was ambiguous in the dark
                  theme and — critically — its click event was being
                  silently swallowed in some Windows browser builds.
                  Buttons are unambiguously visible AND reliable. */}
              <div className="hidden sm:block rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left px-2 py-1.5">Dept</th>
                      <th className="text-left px-2 py-1.5">Staff</th>
                      <th className="text-left px-2 py-1.5">Date</th>
                      <th className="text-left px-2 py-1.5">Shift</th>
                      <th className="text-center px-2 py-1.5">AM</th>
                      <th className="text-center px-2 py-1.5">PM</th>
                      <th className="text-center px-2 py-1.5">Both</th>
                      <th className="text-right px-2 py-1.5">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((r) => {
                      const t = ticks[r.slotId] ?? { am: false, pm: false };
                      const amt = mealForTick(t);
                      const both = t.am && t.pm;
                      return (
                        <tr key={r.slotId} className="border-t">
                          <td className="px-2 py-1.5 text-muted-foreground">{r.deptLabel}</td>
                          <td className="px-2 py-1.5">{r.staffName || "—"}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{r.date}</td>
                          <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">
                            {r.start}–{r.end}
                          </td>
                          <td className="text-center px-2 py-1.5">
                            <ToggleBox
                              on={t.am}
                              onClick={() => toggleTick(r.slotId, "am")}
                              disabled={readOnly || completed}
                              label={`AM meal allowance for ${r.staffName || "shift"}`}
                            />
                          </td>
                          <td className="text-center px-2 py-1.5">
                            <ToggleBox
                              on={t.pm}
                              onClick={() => toggleTick(r.slotId, "pm")}
                              disabled={readOnly || completed}
                              label={`PM meal allowance for ${r.staffName || "shift"}`}
                            />
                          </td>
                          <td className="text-center px-2 py-1.5">
                            {/* Quick-toggle for full-day shifts. Ticks
                                or clears both halves in one click. */}
                            <button
                              type="button"
                              onClick={() => toggleBoth(r.slotId)}
                              disabled={readOnly || completed}
                              className={`rounded-md border px-2 py-0.5 text-[0.65rem] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                both
                                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                                  : "border-input hover:bg-secondary"
                              }`}
                              aria-label={`Toggle full-day meal allowance for ${r.staffName || "shift"}`}
                              title="Tick or clear both AM + PM"
                            >
                              {both ? "✓ full day" : "full day"}
                            </button>
                          </td>
                          <td className="text-right px-2 py-1.5 font-mono">
                            {amt > 0 ? formatBND(amt) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile: stacked cards, one per shift, with big
                  touch-friendly toggle chips instead of tiny checkboxes.
                  A shift that already covers both halves in the source
                  time range (e.g. 08:00–17:00) shows the "Full day"
                  chip pre-highlighted as a hint. */}
              <div className="sm:hidden space-y-2">
                {roster.map((r) => {
                  const t = ticks[r.slotId] ?? { am: false, pm: false };
                  const amt = mealForTick(t);
                  const spansBoth = isFullDayShift(r.start, r.end);
                  return (
                    <div key={r.slotId} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {r.staffName || "—"}
                          </div>
                          <div className="text-[0.7rem] text-muted-foreground font-mono">
                            {r.deptLabel} · {r.date} · {r.start}–{r.end}
                          </div>
                        </div>
                        <span className="font-mono text-sm">
                          {amt > 0 ? formatBND(amt) : "—"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <TickChip
                          label="AM"
                          on={t.am}
                          onClick={() => toggleTick(r.slotId, "am")}
                          disabled={readOnly || completed}
                        />
                        <TickChip
                          label="PM"
                          on={t.pm}
                          onClick={() => toggleTick(r.slotId, "pm")}
                          disabled={readOnly || completed}
                        />
                        <TickChip
                          label={spansBoth ? "Full day ★" : "Full day"}
                          on={t.am && t.pm}
                          onClick={() => toggleBoth(r.slotId)}
                          disabled={readOnly || completed}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Overtime section — auto-generated one row per IT / Technical
            shift that already exists in the roster. HR just types an
            amount into each row; leaving it 0 means "no OT for this
            shift" and it's dropped on save. Same "no picker, one row
            per shift" shape as the meal-allowance grid above. */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="callsign inline-flex items-center gap-1.5">
              <Timer className="h-3 w-3" /> Overtime — IT &amp; Technical staff
            </div>
            <div className="text-[0.68rem] text-muted-foreground">
              One row per IT / Technical shift in the roster. Type an amount
              per shift; leave blank if no OT applies.
            </div>
          </div>
          {otRows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No IT or Technical staff in the roster — nothing to compensate.
              Rows will appear here automatically once a Manager adds an IT or
              Technical shift.
            </div>
          ) : (
            <>
              {/* Desktop / tablet — table for density and quick scan. */}
              <div className="hidden sm:block rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left px-2 py-1.5">Dept</th>
                      <th className="text-left px-2 py-1.5">Staff</th>
                      <th className="text-left px-2 py-1.5">Date</th>
                      <th className="text-left px-2 py-1.5">Shift</th>
                      <th className="text-left px-2 py-1.5">Notes</th>
                      <th className="text-right px-2 py-1.5 whitespace-nowrap">
                        Amount (BND)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {otRows.map((r) => (
                      <tr key={r.slotId} className="border-t">
                        <td className="px-2 py-1.5 text-muted-foreground uppercase text-xs font-mono">
                          {r.staffDept}
                        </td>
                        <td className="px-2 py-1.5">{r.staffName || "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">{r.date}</td>
                        <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">
                          {r.start}–{r.end}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            placeholder="Reason / notes"
                            value={otNotes[r.slotId] ?? ""}
                            onChange={(e) => setOtNote(r.slotId, e.target.value)}
                            disabled={readOnly || completed}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="0.00"
                            value={otAmounts[r.slotId] ?? 0}
                            onChange={(e) =>
                              setOtAmount(
                                r.slotId,
                                Number.parseFloat(e.target.value) || 0,
                              )
                            }
                            disabled={readOnly || completed}
                            className="h-8 w-28 text-right font-mono ml-auto"
                            aria-label={`Overtime amount for ${r.staffName}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: same content in stacked-card form so nothing
                  gets clipped and every input is thumb-sized. */}
              <div className="sm:hidden space-y-2">
                {otRows.map((r) => (
                  <div key={r.slotId} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {r.staffName || "—"}
                        </div>
                        <div className="text-[0.7rem] text-muted-foreground font-mono">
                          {r.staffDept} · {r.date} · {r.start}–{r.end}
                        </div>
                      </div>
                      <div className="relative shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[0.65rem] font-mono text-muted-foreground pointer-events-none">
                          BND
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="0.00"
                          value={otAmounts[r.slotId] ?? 0}
                          onChange={(e) =>
                            setOtAmount(
                              r.slotId,
                              Number.parseFloat(e.target.value) || 0,
                            )
                          }
                          disabled={readOnly || completed}
                          className="h-9 w-28 pl-10 text-right font-mono"
                          aria-label={`Overtime amount for ${r.staffName}`}
                        />
                      </div>
                    </div>
                    <Input
                      placeholder="Reason / notes"
                      value={otNotes[r.slotId] ?? ""}
                      onChange={(e) => setOtNote(r.slotId, e.target.value)}
                      disabled={readOnly || completed}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {!readOnly && !completed && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => put(false)}
                disabled={busy}
                className="gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={() => {
                  if (
                    !confirm(
                      "Mark HR complete? Finance (Putri) will be able to fill her block next; you'll no longer be able to edit HR ticks or overtime.",
                    )
                  ) {
                    return;
                  }
                  put(true);
                }}
                disabled={busy}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark complete
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Small dropdown-picker for adding an OT row — kept out of the main
 *  component for readability. Renders as a native <select> whose choice
 *  event fires `onAdd`, then resets. */
/** Compact desktop toggle used in place of a native checkbox inside
 *  the meal-allowance table. Explicit <button>, so no browser-level
 *  quirks around <input type="checkbox"> click swallowing or dark-theme
 *  rendering. Filled emerald when on, plain outline when off. */
function ToggleBox({
  on,
  onClick,
  disabled,
  label,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center h-6 w-6 rounded border text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        on
          ? "bg-emerald-500 border-emerald-600 text-white"
          : "border-input hover:bg-secondary"
      }`}
    >
      {on ? "✓" : ""}
    </button>
  );
}

/** Touch-friendly toggle chip for the mobile meal-allowance card
 *  view. Bigger tap target than a native checkbox and reads state at
 *  a glance from colour. */
function TickChip({
  label,
  on,
  onClick,
  disabled,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`h-10 rounded-md border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        on
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : "border-input hover:bg-secondary"
      }`}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

