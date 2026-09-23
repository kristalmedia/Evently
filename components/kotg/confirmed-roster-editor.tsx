"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDirectoryUsers } from "@/hooks/use-directory-users";
import type { ShadowDeptKey, ShadowEventRecord } from "@/lib/shadow-events-types";
import type { RosterSlot } from "@/lib/types";
import { apiPath } from "@/lib/api-path";

/** Manager-owned dept keys — matches MANAGER_DEPT_KEYS in
 *  lib/shadow-events.ts (importing that module here would drag the
 *  server-only in-memory store into the client bundle). */
const MANAGER_DEPT_KEYS_LOCAL: readonly ShadowDeptKey[] = [
  "SALES",
  "FINANCE",
  "TECH",
  "IT",
  "CCM",
] as const;

const DEPT_LABEL: Record<ShadowDeptKey, string> = {
  SALES: "Sales",
  FINANCE: "Finance",
  TECH: "Technical",
  IT: "IT",
  CCM: "CCM",
  HR: "HR",
};

/** One editable row in the unified confirmed-roster table — carries the
 *  slot's own fields plus the dept it belongs to (so the client can
 *  regroup back to per-dept blocks when saving). */
interface EditableRow {
  /** Client-side row id — stable per row so React reconciles inputs
   *  correctly even as depts change. Not the same as the shadow slot's
   *  own id (that lives in `slot.id`). */
  rowId: string;
  deptKey: ShadowDeptKey;
  slot: RosterSlot;
}

function makeRowId(): string {
  return `crr_${Math.random().toString(36).slice(2, 10)}`;
}

function makeSlotId(): string {
  return `slot_${Math.random().toString(36).slice(2, 10)}`;
}

/** Flatten shadow.rosterByDept into a single EditableRow[] sorted by
 *  date → start-time — same order HR sees in the meal-allowance grid,
 *  so this table reads the same way. */
function flattenRoster(
  rosterByDept: ShadowEventRecord["rosterByDept"],
): EditableRow[] {
  const rows: EditableRow[] = [];
  for (const deptKey of MANAGER_DEPT_KEYS_LOCAL) {
    const block = rosterByDept[deptKey];
    if (!block) continue;
    for (const slot of block.slots) {
      rows.push({ rowId: makeRowId(), deptKey, slot });
    }
  }
  rows.sort((a, b) => {
    const d = a.slot.date.localeCompare(b.slot.date);
    if (d !== 0) return d;
    return a.slot.start.localeCompare(b.slot.start);
  });
  return rows;
}

/**
 * Unified "Who's working" roster editor — surfaces on the event detail
 * page ONLY when the booking is Confirmed (eventlyStatus = PUBLISHED).
 *
 * Replaces the per-dept card grid with a single flat table so viewers
 * see the whole event's staffing at once, and any Manager / HR /
 * Super Admin can make last-minute changes to any row regardless of
 * which department they normally own.
 *
 * Save batches per-dept — for every dept whose rows changed, one PUT
 * to /api/kotg/[bookingId]/roster replaces that dept's block wholesale.
 */
