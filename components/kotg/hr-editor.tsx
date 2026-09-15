"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Coffee,
  Download,
  FileDown,
  Plus,
  Save,
  Timer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDirectoryUsers } from "@/hooks/use-directory-users";
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

function makeId(): string {
  return `otl_${Math.random().toString(36).slice(2, 10)}`;
}

function mealForTick(t: { am: boolean; pm: boolean }): number {
  return (t.am ? 5 : 0) + (t.pm ? 5 : 0);
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
}) {
  const router = useRouter();
  const [ticks, setTicks] = useState<MealTickMap>(initialMealTicks);
  const [overtime, setOvertime] = useState<OvertimeLine[]>(initialOvertime);
  const [busy, setBusy] = useState(false);
  const { users } = useDirectoryUsers();

  // OT candidate list = every directory user whose dept is OT-eligible
  // AND who appears at least once in the roster. Second filter matches
  // the spec: "based on the user that is working on the roster".
  const otCandidates = useMemo(() => {
    const rosterUserIds = new Set(roster.map((r) => r.staffUserId).filter(Boolean));
    return users
      .filter(
        (u) =>
          OT_ELIGIBLE_DEPTS.includes(u.department) && rosterUserIds.has(u.id),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [users, roster]);

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

  // OT row manipulation
  function addOtRow(candidate: (typeof otCandidates)[number]) {
    setOvertime((prev) => [
      ...prev,
      {
        id: makeId(),
        staffUserId: candidate.id,
        staffName: candidate.fullName,
        staffDept: candidate.department,
        amountBND: 0,
      },
    ]);
  }
  function updateOtRow(id: string, patch: Partial<OvertimeLine>) {
    setOvertime((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeOtRow(id: string) {
    setOvertime((prev) => prev.filter((l) => l.id !== id));
  }

  // Totals — kept fully derived, never stored.
  const mealTotal = useMemo(
    () => Object.values(ticks).reduce((s, t) => s + mealForTick(t), 0),
    [ticks],
  );
  const overtimeTotal = useMemo(
    () => overtime.reduce((s, l) => s + (Number.isFinite(l.amountBND) ? l.amountBND : 0), 0),
    [overtime],
  );

  async function put(complete: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/kotg/${bookingId}/hr`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealTicks: ticks, overtime, complete }),
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
      overtime: overtime.map((l) => ({
        kind: "overtime" as const,
        dept: l.staffDept,
        staff: l.staffName,
        date: "",
        shift: "",
        amount: l.amountBND,
        notes: l.notes,
      })),
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

        {/* Meal allowance grid — one row per roster slot across every dept */}
        <div className="space-y-2">
          <div className="callsign inline-flex items-center gap-1.5">
            <Coffee className="h-3 w-3" /> Meal allowance — tick per shift
          </div>
          {roster.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No roster shifts exist yet — Managers haven't finished their
              blocks. HR ticks appear here once shifts are entered.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="text-left px-2 py-1.5">Dept</th>
                    <th className="text-left px-2 py-1.5">Staff</th>
                    <th className="text-left px-2 py-1.5">Date</th>
                    <th className="text-left px-2 py-1.5">Shift</th>
                    <th className="text-center px-2 py-1.5">AM</th>
                    <th className="text-center px-2 py-1.5">PM</th>
                    <th className="text-right px-2 py-1.5">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => {
                    const t = ticks[r.slotId] ?? { am: false, pm: false };
                    const amt = mealForTick(t);
                    return (
                      <tr key={r.slotId} className="border-t">
                        <td className="px-2 py-1.5 text-muted-foreground">{r.deptLabel}</td>
                        <td className="px-2 py-1.5">{r.staffName || "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">{r.date}</td>
                        <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">
                          {r.start}–{r.end}
                        </td>
                        <td className="text-center px-2 py-1.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={t.am}
                            onChange={() => toggleTick(r.slotId, "am")}
                            disabled={readOnly || completed}
                            aria-label={`AM meal allowance for ${r.staffName || "shift"}`}
                          />
                        </td>
                        <td className="text-center px-2 py-1.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={t.pm}
                            onChange={() => toggleTick(r.slotId, "pm")}
                            disabled={readOnly || completed}
                            aria-label={`PM meal allowance for ${r.staffName || "shift"}`}
                          />
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
          )}
        </div>

        {/* Overtime section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="callsign inline-flex items-center gap-1.5">
              <Timer className="h-3 w-3" /> Overtime — IT &amp; Technical staff
            </div>
            {!readOnly && !completed && (
              <OtAddPicker candidates={otCandidates} onAdd={addOtRow} />
            )}
          </div>
          {overtime.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No overtime rows yet. Use the picker above to add an OT entry
              for an IT or Technical staff member appearing in the roster.
            </div>
          ) : (
            <div className="space-y-2">
              {overtime.map((l) => (
                <div
                  key={l.id}
                  className="grid gap-2 grid-cols-1 sm:grid-cols-[10rem_1fr_8rem_auto] items-center rounded-md border p-2"
                >
                  <div className="text-sm">
                    <div className="font-medium">{l.staffName}</div>
                    <div className="text-[0.65rem] text-muted-foreground font-mono uppercase">
                      {l.staffDept}
                    </div>
                  </div>
                  <Input
                    placeholder="Notes (shift, reason)"
                    value={l.notes ?? ""}
                    onChange={(e) => updateOtRow(l.id, { notes: e.target.value })}
                    disabled={readOnly || completed}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount"
                    value={Number.isFinite(l.amountBND) ? l.amountBND : 0}
                    onChange={(e) =>
                      updateOtRow(l.id, {
                        amountBND: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    disabled={readOnly || completed}
                  />
                  {!readOnly && !completed && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOtRow(l.id)}
                      aria-label="Remove overtime row"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
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
interface OtCandidate {
  id: string;
  fullName: string;
  department: string;
}

// The picker only needs the three OtCandidate fields; keep the callback
// generic so callers can pass a wider type (e.g. DirectoryUser) without
// mapping to a narrower shape first.
function OtAddPicker<T extends OtCandidate>({
  candidates,
  onAdd,
}: {
  candidates: T[];
  onAdd: (c: T) => void;
}) {
  if (candidates.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No IT / Technical staff on the roster yet.
      </span>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 ml-auto">
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        value=""
        onChange={(e) => {
          const c = candidates.find((x) => x.id === e.target.value);
          if (c) onAdd(c);
          // Reset select so a repeat pick fires onChange again — this
          // <select> is a fire-once trigger, not a bound value.
          e.currentTarget.value = "";
        }}
      >
        <option value="">+ Add OT for…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.fullName} · {c.department}
          </option>
        ))}
      </select>
      <Plus className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}
