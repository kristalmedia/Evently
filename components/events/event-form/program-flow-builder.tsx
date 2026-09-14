"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Clock, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "./section-shell";
import { useEventFormMeta } from "./event-form-context";
import { makeId } from "@/lib/utils";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import type { ProgramFlowStep } from "@/lib/types";

/**
 * Runsheet builder — a flat sorted-by-time list of {time, activity,
 * owner, notes} steps. Sits inside Section 1 alongside the general
 * event info because it's semantically part of "what happens on the day"
 * rather than a separate workflow stage.
 *
 * Visibility gating (spec: "hidden or view-only until officially
 * approved, after which all users gain read access") is applied at the
 * consumer via the exported `isProgramFlowVisible` helper — this
 * component itself just renders. Callers decide when to mount it.
 */
export function ProgramFlowBuilder() {
  const { control } = useFormContext<EventConceptForm>();

  return (
    <Controller
      control={control}
      name="s1.programFlow"
      render={({ field }) => {
        const steps: ProgramFlowStep[] = field.value ?? [];
        const set = (next: ProgramFlowStep[]) =>
          // Persist sorted by time so downstream renderers don't have to.
          field.onChange([...next].sort((a, b) => a.time.localeCompare(b.time)));

        function addStep() {
          set([
            ...steps,
            { id: makeId("pf"), time: "09:00", activity: "", owner: "", notes: "" },
          ]);
        }

        function update(i: number, patch: Partial<ProgramFlowStep>) {
          const next = [...steps];
          next[i] = { ...next[i], ...patch };
          set(next);
        }

        function remove(id: string) {
          set(steps.filter((s) => s.id !== id));
        }

        return (
          <div className="space-y-3">
            {steps.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No run-of-show entries yet. Add a first step below.
              </div>
            )}

            {steps.length > 0 && (
              <div className="rounded-lg border overflow-hidden divide-y">
                {steps.map((step, i) => (
                  <div
                    key={step.id}
                    className="grid grid-cols-1 sm:grid-cols-[100px_1.4fr_1fr_1.4fr_auto] gap-2 items-start p-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        type="time"
                        value={step.time}
                        onChange={(e) => update(i, { time: e.target.value })}
                      />
                    </div>
                    <Input
                      value={step.activity}
                      placeholder="Activity"
                      onChange={(e) => update(i, { activity: e.target.value })}
                    />
                    <Input
                      value={step.owner}
                      placeholder="Owner"
                      onChange={(e) => update(i, { owner: e.target.value })}
                    />
                    <Input
                      value={step.notes ?? ""}
                      placeholder="Notes (optional)"
                      onChange={(e) => update(i, { notes: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(step.id)}
                      title="Remove step"
                      className="justify-self-end sm:justify-self-auto"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addStep} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add step
            </Button>
          </div>
        );
      }}
    />
  );
}

/**
 * Read-only variant — used on the event detail page (or by any viewer
 * who can't edit) to render the same runsheet as a labeled table.
 */
export function ProgramFlowView({ steps }: { steps: ProgramFlowStep[] | undefined }) {
  const sorted = [...(steps ?? [])].sort((a, b) => a.time.localeCompare(b.time));
  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground text-center">
        No program flow published yet.
      </div>
    );
  }
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[0.65rem] font-mono uppercase tracking-wider text-muted-foreground border-b">
            <th className="text-left px-3 py-2 w-[80px]">Time</th>
            <th className="text-left px-3 py-2">Activity</th>
            <th className="text-left px-3 py-2 hidden sm:table-cell">Owner</th>
            <th className="text-left px-3 py-2 hidden md:table-cell">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((step) => (
            <tr key={step.id} className="border-b last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{step.time}</td>
              <td className="px-3 py-2 font-medium">{step.activity}</td>
              <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">
                {step.owner}
              </td>
              <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">
                {step.notes || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Program flow is hidden while the event is still being drafted / going
 * through approval. Once approval finishes (STAFFING_IN_PROGRESS onward
 * — everyone can see it as a run-of-show reference), it's visible to all.
 *
 * Editor is always allowed to see + edit their own draft — otherwise
 * they couldn't fill it in during draft. So this returns the visibility
 * state for read-only viewers, not the author.
 */
export function isProgramFlowVisibleToViewers(status: string): boolean {
  return (
    status === "STAFFING_IN_PROGRESS" ||
    status === "FINANCIAL_REVIEW" ||
    status === "PUBLISHED" ||
    status === "UPCOMING" ||
    status === "ONGOING" ||
    status === "COMPLETED" ||
    status === "APPROVED" ||
    status === "ARCHIVED"
  );
}

/** True when we should mount the builder UI in the event form. */
export function EventFormProgramFlowSection() {
  // The form-side render — always visible to editors (they need to
  // author the flow while the event is still in DRAFT). Placed inline
  // below so the caller can just <EventFormProgramFlowSection /> without
  // reasoning about the metadata.
  const { editMode } = useEventFormMeta();
  return (
    <div className="rounded-lg border p-4 space-y-3 bg-signal-500/[0.03]">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-signal-500" />
        <div className="text-sm font-medium">Program flow / run-of-show</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Timed activities. {editMode
          ? "Visible to all users once the event is approved."
          : "Visible to all users once the event is approved (draft-only for now)."}
      </p>
      <ProgramFlowBuilder />
    </div>
  );
}
