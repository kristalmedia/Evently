"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionShell } from "./section-shell";
import { RISK_CATEGORIES } from "@/lib/constants";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import type { RiskLevel, RiskLine } from "@/lib/types";

export function Section7() {
  const { control } = useFormContext<EventConceptForm>();

  return (
    <SectionShell
      index={7}
      title="Risk & Contingency"
      description="Tick the standard risk categories that apply, then rate likelihood and impact and add a contingency plan. Use 'Add custom risk' for anything not in the list."
      owner="sales"
    >
      <Controller
        control={control}
        name="s9.risks"
        render={({ field }) => {
          const list: RiskLine[] = field.value ?? [];
          const set = (next: RiskLine[]) => field.onChange(next);

          const selected = new Set(list.map((r) => r.risk));

          function toggle(risk: string, on: boolean) {
            if (on) {
              if (!selected.has(risk))
                set([
                  ...list,
                  { risk, likelihood: "LOW", impact: "LOW", contingency: "" },
                ]);
            } else {
              set(list.filter((r) => r.risk !== risk));
            }
          }

          function update(i: number, patch: Partial<RiskLine>) {
            const next = [...list];
            next[i] = { ...next[i], ...patch };
            set(next);
          }

          return (
            <div className="space-y-6">
              {/* Predefined categories as multi-select */}
              <div className="space-y-2">
                <Label>Standard risk categories — tick to include:</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {RISK_CATEGORIES.map((risk) => {
                    const on = selected.has(risk);
                    return (
                      <label
                        key={risk}
                        className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors ${
                          on ? "border-accent bg-accent/5" : "hover:bg-secondary/40"
                        }`}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) => toggle(risk, Boolean(v))}
                        />
                        <span className="text-sm">{risk}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Selected risks — rate + contingency */}
              {list.length > 0 && (
                <div className="space-y-3">
                  <div className="callsign">Assessment & contingency</div>
                  {list.map((r, i) => {
                    const isCustom = !RISK_CATEGORIES.includes(r.risk);
                    return (
                      <div key={i} className="rounded-lg border p-3 space-y-3 bg-card">
                        <div className="flex items-start gap-2">
                          <Input
                            value={r.risk}
                            placeholder="Describe the risk"
                            onChange={(e) => update(i, { risk: e.target.value })}
                            readOnly={!isCustom}
                            className={!isCustom ? "bg-muted/40 border-transparent" : ""}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => set(list.filter((_, ix) => ix !== i))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[140px_140px_1fr] gap-2">
                          <Select
                            value={r.likelihood}
                            onValueChange={(v) => update(i, { likelihood: v as RiskLevel })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="LOW">Likelihood: Low</SelectItem>
                              <SelectItem value="MED">Likelihood: Med</SelectItem>
                              <SelectItem value="HIGH">Likelihood: High</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={r.impact}
                            onValueChange={(v) => update(i, { impact: v as RiskLevel })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="LOW">Impact: Low</SelectItem>
                              <SelectItem value="MED">Impact: Med</SelectItem>
                              <SelectItem value="HIGH">Impact: High</SelectItem>
                            </SelectContent>
                          </Select>
                          <Textarea
                            value={r.contingency}
                            placeholder="Contingency plan"
                            rows={1}
                            onChange={(e) => update(i, { contingency: e.target.value })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set([
                    ...list,
                    { risk: "", likelihood: "LOW", impact: "LOW", contingency: "" },
                  ])
                }
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add custom risk
              </Button>
            </div>
          );
        }}
      />
    </SectionShell>
  );
}
