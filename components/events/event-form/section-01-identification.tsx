"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionShell, Field, FieldRow } from "./section-shell";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import { DEFAULT_CATEGORIES, EVENT_TYPES, VOG_PILLARS } from "@/lib/constants";
import type { EventType, VoiceOfGoodPillar } from "@/lib/types";

export function Section1() {
  const { register, formState, control, watch, setValue } = useFormContext<EventConceptForm>();
  const e = formState.errors.s1;
  const category = watch("category");
  const classification = watch("s2.classification");
  const sellMerch = watch("s2.sellMerchandise");
  const qtyBring = watch("s2.merchandiseQtyToBring");
  const qtySold = watch("s2.merchandiseQtySoldOut");

  return (
    <SectionShell
      index={1}
      title="General Information"
      description="Event title, nature, concept, category, organiser, and venue. Dates are set from the Broadcast Schedule in Section 3."
      owner="sales"
    >
      <FieldRow>
        <Field label="Event title" required error={e?.eventName?.message}>
          <Input placeholder="e.g. KOTG @ The Mall Gadong" {...register("s1.eventName")} />
        </Field>
        <Field label="Event reference no." required error={e?.eventRefNo?.message} hint="Auto-generated in KEMS-EVT-#### format, unique across the system.">
          <Input readOnly className="font-mono text-xs uppercase bg-muted/40" {...register("s1.eventRefNo")} />
        </Field>
      </FieldRow>

      {/* Nature of Event */}
      <Controller
        control={control}
        name="s2.types"
        render={({ field }) => (
          <div className="space-y-2">
            <label className="text-sm font-medium">Nature of event</label>
            <p className="text-xs text-muted-foreground">Tick all that apply.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {EVENT_TYPES.map((t) => {
                const on = field.value?.includes(t.value as EventType);
                return (
                  <label
                    key={t.value}
                    className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer text-sm ${
                      on ? "border-accent bg-accent/5" : "hover:bg-secondary/40"
                    }`}
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) =>
                        field.onChange(
                          v
                            ? [...(field.value ?? []), t.value]
                            : (field.value ?? []).filter((x) => x !== t.value)
                        )
                      }
                    />
                    <span>{t.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      />

      {/* Classification */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Classification</label>
        <Controller
          control={control}
          name="s2.classification"
          render={({ field }) => (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["COMMERCIAL", "COMMUNITY_CSR"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => field.onChange(v)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    field.value === v
                      ? "border-accent bg-accent/5"
                      : "border-input hover:bg-secondary"
                  }`}
                >
                  <div className="text-sm font-medium">
                    {v === "COMMERCIAL" ? "💰 Commercial / Paid" : "🤝 Community / CSR"}
                  </div>
                </button>
              ))}
            </div>
          )}
        />
      </div>

      {classification === "COMMUNITY_CSR" && (
        <Controller
          control={control}
          name="s2.vogPillars"
          render={({ field }) => (
            <div className="space-y-2">
              <label className="text-sm font-medium">Voice of Good pillar(s)</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {VOG_PILLARS.map((p) => {
                  const on = field.value?.includes(p.value as VoiceOfGoodPillar);
                  return (
                    <label
                      key={p.value}
                      className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer text-sm ${
                        on ? "border-accent bg-accent/5" : "hover:bg-secondary/40"
                      }`}
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) =>
                          field.onChange(
                            v
                              ? [...(field.value ?? []), p.value]
                              : (field.value ?? []).filter((x) => x !== p.value)
                          )
                        }
                      />
                      <span>
                        {p.icon} {p.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        />
      )}

      <Field label="Concept & Objectives" hint="Unlimited length — write as much as you need." required>
        <Textarea
          rows={8}
          className="min-h-[10rem]"
          placeholder="Full concept, objectives, angle, audience, success metrics — everything relevant. No character limit."
          {...register("s3.description")}
        />
      </Field>

      <FieldRow>
        <Field label="Category">
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={category ?? ""}
            onChange={(ev) => setValue("category", ev.target.value)}
          >
            <option value="">Select…</option>
            {DEFAULT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Organiser / prepared by" required error={e?.conceptPreparedBy?.message}>
          <Input placeholder="Full name" {...register("s1.conceptPreparedBy")} />
        </Field>
      </FieldRow>

      <Field label="Venue" required error={e?.venue?.message}>
        <Textarea rows={2} placeholder="Venue name + address" {...register("s1.venue")} />
      </Field>

      <FieldRow>
        <Field label="Expected attendance">
          <Input type="number" min={0} {...register("s1.expectedAttendance")} />
        </Field>
        <Field label="Event date" required error={e?.conceptDate?.message}>
          <Input type="date" {...register("s1.conceptDate")} />
        </Field>
      </FieldRow>

      {/* Merchandise sales — toggle first, fields expand when on. */}
      <div className="rounded-lg border p-4 space-y-3">
        <Controller
          control={control}
          name="s2.sellMerchandise"
          render={({ field }) => (
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!!field.value}
                onCheckedChange={(v) => field.onChange(Boolean(v))}
              />
              <div>
                <div className="text-sm font-medium">Sell merchandise at this event</div>
                <div className="text-xs text-muted-foreground">
                  Track stock allocated + units sold. Both start at 0.
                </div>
              </div>
            </label>
          )}
        />

        {sellMerch && (
          <>
            <FieldRow>
              <Field label="Quantity to bring" hint="Stock allocated to the event">
                <Input
                  type="number"
                  min={0}
                  {...register("s2.merchandiseQtyToBring")}
                />
              </Field>
              <Field label="Quantity sold out" hint="Real-time sales counter">
                <Input
                  type="number"
                  min={0}
                  {...register("s2.merchandiseQtySoldOut")}
                />
              </Field>
            </FieldRow>

            {/* Soft warning when sold > brought — valid state (pre-orders,
                re-orders) but worth flagging to the user in case of typo. */}
            {typeof qtyBring === "number" &&
              typeof qtySold === "number" &&
              qtySold > qtyBring && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                  Sold ({qtySold}) exceeds brought ({qtyBring}) — usually
                  means pre-orders or a re-order. Verify if this was a typo.
                </div>
              )}

            <Field label="Merchandise notes" hint="What's being sold, pricing, supplier, etc.">
              <Textarea rows={2} {...register("s2.merchandiseNotes")} />
            </Field>
          </>
        )}
      </div>
    </SectionShell>
  );
}
