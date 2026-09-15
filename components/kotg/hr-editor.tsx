"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Coffee, Plus, Save, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HrFinancialLine } from "@/lib/shadow-events-types";
import { formatBND } from "@/lib/utils";

function makeId(): string {
  return `hrl_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * HR block editor — overtime + meal-allowance lines. HR owns both after
 * the pivot; Putri no longer edits them from the Finance section.
 *
 * A row's `kind` is toggled between OVERTIME and MEAL_ALLOWANCE with a
 * small pill button — cheaper on screen real estate than a dropdown, and
 * there are only two options so the toggle is unambiguous.
 */
export function HrEditor({
  bookingId,
  initial,
  completed,
  readOnly = false,
}: {
  bookingId: string;
  initial: HrFinancialLine[];
  completed: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<HrFinancialLine[]>(initial);
  const [busy, setBusy] = useState(false);

  function addLine(kind: HrFinancialLine["kind"]) {
    setLines((prev) => [
      ...prev,
      { id: makeId(), kind, item: "", amountBND: 0 },
    ]);
  }

  function updateLine(id: string, patch: Partial<HrFinancialLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  async function put(complete: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/kotg/${bookingId}/hr`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, complete }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(complete ? "HR marked complete — Finance next" : "HR lines saved", {
        position: "bottom-center",
      });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const overtimeSum = lines
    .filter((l) => l.kind === "OVERTIME")
    .reduce((s, l) => s + l.amountBND, 0);
  const mealSum = lines
    .filter((l) => l.kind === "MEAL_ALLOWANCE")
    .reduce((s, l) => s + l.amountBND, 0);

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
      <CardContent className="space-y-3">
        {/* Running subtotals */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-2">
            <div className="callsign">Overtime</div>
            <div className="font-mono font-semibold">{formatBND(overtimeSum)}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="callsign">Meal allowance</div>
            <div className="font-mono font-semibold">{formatBND(mealSum)}</div>
          </div>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            No lines yet. Use the buttons below to add an overtime or meal-allowance line.
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <div
                key={l.id}
                className="grid gap-2 grid-cols-1 sm:grid-cols-[8rem_1fr_8rem_auto] items-center rounded-md border p-2"
              >
                <button
                  type="button"
                  onClick={() =>
                    updateLine(l.id, {
                      kind: l.kind === "OVERTIME" ? "MEAL_ALLOWANCE" : "OVERTIME",
                    })
                  }
                  disabled={readOnly || completed}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                >
                  {l.kind === "OVERTIME" ? (
                    <>
                      <Timer className="h-3.5 w-3.5" />
                      Overtime
                    </>
                  ) : (
                    <>
                      <Coffee className="h-3.5 w-3.5" />
                      Meal
                    </>
                  )}
                </button>
                <Input
                  placeholder="Description (staff name, shift, etc.)"
                  value={l.item}
                  onChange={(e) => updateLine(l.id, { item: e.target.value })}
                  disabled={readOnly || completed}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Amount"
                  value={Number.isFinite(l.amountBND) ? l.amountBND : 0}
                  onChange={(e) =>
                    updateLine(l.id, {
                      amountBND: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                  disabled={readOnly || completed}
                />
                {!readOnly && !completed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(l.id)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && !completed && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addLine("OVERTIME")}
              disabled={busy}
              className="gap-1.5"
            >
              <Timer className="h-3.5 w-3.5" />
              Add overtime
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addLine("MEAL_ALLOWANCE")}
              disabled={busy}
              className="gap-1.5"
            >
              <Coffee className="h-3.5 w-3.5" />
              Add meal
            </Button>
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
                      "Mark HR complete? Finance (Putri) will be able to fill her block next; you'll no longer be able to edit HR lines.",
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
