"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Plus, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionShell } from "./section-shell";
import {
  CONCEPT_APPROVAL_CHECKLIST,
  TIMELINE_PHASE_LABEL,
  TIMELINE_TEMPLATE,
} from "@/lib/constants";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import type { TaskStatus, TimelinePhase, TimelineTask } from "@/lib/types";

const PHASES: TimelinePhase[] = [
  "CONCEPT_APPROVAL",
  "PRODUCTION_LOGISTICS",
  "BROADCAST_CONTENT",
  "EVENT_DAY",
  "POST_EVENT",
];

export function Section6() {
  const { control } = useFormContext<EventConceptForm>();

  return (
    <SectionShell
      index={6}
      title="Project Management"
      description="Every task from concept to post-event debrief, grouped by phase. Concept & Approval uses a fixed checklist — the other phases stay free-form."
      owner="sales"
    >
      <Controller
        control={control}
        name="s7.tasks"
        render={({ field }) => {
          const list: TimelineTask[] = field.value ?? [];
          const set = (next: TimelineTask[]) => field.onChange(next);

          function prefillAll() {
            const has = new Set(list.map((t) => `${t.phase}|${t.task}`));
            const additions: TimelineTask[] = [];
            TIMELINE_TEMPLATE.forEach((t) => {
              const key = `${t.phase}|${t.task}`;
              if (!has.has(key)) additions.push({ ...t, status: "NOT_STARTED" });
            });
            set([...list, ...additions]);
          }

          const update = (i: number, patch: Partial<TimelineTask>) => {
            const next = [...list];
            next[i] = { ...next[i], ...patch };
            set(next);
          };
          const remove = (i: number) => set(list.filter((_, ix) => ix !== i));

          function toggleChecklistItem(task: string, on: boolean) {
            const key = `CONCEPT_APPROVAL|${task}`;
            const currentIdx = list.findIndex(
              (t) => `${t.phase}|${t.task}` === key
            );
            if (on && currentIdx === -1) {
              const owner =
                TIMELINE_TEMPLATE.find(
                  (tt) => tt.phase === "CONCEPT_APPROVAL" && tt.task === task
                )?.owner ?? "";
              set([
                ...list,
                { phase: "CONCEPT_APPROVAL", task, owner, status: "NOT_STARTED" },
              ]);
            } else if (!on && currentIdx !== -1) {
              set(list.filter((_, ix) => ix !== currentIdx));
            }
          }

          function addPhaseTask(phase: TimelinePhase) {
            set([...list, { phase, task: "", owner: "", status: "NOT_STARTED" }]);
          }

          const totalDone = list.filter((t) => t.status === "DONE").length;

          return (
            <div className="space-y-6">
              {list.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Load the full 34-task workflow, or start empty and pick from the
                    Concept & Approval checklist below.
                  </p>
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    onClick={prefillAll}
                    className="gap-2"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Prefill from KM timeline template
                  </Button>
                </div>
              )}

              {list.length > 0 && (
                <div className="flex items-center gap-3 rounded-lg bg-muted/40 border p-3 text-sm">
                  <span className="callsign">Progress</span>
                  <span className="font-mono">
                    {totalDone} / {list.length} tasks done
                  </span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${(totalDone / list.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {PHASES.map((phase) => {
                const rows = list.map((t, i) => ({ t, i })).filter((x) => x.t.phase === phase);
                const isConceptApproval = phase === "CONCEPT_APPROVAL";
                const selectedItems = new Set(rows.map(({ t }) => t.task));

                return (
                  <div key={phase} className="space-y-2">
                    <div className="callsign">{TIMELINE_PHASE_LABEL[phase]}</div>

                    {/* Predefined checklist — Concept & Approval only (spec §3.7) */}
                    {isConceptApproval && (
                      <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
                        <div className="text-xs text-muted-foreground pb-1">
                          Standard checklist — tick to include:
                        </div>
                        {CONCEPT_APPROVAL_CHECKLIST.map((item) => (
                          <label
                            key={item}
                            className="flex items-center gap-2 rounded-md p-2 hover:bg-secondary/40 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedItems.has(item)}
                              onCheckedChange={(v) => toggleChecklistItem(item, Boolean(v))}
                            />
                            <span className="text-sm">{item}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Selected / custom tasks with owner + due + status */}
                    {rows.length > 0 && (
                      <div className="rounded-lg border overflow-hidden divide-y">
                        {rows.map(({ t, i }) => {
                          const isCustom =
                            !isConceptApproval ||
                            !CONCEPT_APPROVAL_CHECKLIST.includes(t.task);
                          return (
                            <div
                              key={i}
                              className="grid grid-cols-1 sm:grid-cols-[1.8fr_1fr_140px_140px_auto] gap-2 items-center p-2"
                            >
                              <Input
                                value={t.task}
                                placeholder="Task"
                                onChange={(e) => update(i, { task: e.target.value })}
                                readOnly={isConceptApproval && !isCustom}
                                className={
                                  isConceptApproval && !isCustom
                                    ? "bg-muted/40 border-transparent"
                                    : ""
                                }
                              />
                              <Input
                                value={t.owner}
                                placeholder="Owner"
                                onChange={(e) => update(i, { owner: e.target.value })}
                              />
                              <div className="grid grid-cols-2 gap-2 sm:contents">
                                <Input
                                  type="date"
                                  value={t.dueDate ?? ""}
                                  onChange={(e) => update(i, { dueDate: e.target.value })}
                                />
                                <Select
                                  value={t.status}
                                  onValueChange={(v) => update(i, { status: v as TaskStatus })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="NOT_STARTED">Not started</SelectItem>
                                    <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                                    <SelectItem value="DONE">Done</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(i)}
                                className="justify-self-end sm:justify-self-auto"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addPhaseTask(phase)}
                      className="gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add task
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        }}
      />
    </SectionShell>
  );
}
