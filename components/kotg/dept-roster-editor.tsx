"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDirectoryUsers } from "@/hooks/use-directory-users";
import type {
  DeptRoster,
  ShadowDeptKey,
} from "@/lib/shadow-events-types";
import type { RosterSlot } from "@/lib/types";
import { apiPath } from "@/lib/api-path";

const DEPT_LABEL: Record<ShadowDeptKey, string> = {
  SALES: "Sales",
  FINANCE: "Finance",
  TECH: "Technical",
  IT: "IT",
  CCM: "CCM",
  HR: "HR",
};

function makeSlotId(): string {
  return `slot_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Per-department roster block editor. The current user's department
 * determines which block appears — Managers only see their own. HR gets
 * this in read-only mode across every dept once HR_UNLOCKED (rendered
 * via `readOnly` prop from the parent).
 *
 * Save Draft vs Mark complete are separate actions:
 *   - Save Draft: persists edits without publishing — status stays
 *     "DRAFT", eventlyStatus is untouched, and nobody is notified.
 *   - Mark complete: same PUT with completed:true, which flips status to
 *     "PUBLISHED" and (when the last dept flips) advances the workflow
 *     to HR_UNLOCKED.
 *
 * Editing is gated ENTIRELY by the `readOnly` prop (server-side
 * permission — see canEditDept in lib/kotg-permissions.ts), not by
 * whether the block is already completed. Managers can keep editing —
 * and re-saving — their own dept's roster even after marking it
 * complete or after the event is fully Confirmed; that's the point of
 * the "edit at any stage" rule.
 */
export function DeptRosterEditor({
  bookingId,
  deptKey,
  initial,
  readOnly = false,
}: {
  bookingId: string;
  deptKey: ShadowDeptKey;
  initial: DeptRoster;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<RosterSlot[]>(initial.slots);
  const [busy, setBusy] = useState(false);
  const { users } = useDirectoryUsers();

  // Suggest this dept's own users first in the picker (Sales manager
  // most likely wants a Sales staffer). Everyone else follows so cross-
  // dept borrowing still works with a scroll.
  const deptDeptMap: Record<ShadowDeptKey, string> = {
    SALES: "Sales",
    FINANCE: "Finance",
    TECH: "Technical",
    IT: "IT",
    CCM: "CCM",
    HR: "HR",
  };
  const sortedUsers = useMemo(() => {
    const own = deptDeptMap[deptKey];
    return [...users].sort((a, b) => {
      const aOwn = a.department === own ? 0 : 1;
      const bOwn = b.department === own ? 0 : 1;
      if (aOwn !== bOwn) return aOwn - bOwn;
      return a.fullName.localeCompare(b.fullName);
    });
    // deptKey never changes during the editor's lifetime; users identity
    // is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, deptKey]);

  function addSlot() {
    setSlots((prev) => [
      ...prev,
      {
        id: makeSlotId(),
        date: new Date().toISOString().slice(0, 10),
        start: "09:00",
        end: "17:00",
      },
    ]);
  }

  function updateSlot(id: string, patch: Partial<RosterSlot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  async function put(complete: boolean) {
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/kotg/${bookingId}/roster`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deptKey,
          roster: {
            slots,
            // Staff-lines stay untouched for now — pivot spec focused on
            // the slot list; the shape is preserved on the server-side
            // read but not edited here.
            staff: initial.staff,
            completed: complete ? true : initial.completed,
          },
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(
        complete
          ? `${DEPT_LABEL[deptKey]} roster marked complete`
          : `${DEPT_LABEL[deptKey]} roster saved as draft`,
        { position: "bottom-center" },
      );
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canComplete = !initial.completed && !readOnly && slots.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>{DEPT_LABEL[deptKey]} roster</span>
          {initial.completed ? (
            <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Published
            </span>
          ) : (
            <span className="text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
              Draft
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {slots.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            No shifts yet.{" "}
            {readOnly
              ? "The department manager hasn't added any."
              : "Click Add shift to start."}
          </div>
        ) : (
          <div className="space-y-2">
            {slots.map((s) => (
              <div
                key={s.id}
                // `min-w-0` on the grid + the select cell is what lets
                // the select actually shrink inside the 1fr column —
                // without it, its widest option would force the row
                // wider than the card. `overflow-hidden` on the row
                // wrapper is the belt-and-braces so a very long option
                // name still can't blow the container out.
                className="grid gap-2 grid-cols-1 sm:grid-cols-[9rem_6rem_6rem_minmax(0,1fr)_auto] items-center rounded-md border p-2 min-w-0 overflow-hidden"
              >
                <Input
                  type="date"
                  value={s.date}
                  onChange={(e) => updateSlot(s.id, { date: e.target.value })}
                  disabled={readOnly}
                />
                <Input
                  type="time"
                  value={s.start}
                  onChange={(e) => updateSlot(s.id, { start: e.target.value })}
                  disabled={readOnly}
                />
                <Input
                  type="time"
                  value={s.end}
                  onChange={(e) => updateSlot(s.id, { end: e.target.value })}
                  disabled={readOnly}
                />
                {/* Native select over the directory. `w-full min-w-0
                    max-w-full` + text-ellipsis on the select itself
                    caps its rendered width and truncates the visible
                    option label. */}
                <select
                  className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm truncate"
                  value={s.staffUserId ?? ""}
                  onChange={(e) => updateSlot(s.id, { staffUserId: e.target.value })}
                  disabled={readOnly}
                  // `title` shows the full "Name · Department" on hover
                  // even when the visible label is truncated.
                  title={
                    sortedUsers.find((u) => u.id === s.staffUserId)?.fullName ??
                    (s.staffUserId || undefined)
                  }
                >
                  <option value="">— select staff —</option>
                  {sortedUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} · {u.department}
                    </option>
                  ))}
                  {/* Legacy free-text values from before this rework
                      will not match any user id; surface them so they
                      don't silently disappear. */}
                  {s.staffUserId &&
                    !sortedUsers.some((u) => u.id === s.staffUserId) && (
                      <option value={s.staffUserId}>
                        (unresolved) {s.staffUserId}
                      </option>
                    )}
                </select>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSlot(s.id)}
                    aria-label="Remove shift"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={addSlot}
              disabled={busy}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add shift
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
                {busy ? "Saving…" : initial.completed ? "Save changes" : "Save Draft"}
              </Button>
              {!initial.completed && (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => {
                    if (
                      !confirm(
                        `Mark ${DEPT_LABEL[deptKey]} roster complete? This publishes it and moves the workflow forward — you can still come back and edit it afterward if something needs correcting. When every department completes, HR unlocks next.`,
                      )
                    ) {
                      return;
                    }
                    put(true);
                  }}
                  disabled={busy || !canComplete}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark complete
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
