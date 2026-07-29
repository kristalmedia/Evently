"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CalendarDays, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SectionShell, Field, FieldRow } from "./section-shell";
import { BROADCAST_PLATFORMS } from "@/lib/constants";
import { formatDayDate } from "@/lib/roster-calc";
import { makeId } from "@/lib/utils";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import type { BroadcastDay, BroadcastSlot } from "@/lib/types";

const SOCIAL = ["Instagram", "Facebook", "TikTok", "YouTube", "X / Twitter", "LinkedIn"];

export function Section3() {
  const { register, control } = useFormContext<EventConceptForm>();
  const eventStart = useWatch({ control, name: "s1.startDate" });
  const eventEnd = useWatch({ control, name: "s1.endDate" });

  return (
    <SectionShell
      index={3}
      title="Broadcast Details"
      description="How this event goes out — on-air, online, social. Add per-day time slots with breaks for the full broadcast schedule."
    >
      <div className="space-y-3">
        <Label>Live broadcast?</Label>
        <Controller
          control={control}
          name="s8.liveBroadcast"
          render={({ field }) => (
            <div className="flex gap-2">
              {(["YES", "NO", "TBC"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => field.onChange(v)}
                  className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    field.value === v
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-input hover:bg-secondary"
                  }`}
                >
                  {v === "YES" ? "Yes" : v === "NO" ? "No" : "TBC"}
                </button>
              ))}
            </div>
          )}
        />
      </div>

      {/* Broadcast platforms (spec §3.8) */}
      <div className="space-y-2">
        <Label>Broadcast platforms</Label>
        <Controller
          control={control}
          name="s8.platforms"
          render={({ field }) => (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {BROADCAST_PLATFORMS.map((p) => {
                const on = field.value?.includes(p);
                return (
                  <label
                    key={p}
                    className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer transition-colors ${
                      on ? "border-accent bg-accent/5" : "hover:bg-secondary/40"
                    }`}
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) =>
                        field.onChange(
                          v
                            ? [...(field.value ?? []), p]
                            : (field.value ?? []).filter((x) => x !== p)
                        )
                      }
                    />
                    <span className="text-sm">{p}</span>
                  </label>
                );
              })}
            </div>
          )}
        />
        <Field label="Other platforms (specify)">
          <Input
            placeholder="e.g. AM Radio, YouTube channel…"
            {...register("s8.platformOther")}
          />
        </Field>
      </div>

      {/* Broadcast schedule — multi-day / multi-slot (spec §3.8) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-accent" />
            Broadcast schedule
          </Label>
        </div>
        <Controller
          control={control}
          name="s8.schedule"
          render={({ field }) => {
            const days: BroadcastDay[] = field.value ?? [];
            const set = (next: BroadcastDay[]) => field.onChange(next);

            function addDay() {
              const defaultDate =
                eventStart?.slice(0, 10) ??
                new Date().toISOString().slice(0, 10);
              set([
                ...days,
                {
                  date: defaultDate,
                  slots: [{ id: makeId("bslot"), start: "09:00", end: "12:00" }],
                },
              ]);
            }
            function updateDay(idx: number, patch: Partial<BroadcastDay>) {
              const next = [...days];
              next[idx] = { ...next[idx], ...patch };
              set(next);
            }
            function removeDay(idx: number) {
              set(days.filter((_, i) => i !== idx));
            }
            function addSlot(dayIdx: number) {
              const day = days[dayIdx];
              const nextSlot: BroadcastSlot = { id: makeId("bslot"), start: "14:00", end: "18:00" };
              updateDay(dayIdx, { slots: [...day.slots, nextSlot] });
            }
            function updateSlot(dayIdx: number, slotId: string, patch: Partial<BroadcastSlot>) {
              const day = days[dayIdx];
              updateDay(dayIdx, {
                slots: day.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
              });
            }
            function removeSlot(dayIdx: number, slotId: string) {
              const day = days[dayIdx];
              updateDay(dayIdx, {
                slots: day.slots.filter((s) => s.id !== slotId),
              });
            }

            return (
              <div className="space-y-3">
                {days.length === 0 && (
                  <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      No broadcast days scheduled yet. Add one to start.
                    </p>
                  </div>
                )}

                {days.map((day, di) => (
                  <div key={di} className="rounded-lg border bg-card overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 border-b p-3 bg-muted/30">
                      <Input
                        type="date"
                        value={day.date}
                        onChange={(e) => updateDay(di, { date: e.target.value })}
                        className="w-full sm:w-auto sm:max-w-[180px]"
                      />
                      <div className="text-sm font-medium">
                        {day.date ? formatDayDate(day.date) : "Pick a date"}
                      </div>
                      <div className="ml-auto text-xs callsign">
                        {day.slots.length} {day.slots.length === 1 ? "slot" : "slots"}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDay(di)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="p-3 space-y-2">
                      {day.slots.map((s, si) => (
                        <div
                          key={s.id}
                          className="grid grid-cols-[70px_1fr_auto] sm:grid-cols-[80px_1fr_1fr_auto] items-center gap-2"
                        >
                          <div className="callsign">Slot {si + 1}</div>
                          <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-2 sm:contents">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs text-muted-foreground shrink-0">Start</span>
                              <Input
                                type="time"
                                value={s.start}
                                onChange={(e) => updateSlot(di, s.id, { start: e.target.value })}
                                className="min-w-0"
                              />
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs text-muted-foreground shrink-0">End</span>
                              <Input
                                type="time"
                                value={s.end}
                                onChange={(e) => updateSlot(di, s.id, { end: e.target.value })}
                                className="min-w-0"
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSlot(di, s.id)}
                            className="col-start-3 sm:col-auto row-start-1 sm:row-auto justify-self-end"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSlot(di)}
                        className="gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add time slot
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDay}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add day
                </Button>
              </div>
            );
          }}
        />
      </div>

      {/* Podcast */}
      <div className="flex items-center">
        <Controller
          control={control}
          name="s8.podcastRecording"
          render={({ field }) => (
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={field.value}
                onCheckedChange={(v) => field.onChange(Boolean(v))}
              />
              <span className="text-sm">Podcast / recording planned</span>
            </label>
          )}
        />
      </div>

      {/* Social */}
      <div className="space-y-2">
        <Label>Social media platforms</Label>
        <Controller
          control={control}
          name="s8.socialPlatforms"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {SOCIAL.map((p) => {
                const on = field.value?.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      field.onChange(
                        on
                          ? (field.value ?? []).filter((v) => v !== p)
                          : [...(field.value ?? []), p]
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-input hover:bg-secondary"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}
        />
      </div>

      <FieldRow>
        <Field label="Social media content plan">
          <Textarea rows={4} {...register("s8.socialContentPlan")} />
        </Field>
        <Field label="Post-event content plan">
          <Textarea rows={4} {...register("s8.postEventContentPlan")} />
        </Field>
      </FieldRow>

      <Controller
        control={control}
        name="s8.hashtags"
        render={({ field }) => (
          <Field
            label="Hashtags"
            hint="Comma-separated. The # is added automatically."
          >
            <Input
              value={(field.value ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(", ")}
              onChange={(e) =>
                field.onChange(
                  e.target.value
                    .split(",")
                    .map((s) => s.trim().replace(/^#+/, ""))
                    .filter(Boolean)
                    .map((s) => `#${s}`)
                )
              }
              placeholder="#KOTG, #KristalFM"
            />
          </Field>
        )}
      />
    </SectionShell>
  );
}
