"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
  Calculator,
  ChevronDown,
  Coins,
  Lock,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SectionShell } from "./section-shell";
import { EXTERNAL_STAFF_TEMPLATE, INTERNAL_STAFF_TEMPLATE, DEPT_ROSTER } from "@/lib/constants";
import {
  MEAL_ALLOWANCE_DINNER_BND,
  MEAL_ALLOWANCE_LUNCH_BND,
  MEAL_MIN_WORK_HOURS,
  OVERTIME_RATE_MULTIPLIER,
  STANDARD_SHIFT_HOURS,
  calculateStaffing,
  costForSlot,
  formatDayDate,
  mealAllowancesForSlot,
  slotHours,
} from "@/lib/roster-calc";
import { formatBND, makeId } from "@/lib/utils";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import type { BroadcastDay, RosterSlot, StaffLine, User } from "@/lib/types";

export function Section4() {
  const { control } = useFormContext<EventConceptForm>();
  const staff = useWatch({ control, name: "s5.staff" }) ?? [];
  const schedule = (useWatch({ control, name: "s8.schedule" }) ?? []) as BroadcastDay[];
  const totals = calculateStaffing(staff as StaffLine[]);

  // Roster is locked until Section 3 (Broadcast) has at least one saved day.
  const broadcastReady = schedule.length > 0 && schedule.some((d) => d.date);
  const availableDates = useMemo(
    () => schedule.filter((d) => d.date).map((d) => d.date),
    [schedule]
  );

  return (
    <SectionShell
      index={4}
      title="Staff & People Required"
      description="Roster internal + external crew. Overtime and meal allowance are calculated automatically from each shift."
      owner="manager"
    >
      {/* Estimated staffing budget */}
      <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-accent" />
            <div className="callsign">Estimated staffing budget</div>
          </div>
          <div className="text-[0.7rem] font-mono text-muted-foreground">
            {totals.slotCount} shifts · {totals.totalHours.toFixed(1)}h total
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <BudgetTile label="Base pay" value={formatBND(totals.baseBND)} />
          <BudgetTile
            label="Overtime"
            value={formatBND(totals.overtimeBND)}
            hint={`>${STANDARD_SHIFT_HOURS}h × ${OVERTIME_RATE_MULTIPLIER}`}
          />
          <BudgetTile
            label="Meal allowance"
            value={formatBND(totals.mealAllowanceBND)}
            hint={`≥${MEAL_MIN_WORK_HOURS}h shifts`}
          />
          <BudgetTile label="Total" value={formatBND(totals.totalBND)} emphasis />
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          Formula: <span className="font-mono">count × rate/hr × hours</span>{" "}
          + OT (×{OVERTIME_RATE_MULTIPLIER} beyond {STANDARD_SHIFT_HOURS}h) + meal
          allowance ({formatBND(MEAL_ALLOWANCE_LUNCH_BND)} lunch,{" "}
          {formatBND(MEAL_ALLOWANCE_DINNER_BND)} dinner) — weekday dinner only
          from 17:15, weekend both possible.
        </p>
      </div>

      {/* Broadcast dependency banner */}
      {!broadcastReady && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 flex items-start gap-3">
          <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <div className="text-sm font-medium">Roster locked</div>
            <div className="text-xs text-muted-foreground">
              Please complete and save Broadcast schedule details first (Section 3).
              Roster shift dates will be drawn from the saved broadcast days.
            </div>
          </div>
        </div>
      )}

      <Controller
        control={control}
        name="s5.staff"
        render={({ field }) => {
          const list: StaffLine[] = field.value ?? [];
          const set = (next: StaffLine[]) => field.onChange(next);

          // Determine which department names are already selected — matched by role.
          const selectedNames = new Set(
            list.filter((l) => l.category === "INTERNAL").map((l) => l.role)
          );

          function toggleDeptMember(name: string, on: boolean, deptKey: string) {
            if (on) {
              if (selectedNames.has(name)) return;
              // Auto-populate All Day slots for every broadcast day currently
              // saved (spec §2 — ensure roster displays under Broadcast). If no
              // schedule days exist yet, the slots start empty and the user
              // can add them later — or re-tick the checkbox after saving
              // schedule days.
              const autoSlots: RosterSlot[] = availableDates.map((d) => ({
                date: d,
                start: "08:00",
                end: "17:00",
                allDay: true,
              }));
              set([
                ...list,
                {
                  role: name,
                  count: 1,
                  confirmed: false,
                  category: "INTERNAL",
                  assignedTo: name,
                  deptKey,
                  rosterSlots: autoSlots,
                },
              ]);
            } else {
              set(list.filter((l) => !(l.category === "INTERNAL" && l.role === name)));
            }
          }

          function prefill() {
            const has = new Set(list.map((l) => `${l.category}|${l.role}`));
            const additions: StaffLine[] = [];
            INTERNAL_STAFF_TEMPLATE.forEach((role) => {
              if (!has.has(`INTERNAL|${role}`))
                additions.push({ role, count: 0, confirmed: false, category: "INTERNAL", rosterSlots: [] });
            });
            EXTERNAL_STAFF_TEMPLATE.forEach((role) => {
              if (!has.has(`EXTERNAL|${role}`))
                additions.push({ role, count: 0, confirmed: false, category: "EXTERNAL", rosterSlots: [] });
            });
            set([...list, ...additions]);
          }

          const internal = list.map((l, i) => ({ l, i })).filter((x) => x.l.category === "INTERNAL");
          const external = list.map((l, i) => ({ l, i })).filter((x) => x.l.category === "EXTERNAL");

          const update = (i: number, patch: Partial<StaffLine>) => {
            const next = [...list];
            next[i] = { ...next[i], ...patch };
            set(next);
          };
          const remove = (i: number) => set(list.filter((_, ix) => ix !== i));
          const add = (category: "INTERNAL" | "EXTERNAL") =>
            set([
              ...list,
              { role: "", count: 1, confirmed: false, category, rosterSlots: [] },
            ]);

          return (
            <div className="space-y-6">
              {/* Interactive department directory — tick a name to add them to the roster */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div>
                  <div className="callsign">Department directory</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tick a name to add them to this event's roster. Untick to remove.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {DEPT_ROSTER.map((d) => (
                    <div key={d.key} className="rounded-md border bg-card p-3 space-y-2">
                      <div className="text-xs font-mono font-semibold tracking-wider text-accent">
                        {d.label}
                      </div>
                      <div className="space-y-1">
                        {d.members.map((m) => {
                          const on = selectedNames.has(m);
                          return (
                            <label
                              key={`${d.key}:${m}`}
                              className={`flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm cursor-pointer transition-colors ${
                                on ? "bg-accent/10" : "hover:bg-secondary/60"
                              }`}
                            >
                              <Checkbox
                                checked={on}
                                onCheckedChange={(v) => toggleDeptMember(m, Boolean(v), d.key)}
                              />
                              <span>{m}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedNames.size > 0 && (
                  <div className="pt-1 text-[0.7rem] text-muted-foreground">
                    {selectedNames.size} {selectedNames.size === 1 ? "person" : "people"} added to roster below.
                  </div>
                )}
              </div>

              {list.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Or start from Kristal's standard role template.
                  </p>
                  <Button type="button" variant="accent" size="sm" onClick={prefill} className="gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Prefill from KM staff roster
                  </Button>
                </div>
              )}

              <StaffGroup
                title="Internal staff"
                rows={internal}
                onAdd={() => add("INTERNAL")}
                onUpdate={update}
                onRemove={remove}
                rosterEnabled={broadcastReady}
                availableDates={availableDates}
              />
              <StaffGroup
                title="External / freelance"
                rows={external}
                onAdd={() => add("EXTERNAL")}
                onUpdate={update}
                onRemove={remove}
                rosterEnabled={broadcastReady}
                availableDates={availableDates}
              />
            </div>
          );
        }}
      />
    </SectionShell>
  );
}

function BudgetTile({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="callsign">{label}</div>
      <div className={`font-mono font-semibold ${emphasis ? "text-xl text-accent" : "text-base"}`}>
        {value}
      </div>
      {hint && <div className="text-[0.68rem] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StaffGroup({
  title,
  rows,
  onAdd,
  onUpdate,
  onRemove,
  rosterEnabled,
  availableDates,
}: {
  title: string;
  rows: { l: StaffLine; i: number }[];
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<StaffLine>) => void;
  onRemove: (i: number) => void;
  rosterEnabled: boolean;
  availableDates: string[];
}) {
  return (
    <div className="space-y-2">
      <div className="callsign">{title}</div>
      <div className="space-y-2">
        {rows.map(({ l, i }) => (
          <StaffRow
            key={i}
            line={l}
            onUpdate={(patch) => onUpdate(i, patch)}
            onRemove={() => onRemove(i)}
            rosterEnabled={rosterEnabled}
            availableDates={availableDates}
          />
        ))}
        {rows.length === 0 && (
          <div className="rounded-lg border p-3 text-xs text-muted-foreground text-center">
            None yet.
          </div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onAdd} className="gap-1">
        <Plus className="h-3.5 w-3.5" /> Add role
      </Button>
    </div>
  );
}

function StaffRow({
  line,
  onUpdate,
  onRemove,
  rosterEnabled,
  availableDates,
}: {
  line: StaffLine;
  onUpdate: (patch: Partial<StaffLine>) => void;
  onRemove: () => void;
  rosterEnabled: boolean;
  availableDates: string[];
}) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const slots = line.rosterSlots ?? [];

  const rowCost = slots.reduce(
    (acc, s) => {
      const c = costForSlot(s, line.ratePerHourBND ?? 0, line.count ?? 0);
      return {
        base: acc.base + c.baseBND,
        ot: acc.ot + c.overtimeBND,
        meal: acc.meal + c.mealAllowanceBND,
      };
    },
    { base: 0, ot: 0, meal: 0 }
  );
  const rowTotal = rowCost.base + rowCost.ot + rowCost.meal;

  function addSlot() {
    const defaultDate = availableDates[0] ?? new Date().toISOString().slice(0, 10);
    const nextSlot: RosterSlot = {
      id: makeId("slot"),
      date: defaultDate,
      start: "09:00",
      end: "17:00",
    };
    onUpdate({ rosterSlots: [...slots, nextSlot] });
  }
  function updateSlot(id: string, patch: Partial<RosterSlot>) {
    onUpdate({
      rosterSlots: slots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }
  function removeSlot(id: string) {
    onUpdate({ rosterSlots: slots.filter((s) => s.id !== id) });
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_60px_100px_1fr_auto_auto] gap-2 items-center p-2">
        <Input
          value={line.role}
          placeholder="Role"
          onChange={(e) => onUpdate({ role: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <Input
            type="number"
            min={0}
            value={line.count}
            placeholder="#"
            onChange={(e) => onUpdate({ count: Number(e.target.value) })}
          />
          <Input
            type="number"
            min={0}
            step="0.5"
            value={line.ratePerHourBND ?? ""}
            placeholder="BND/hr"
            onChange={(e) =>
              onUpdate({
                ratePerHourBND: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </div>
        <StaffCombobox
          value={line.assignedTo ?? ""}
          onChange={(name, userId) =>
            onUpdate({ assignedTo: name, /* keep userId on first slot if useful */ })
          }
        />
        <div className="flex items-center justify-between gap-2 sm:contents">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
            <Checkbox
              checked={line.confirmed}
              onCheckedChange={(v) => onUpdate({ confirmed: Boolean(v) })}
            />
            Confirmed
          </label>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-t px-2 py-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!rosterEnabled}
          onClick={() => setRosterOpen((v) => !v)}
          className={`inline-flex items-center gap-1 text-xs ${
            rosterEnabled
              ? "text-muted-foreground hover:text-foreground"
              : "text-muted-foreground/50 cursor-not-allowed"
          }`}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${rosterOpen ? "" : "-rotate-90"}`}
          />
          Roster ({slots.length} {slots.length === 1 ? "shift" : "shifts"})
          {!rosterEnabled && <Lock className="h-3 w-3 ml-1" />}
        </button>
        {rowTotal > 0 && (
          <div className="ml-auto flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span title="Base pay">{formatBND(rowCost.base)}</span>
            <span title="Overtime">+ OT {formatBND(rowCost.ot)}</span>
            <span title="Meal allowance">+ Meals {formatBND(rowCost.meal)}</span>
            <span className="text-accent font-semibold" title="Row total">
              = {formatBND(rowTotal)}
            </span>
          </div>
        )}
      </div>

      {rosterOpen && rosterEnabled && (
        <div className="border-t p-3 space-y-2 bg-muted/20">
          {slots.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No shifts rostered. Add a shift — dates are limited to the saved broadcast days.
            </p>
          )}
          {slots.map((s) => (
            <RosterSlotRow
              key={s.id}
              slot={s}
              availableDates={availableDates}
              onUpdate={(patch) => updateSlot(s.id, patch)}
              onRemove={() => removeSlot(s.id)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSlot}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add shift
          </Button>
        </div>
      )}
    </div>
  );
}

function RosterSlotRow({
  slot,
  availableDates,
  onUpdate,
  onRemove,
}: {
  slot: RosterSlot;
  availableDates: string[];
  onUpdate: (patch: Partial<RosterSlot>) => void;
  onRemove: () => void;
}) {
  const hours = slotHours(slot);
  const meals = mealAllowancesForSlot(slot);
  const allDay = !!slot.allDay;

  return (
    <div className="rounded-md border bg-card p-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Date — from broadcast days */}
        <select
          value={slot.date}
          onChange={(e) => onUpdate({ date: e.target.value })}
          className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
        >
          {availableDates.length === 0 && (
            <option value="">No broadcast days saved</option>
          )}
          {availableDates.map((d) => (
            <option key={d} value={d}>
              {formatDayDate(d)}
            </option>
          ))}
        </select>

        {/* All-day checkbox */}
        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
          <Checkbox
            checked={allDay}
            onCheckedChange={(v) => {
              const on = Boolean(v);
              // When all-day is on, hide start/end and default to a full 8h window
              onUpdate({
                allDay: on,
                ...(on ? { start: "09:00", end: "17:00" } : {}),
              });
            }}
          />
          All day
        </label>

        {!allDay && (
          <>
            <Input
              type="time"
              value={slot.start}
              onChange={(e) => onUpdate({ start: e.target.value })}
              className="w-[110px]"
            />
            <Input
              type="time"
              value={slot.end}
              onChange={(e) => onUpdate({ end: e.target.value })}
              className="w-[110px]"
            />
          </>
        )}

        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="ml-auto">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-3 text-[0.7rem] text-muted-foreground pl-1">
        <span className="font-mono">{hours.toFixed(2)}h</span>
        {hours > STANDARD_SHIFT_HOURS && (
          <span className="text-amber-600 dark:text-amber-400 font-mono">
            +{(hours - STANDARD_SHIFT_HOURS).toFixed(2)}h OT
          </span>
        )}
        {meals.lunch && (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Coins className="h-3 w-3" /> Lunch
          </span>
        )}
        {meals.dinner && (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Coins className="h-3 w-3" /> Dinner
          </span>
        )}
      </div>
    </div>
  );
}

// ─── AJAX Combobox for staff assignment ────────────────────────────────────
function StaffCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string, userId: string | null) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Lazy-load user list once (mock AJAX — hits the dev endpoint)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/seed-users")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setUsers(d.users ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    setQ(value);
  }, [value]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users.slice(0, 8);
    return users
      .filter(
        (u) =>
          u.fullName.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term) ||
          u.department.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [q, users]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={q}
          placeholder="Search staff…"
          className="pl-8 text-xs"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            onChange(e.target.value, null);
          }}
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] sm:w-[280px] max-h-[240px] overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.map((u) => (
            <button
              key={u.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2 border-b last:border-0"
              onClick={() => {
                onChange(u.fullName, u.id);
                setQ(u.fullName);
                setOpen(false);
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{u.fullName}</div>
                <div className="text-[0.7rem] text-muted-foreground truncate">
                  {u.department} · {u.email}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
