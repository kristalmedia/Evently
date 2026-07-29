"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Plus, Sparkles, Wand2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SectionShell } from "./section-shell";
import { COST_TEMPLATE } from "@/lib/constants";
import { calculateStaffing } from "@/lib/roster-calc";
import { formatBND } from "@/lib/utils";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import type { CostGroup, CostLine, StaffLine } from "@/lib/types";

const GROUP_LABEL: Record<CostGroup, string> = {
  OVERTIME: "Overtime",
  MEAL_ALLOWANCE: "Meal allowance",
  EQUIPMENT_LOGISTICS: "Equipment & logistics",
  PRODUCTION_MARKETING: "Production & marketing",
};

export function Section5() {
  const { control } = useFormContext<EventConceptForm>();
  const costs = useWatch({ control, name: "s6.costs" }) ?? [];
  const staff = (useWatch({ control, name: "s5.staff" }) ?? []) as StaffLine[];

  // Auto figures from Section 5 rosters
  const staffing = calculateStaffing(staff);
  const totalEstimated = costs.reduce((s, c) => s + Number(c.estimatedBND || 0), 0);
  const totalActual = costs.reduce((s, c) => s + Number(c.actualBND || 0), 0);
  const grandEst = totalEstimated + staffing.overtimeBND + staffing.mealAllowanceBND;
  const grandAct = totalActual + staffing.overtimeBND + staffing.mealAllowanceBND;

  return (
    <SectionShell
      index={5}
      title="Financials & Budget"
      description="Overtime, meal allowance, equipment, and marketing costs. Overtime and meal allowance are pulled from the Section 5 roster automatically."
    >
      {/* Auto values from Section 5 */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="callsign">Auto-calculated from Section 5 roster</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <AutoTile
            label="Overtime (from rosters)"
            value={formatBND(staffing.overtimeBND)}
            hint={`${staffing.slotCount} shifts totalling ${staffing.totalHours.toFixed(1)}h`}
          />
          <AutoTile
            label="Meal allowance (from rosters)"
            value={formatBND(staffing.mealAllowanceBND)}
            hint="Based on weekday/weekend + 4h min rules"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Adjust the underlying roster in Section 5 to change these. Additional
          manual overtime or meal lines can be added below.
        </p>
      </div>

      <Controller
        control={control}
        name="s6.costs"
        render={({ field }) => {
          const list: CostLine[] = field.value ?? [];
          const set = (next: CostLine[]) => field.onChange(next);

          function prefill() {
            const has = new Set(list.map((l) => `${l.group}|${l.item}`));
            const additions: CostLine[] = [];
            COST_TEMPLATE.forEach(({ group, item }) => {
              if (!has.has(`${group}|${item}`))
                additions.push({ group: group as CostGroup, item, estimatedBND: 0 });
            });
            set([...list, ...additions]);
          }

          const update = (i: number, patch: Partial<CostLine>) => {
            const next = [...list];
            next[i] = { ...next[i], ...patch };
            set(next);
          };
          const remove = (i: number) => set(list.filter((_, ix) => ix !== i));
          const add = (group: CostGroup) =>
            set([...list, { group, item: "", estimatedBND: 0 }]);

          const groups: CostGroup[] = [
            "OVERTIME",
            "MEAL_ALLOWANCE",
            "EQUIPMENT_LOGISTICS",
            "PRODUCTION_MARKETING",
          ];

          return (
            <div className="space-y-6">
              {list.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Prefill the standard KM cost lines, or add your own.
                  </p>
                  <Button type="button" variant="accent" size="sm" onClick={prefill} className="gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Prefill from KM cost template
                  </Button>
                </div>
              )}

              {groups.map((g) => {
                const rows = list.map((l, i) => ({ l, i })).filter((x) => x.l.group === g);
                const groupTotal = rows.reduce((s, r) => s + Number(r.l.estimatedBND || 0), 0);

                // Show auto values as read-only reference in the group headers
                const groupAutoHint =
                  g === "OVERTIME"
                    ? `+ auto ${formatBND(staffing.overtimeBND)} from roster`
                    : g === "MEAL_ALLOWANCE"
                      ? `+ auto ${formatBND(staffing.mealAllowanceBND)} from roster`
                      : null;

                return (
                  <div key={g} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="callsign">{GROUP_LABEL[g]}</div>
                        {groupAutoHint && (
                          <div className="text-[0.68rem] text-accent inline-flex items-center gap-1">
                            <Wand2 className="h-3 w-3" />
                            {groupAutoHint}
                          </div>
                        )}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {formatBND(groupTotal)}
                      </div>
                    </div>
                    <div className="rounded-lg border overflow-hidden divide-y">
                      {rows.map(({ l, i }) => (
                        <div
                          key={i}
                          className="grid grid-cols-1 sm:grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-2 items-center p-2"
                        >
                          <Input
                            value={l.item}
                            placeholder="Cost item"
                            onChange={(e) => update(i, { item: e.target.value })}
                          />
                          <div className="grid grid-cols-2 gap-2 sm:contents">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.estimatedBND}
                              placeholder="Estimated"
                              onChange={(e) =>
                                update(i, { estimatedBND: Number(e.target.value) })
                              }
                            />
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.actualBND ?? ""}
                              placeholder="Actual"
                              onChange={(e) =>
                                update(i, { actualBND: e.target.value === "" ? undefined : Number(e.target.value) })
                              }
                            />
                          </div>
                          <div className="flex items-center gap-2 sm:contents">
                            <Input
                              value={l.notes ?? ""}
                              placeholder="Supplier / notes"
                              onChange={(e) => update(i, { notes: e.target.value })}
                              className="flex-1"
                            />
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {rows.length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground text-center">
                          None yet.
                        </div>
                      )}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => add(g)} className="gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add line
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        }}
      />

      {/* Grand totals */}
      <div className="rounded-lg border bg-muted/30 p-4 grid gap-4 sm:grid-cols-3">
        <TotalRow label="Manual lines" est={totalEstimated} act={totalActual} />
        <TotalRow
          label="Auto (roster)"
          est={staffing.overtimeBND + staffing.mealAllowanceBND}
          act={staffing.overtimeBND + staffing.mealAllowanceBND}
        />
        <TotalRow label="Grand total" est={grandEst} act={grandAct} emphasis />
      </div>
    </SectionShell>
  );
}

function AutoTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="callsign">{label}</div>
      <div className="text-lg font-mono font-semibold text-accent">{value}</div>
      {hint && <div className="text-[0.7rem] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function TotalRow({
  label,
  est,
  act,
  emphasis,
}: {
  label: string;
  est: number;
  act: number;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="callsign">{label}</div>
      <div className={`font-mono font-semibold ${emphasis ? "text-xl text-accent" : "text-base"}`}>
        {formatBND(est)}
      </div>
      <div className="text-xs font-mono text-muted-foreground">Actual · {formatBND(act)}</div>
    </div>
  );
}
