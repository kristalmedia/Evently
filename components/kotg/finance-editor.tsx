"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Package, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinanceFinancialLine } from "@/lib/shadow-events-types";
import { formatBND } from "@/lib/utils";
import { apiPath } from "@/lib/api-path";

function makeId(): string {
  return `fnl_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Finance Lead (Putri) editor — the rest-of-Financial block (equipment /
 * production / marketing). Marking complete flips the booking to
 * PUBLISHED, freezing the whole shadow record.
 *
 * Group toggle uses the same pill pattern as the HR editor: only two
 * options, so a dropdown would be overkill.
 */
export function FinanceEditor({
  bookingId,
  initial,
  completed,
  readOnly = false,
}: {
  bookingId: string;
  initial: FinanceFinancialLine[];
  completed: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<FinanceFinancialLine[]>(initial);
  const [busy, setBusy] = useState(false);

  function addLine(group: FinanceFinancialLine["group"]) {
    setLines((prev) => [
      ...prev,
      { id: makeId(), group, item: "", estimatedBND: 0 },
    ]);
  }

  function updateLine(id: string, patch: Partial<FinanceFinancialLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  async function put(complete: boolean) {
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/kotg/${bookingId}/finance`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, complete }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(
        complete
          ? "Finance complete — booking published"
          : "Finance lines saved",
        { position: "bottom-center" },
      );
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const estSum = lines.reduce((s, l) => s + l.estimatedBND, 0);
  const actSum = lines.reduce((s, l) => s + (l.actualBND ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>Finance — Equipment / Production / Marketing</span>
          {completed && (
            <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-2">
            <div className="callsign">Estimated total</div>
            <div className="font-mono font-semibold">{formatBND(estSum)}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="callsign">Actual total</div>
            <div className="font-mono font-semibold">{formatBND(actSum)}</div>
          </div>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            No lines yet. Use the buttons below to add equipment / logistics or
            production / marketing lines.
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <div
                key={l.id}
                className="grid gap-2 grid-cols-1 sm:grid-cols-[9rem_1fr_7rem_7rem_auto] items-center rounded-md border p-2"
              >
                <button
                  type="button"
                  onClick={() =>
                    updateLine(l.id, {
                      group:
                        l.group === "EQUIPMENT_LOGISTICS"
                          ? "PRODUCTION_MARKETING"
                          : "EQUIPMENT_LOGISTICS",
                    })
                  }
                  disabled={readOnly || completed}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                >
                  {l.group === "EQUIPMENT_LOGISTICS" ? (
                    <>
                      <Package className="h-3.5 w-3.5" />
                      Equipment
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Marketing
                    </>
                  )}
                </button>
                <Input
                  placeholder="Line description"
                  value={l.item}
                  onChange={(e) => updateLine(l.id, { item: e.target.value })}
                  disabled={readOnly || completed}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Est."
                  value={Number.isFinite(l.estimatedBND) ? l.estimatedBND : 0}
                  onChange={(e) =>
                    updateLine(l.id, {
                      estimatedBND: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                  disabled={readOnly || completed}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Actual"
                  value={l.actualBND ?? ""}
                  onChange={(e) =>
                    updateLine(l.id, {
                      actualBND: e.target.value === ""
                        ? undefined
                        : Number.parseFloat(e.target.value) || 0,
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
              onClick={() => addLine("EQUIPMENT_LOGISTICS")}
              disabled={busy}
              className="gap-1.5"
            >
              <Package className="h-3.5 w-3.5" />
              Add equipment / logistics
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addLine("PRODUCTION_MARKETING")}
              disabled={busy}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Add production / marketing
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
                      "Mark Finance complete? This publishes the booking and freezes the record — no more edits from anyone.",
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
                Publish (mark complete)
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
