"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Plus, Sparkles, X, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SectionShell, Field } from "./section-shell";
import { HIRED_EQUIPMENT_TEMPLATE, OWNED_EQUIPMENT_TEMPLATE } from "@/lib/constants";
import type { EquipmentLine as EquipmentItem } from "@/lib/types";
import type { EventConceptForm } from "@/lib/validation/event-schema";

export function Section2() {
  const { register, control } = useFormContext<EventConceptForm>();

  return (
    <SectionShell
      index={2}
      title="Additional Information"
      description="Equipment requirements, attachments, and any additional notes for the event."
      owner="sales"
    >
      {/* Equipment */}
      <Controller
        control={control}
        name="s4.equipment"
        render={({ field }) => {
          const list: EquipmentItem[] = field.value ?? [];
          const set = (next: EquipmentItem[]) => field.onChange(next);

          function prefill() {
            const has = new Set(list.map((l) => `${l.category}|${l.name}`));
            const additions: EquipmentItem[] = [];
            OWNED_EQUIPMENT_TEMPLATE.forEach((name) => {
              if (!has.has(`OWNED|${name}`))
                additions.push({ category: "OWNED", name, quantity: 0, required: false });
            });
            HIRED_EQUIPMENT_TEMPLATE.forEach((name) => {
              if (!has.has(`HIRED|${name}`))
                additions.push({ category: "HIRED", name, quantity: 0, required: false });
            });
            set([...list, ...additions]);
          }

          const owned = list.map((l, i) => ({ l, i })).filter((x) => x.l.category === "OWNED");
          const hired = list.map((l, i) => ({ l, i })).filter((x) => x.l.category === "HIRED");

          const update = (i: number, patch: Partial<EquipmentItem>) => {
            const next = [...list];
            next[i] = { ...next[i], ...patch };
            set(next);
          };
          const remove = (i: number) => set(list.filter((_, ix) => ix !== i));
          const add = (category: "OWNED" | "HIRED") =>
            set([...list, { category, name: "", quantity: 1, required: true }]);

          return (
            <div className="space-y-6">
              <div>
                <Label className="text-base">Equipment required</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Standard KM production kit — prefill and adjust quantities, or add custom items.
                </p>
              </div>

              {list.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Load the KM standard equipment checklist to get started.
                  </p>
                  <Button type="button" variant="accent" size="sm" onClick={prefill} className="gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Prefill from KM equipment checklist
                  </Button>
                </div>
              )}

              <EquipmentGroup
                title="Kristal Media owned assets"
                rows={owned}
                onAdd={() => add("OWNED")}
                onUpdate={update}
                onRemove={remove}
              />
              <EquipmentGroup
                title="Hired / third party assets"
                rows={hired}
                onAdd={() => add("HIRED")}
                onUpdate={update}
                onRemove={remove}
              />
            </div>
          );
        }}
      />

      <Field
        label="Additional notes"
        hint="Anything else the team needs to know — permits, VIP treatment, sponsor requirements…"
      >
        <Textarea rows={5} placeholder="Notes…" {...register("s3.brandLink")} />
      </Field>

      {/* Attachments placeholder — real upload flow bolts in here */}
      <div className="space-y-2">
        <Label>General attachments</Label>
        <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
          <Paperclip className="h-6 w-6 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            File uploads land here in the production build (Azure Blob / S3).
            For now, list attachment names in the notes field above.
          </p>
        </div>
      </div>
    </SectionShell>
  );
}

function EquipmentGroup({
  title,
  rows,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  rows: { l: EquipmentItem; i: number }[];
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<EquipmentItem>) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="callsign">{title}</div>
      <div className="rounded-lg border overflow-hidden divide-y">
        {rows.map(({ l, i }) => (
          <div
            key={i}
            className="flex flex-col sm:grid sm:grid-cols-[24px_1fr_80px_1.5fr_auto] gap-2 sm:items-center p-2"
          >
            <div className="flex items-center gap-2 sm:contents">
              <Checkbox
                checked={l.required}
                onCheckedChange={(v) => onUpdate(i, { required: Boolean(v) })}
              />
              <Input
                value={l.name}
                placeholder="Equipment name"
                onChange={(e) => onUpdate(i, { name: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(i)}
                className="sm:order-last shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2 sm:contents">
              <Input
                type="number"
                min={0}
                value={l.quantity}
                placeholder="Qty"
                onChange={(e) => onUpdate(i, { quantity: Number(e.target.value) })}
              />
              <Input
                value={l.notes ?? ""}
                placeholder="Notes / condition"
                onChange={(e) => onUpdate(i, { notes: e.target.value })}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground text-center">
            None yet — use "Add item" or "Prefill" above.
          </div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAdd} className="gap-1">
        <Plus className="h-3.5 w-3.5" /> Add item
      </Button>
    </div>
  );
}
