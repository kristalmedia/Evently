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
import { apiPath } from "@/lib/api-path";

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
  otReadOnly,
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
  /** Gates the meal-allowance tick grid, the "Mark complete" button
   *  and the underlying Save-that-includes-meal path. HR + Super Admin. */
  readOnly?: boolean;
  /** Gates the overtime amount + notes inputs specifically. Broader
   *  than readOnly — Finance Lead (Putri) can edit OT during her turn
   *  even after HR marked the block complete. Defaults to `readOnly`
   *  when omitted so nothing changes for callers that don't pass it. */
  otReadOnly?: boolean;
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
  // Default otReadOnly to readOnly for backwards compatibility.
  const otLocked = otReadOnly ?? readOnly;
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

  // Overtime state was removed — HR now enters OT amounts by hand on
  // the printed PDF, not in KEMS. The on-screen OT section is info-only
  // (which shifts qualify), and the PDF export renders blank Notes /
  // Amount columns for handwriting. `initialOvertime` is intentionally
  // unused on the client but kept in the API/type contract so existing
  // shadow records survive round-trips.
  void initialOvertime;
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

  // OT amounts are entered by hand on the printed PDF, so nothing to
  // materialise on save — the API contract still accepts overtime[]
  // but the client sends an empty array to keep the persisted record
  // clean.
  function materializeOtLines(): OvertimeLine[] {
    return [];
  }

  // Meal total is kept fully derived, never stored.
  const mealTotal = useMemo(
    () => Object.values(ticks).reduce((s, t) => s + mealForTick(t), 0),
    [ticks],
  );

  async function put(complete: boolean) {
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/kotg/${bookingId}/hr`), {
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
      // For the PDF form, every IT/Technical shift becomes an OT row
      // with a BLANK amount and notes — HR fills those in by hand on
      // the printed page. Zero amounts here tell the exporter to
      // leave the cells empty rather than print "0.00".
      overtime: otRows.map((r) => ({
        kind: "overtime" as const,
        dept: r.staffDept,
        staff: r.staffName,
        date: r.date,
        shift: `${r.start}–${r.end}`,
        amount: 0,
        notes: undefined,
      })),
      mealTotal,
      overtimeTotal: 0,
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
        {/* Explicit read-only banner — describes what's editable and
            what isn't for the current viewer.
              • Fully locked (readOnly + otLocked) → "read-only"
              • Meal locked, OT open (Finance Lead post-HR-complete) →
                "OT-only edit" banner explaining the split
              • HR block completed but viewer is HR → "block completed"
                note (meal locked, but no misleading full lock message
                since Finance can still adjust OT). */}
        {(readOnly || completed) && (
          <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              {readOnly && !otLocked ? (
                <div>
                  <span className="font-medium">You can edit overtime amounts only.</span>{" "}
                  Meal-allowance ticks are HR's decision and are locked here;
                  adjust OT and click Save. Meal ticks will remain whatever HR
                  set.
                </div>
              ) : completed ? (
                <div>
                  <span className="font-medium">Read-only — HR block completed.</span>{" "}
                  Meal ticks are frozen. Overtime amounts can still be adjusted
                  by Finance Lead until the booking is published.
                </div>
              ) : (
                <div>
                  <span className="font-medium">Read-only — you don't have HR edit access.</span>{" "}
                  Only HR (meal + OT), Finance Lead (OT only, during her turn)
                  or Super Admin can edit here.
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
                  {" · "}otLocked={String(otLocked)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Meal-allowance total only — the overtime total was removed
            per HR's request. OT amounts are HR's / Finance's manual
            per-shift entries and each row shows its own amount below;
            an aggregate at the top wasn't adding value and made it
            look like KEMS was calculating OT automatically. */}
        <div className="rounded-md border p-3 bg-emerald-500/[0.04] border-emerald-500/30 max-w-sm">
          <div className="callsign inline-flex items-center gap-1.5">
            <Coffee className="h-3 w-3" /> Meal allowance total
          </div>
          <div className="font-mono text-xl font-semibold text-emerald-700 dark:text-emerald-400">
            {formatBND(mealTotal)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            BND 5 per AM/PM tick · overtime is entered per shift below
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

        {/* Overtime section — info-only on screen. Notes + Amount fields
            were removed per HR's request; those are filled in by hand
            on the printed PDF (see exportHrPdf — the PDF renders blank
            Notes and Amount columns for handwriting). The on-screen
            table exists so HR can see WHICH shifts qualify for OT
            before printing. */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="callsign inline-flex items-center gap-1.5">
              <Timer className="h-3 w-3" /> Overtime — IT &amp; Technical staff
            </div>
            <div className="text-[0.68rem] text-muted-foreground">
              One row per IT / Technical shift in the roster. Export as PDF
              — the printed form has blank Notes and Amount columns for HR
              to fill in by hand.
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
              {/* Desktop / tablet — compact info table. */}
              <div className="hidden sm:block rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left px-2 py-1.5">Dept</th>
                      <th className="text-left px-2 py-1.5">Staff</th>
                      <th className="text-left px-2 py-1.5">Date</th>
                      <th className="text-left px-2 py-1.5">Shift</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: stacked info cards. */}
              <div className="sm:hidden space-y-2">
                {otRows.map((r) => (
                  <div key={r.slotId} className="rounded-md border p-3">
                    <div className="text-sm font-medium truncate">
                      {r.staffName || "—"}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground font-mono">
                      {r.staffDept} · {r.date} · {r.start}–{r.end}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Action row is visible whenever ANY editable surface exists —
            either the HR-owned meal/complete flow (readOnly false) or
            the shared OT flow (otLocked false). Only HR sees "Mark
            complete"; Finance Lead sees just "Save" when they came here
            to adjust OT. */}
        {(!readOnly || !otLocked) && (
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
              {!readOnly && !completed && (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => {
                    if (
                      !confirm(
                        "Mark HR complete? This publishes the booking — meal ticks are frozen and no further HR edits are possible.",
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
              )}
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