export function ConfirmedRosterEditor({
  bookingId,
  rosterByDept,
  canEdit,
}: {
  bookingId: string;
  rosterByDept: ShadowEventRecord["rosterByDept"];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditableRow[]>(() => flattenRoster(rosterByDept));
  const [busy, setBusy] = useState(false);
  const { users } = useDirectoryUsers();

  // Directory sorted by dept then name — the dept prefix helps managers
  // scanning a long list identify the right person quickly.
  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const d = a.department.localeCompare(b.department);
        if (d !== 0) return d;
        return a.fullName.localeCompare(b.fullName);
      }),
    [users],
  );

  function updateRow(rowId: string, patch: Partial<EditableRow>) {
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...r,
              ...patch,
              slot: patch.slot ? { ...r.slot, ...patch.slot } : r.slot,
            }
          : r,
      ),
    );
  }

  function updateSlot(rowId: string, patch: Partial<RosterSlot>) {
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId ? { ...r, slot: { ...r.slot, ...patch } } : r,
      ),
    );
  }

  function addRow() {
    // New rows default to Sales dept + today's date + 09:00–17:00.
    // Manager will pick the actual dept + staff via the row's inputs.
    setRows((prev) => [
      ...prev,
      {
        rowId: makeRowId(),
        deptKey: "SALES",
        slot: {
          id: makeSlotId(),
          date: new Date().toISOString().slice(0, 10),
          start: "09:00",
          end: "17:00",
        },
      },
    ]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  /** Regroup the flat rows back into per-dept blocks and PUT each dept.
   *  Even depts that no longer have any rows are PUT (with an empty
   *  slots array) so a shift moved OUT of a dept doesn't leave stale
   *  data behind. */
  async function save() {
    setBusy(true);
    try {
      const grouped = new Map<ShadowDeptKey, RosterSlot[]>();
      for (const deptKey of MANAGER_DEPT_KEYS_LOCAL) grouped.set(deptKey, []);
      for (const row of rows) {
        const list = grouped.get(row.deptKey);
        if (list) list.push(row.slot);
      }

      const puts: Promise<Response>[] = [];
      for (const [deptKey, slots] of grouped.entries()) {
        const existing = rosterByDept[deptKey];
        puts.push(
          fetch(apiPath(`/api/kotg/${bookingId}/roster`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deptKey,
              roster: {
                slots,
                // Preserve completed + staff fields from the existing
                // block — this editor only touches slots.
                staff: existing?.staff ?? [],
                completed: existing?.completed ?? true,
              },
            }),
          }),
        );
      }
      const results = await Promise.all(puts);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const err = await failed.json().catch(() => ({}));
        throw new Error(err.error ?? "One or more dept updates failed");
      }
      toast.success("Roster updated", { position: "bottom-center" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          Who&apos;s working
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!canEdit && (
          <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            Read-only — only Managers, HR, or Super Admin can make
            last-minute changes to a confirmed event&apos;s roster.
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No one is rostered for this event yet.
            {canEdit && " Click Add shift to start."}
          </div>
        ) : (
          <>
            {/* Desktop / tablet: compact table */}
            <div className="hidden sm:block rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="text-left px-2 py-1.5">Dept</th>
                    <th className="text-left px-2 py-1.5">Staff</th>
                    <th className="text-left px-2 py-1.5">Date</th>
                    <th className="text-left px-2 py-1.5">Start</th>
                    <th className="text-left px-2 py-1.5">End</th>
                    {canEdit && <th className="w-10 px-2 py-1.5" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const staffLabel =
                      sortedUsers.find((u) => u.id === r.slot.staffUserId)?.fullName ??
                      r.slot.staffUserId ??
                      "—";
                    return (
                      <tr key={r.rowId} className="border-t">
                        <td className="px-2 py-1.5">
                          {canEdit ? (
                            <select
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                              value={r.deptKey}
                              onChange={(e) =>
                                updateRow(r.rowId, {
                                  deptKey: e.target.value as ShadowDeptKey,
                                })
                              }
                              aria-label="Department"
                            >
                              {MANAGER_DEPT_KEYS_LOCAL.map((k) => (
                                <option key={k} value={k}>
                                  {DEPT_LABEL[k]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-muted-foreground uppercase text-xs font-mono">
                              {DEPT_LABEL[r.deptKey]}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {canEdit ? (
                            <select
                              className="h-8 w-48 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm truncate"
                              value={r.slot.staffUserId ?? ""}
                              onChange={(e) =>
                                updateSlot(r.rowId, {
                                  staffUserId: e.target.value,
                                })
                              }
                              title={staffLabel}
                            >
                              <option value="">— select staff —</option>
                              {sortedUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.fullName} · {u.department}
                                </option>
                              ))}
                              {r.slot.staffUserId &&
                                !sortedUsers.some((u) => u.id === r.slot.staffUserId) && (
                                  <option value={r.slot.staffUserId}>
                                    (unresolved) {r.slot.staffUserId}
                                  </option>
                                )}
                            </select>
                          ) : (
                            <span>{staffLabel}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {canEdit ? (
                            <Input
                              type="date"
                              value={r.slot.date}
                              onChange={(e) =>
                                updateSlot(r.rowId, { date: e.target.value })
                              }
                              className="h-8"
                            />
                          ) : (
                            <span className="font-mono text-xs">{r.slot.date}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {canEdit ? (
                            <Input
                              type="time"
                              value={r.slot.start}
                              onChange={(e) =>
                                updateSlot(r.rowId, { start: e.target.value })
                              }
                              className="h-8 w-24"
                            />
                          ) : (
                            <span className="font-mono text-xs">{r.slot.start}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {canEdit ? (
                            <Input
                              type="time"
                              value={r.slot.end}
                              onChange={(e) =>
                                updateSlot(r.rowId, { end: e.target.value })
                              }
                              className="h-8 w-24"
                            />
                          ) : (
                            <span className="font-mono text-xs">{r.slot.end}</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-2 py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRow(r.rowId)}
                              aria-label="Remove shift"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards, one per shift. */}
            <div className="sm:hidden space-y-2">
              {rows.map((r) => {
                const staffLabel =
                  sortedUsers.find((u) => u.id === r.slot.staffUserId)?.fullName ??
                  r.slot.staffUserId ??
                  "—";
                return (
                  <div key={r.rowId} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[0.7rem] text-muted-foreground font-mono uppercase">
                        {DEPT_LABEL[r.deptKey]}
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(r.rowId)}
                          aria-label="Remove shift"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      )}
                    </div>
                    {canEdit ? (
                      <>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                          value={r.deptKey}
                          onChange={(e) =>
                            updateRow(r.rowId, {
                              deptKey: e.target.value as ShadowDeptKey,
                            })
                          }
                          aria-label="Department"
                        >
                          {MANAGER_DEPT_KEYS_LOCAL.map((k) => (
                            <option key={k} value={k}>
                              {DEPT_LABEL[k]}
                            </option>
                          ))}
                        </select>
                        <select
                          className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm truncate"
                          value={r.slot.staffUserId ?? ""}
                          onChange={(e) =>
                            updateSlot(r.rowId, {
                              staffUserId: e.target.value,
                            })
                          }
                        >
                          <option value="">— select staff —</option>
                          {sortedUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName} · {u.department}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            type="date"
                            value={r.slot.date}
                            onChange={(e) =>
                              updateSlot(r.rowId, { date: e.target.value })
                            }
                          />
                          <Input
                            type="time"
                            value={r.slot.start}
                            onChange={(e) =>
                              updateSlot(r.rowId, { start: e.target.value })
                            }
                          />
                          <Input
                            type="time"
                            value={r.slot.end}
                            onChange={(e) =>
                              updateSlot(r.rowId, { end: e.target.value })
                            }
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-medium">{staffLabel}</div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {r.slot.date} · {r.slot.start}–{r.slot.end}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
              disabled={busy}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add shift
            </Button>
            <div className="ml-auto">
              <Button
                variant="accent"
                size="sm"
                onClick={save}
                disabled={busy}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
              >
                <Save className="h-3.5 w-3.5" />
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
