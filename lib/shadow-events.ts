import type {
  DeptRoster,
  ShadowDeptKey,
  ShadowEventKemsStatus,
  ShadowEventRecord,
} from "./shadow-events-types";

/**
 * In-memory store for shadow event records — the KEMS-only fields layered
 * on top of Sheet bookings. See lib/shadow-events-types.ts for the shape,
 * and lib/google-sheets.ts for the Sheet side of the join.
 *
 * globalThis-anchored to survive Next.js dev-mode HMR (same pattern as
 * lib/store.ts, lib/better-auth.ts, lib/google-sheets.ts).
 */

const g = globalThis as unknown as {
  __kristal_shadow_events?: Map<string, ShadowEventRecord>;
};

function store(): Map<string, ShadowEventRecord> {
  if (!g.__kristal_shadow_events) {
    g.__kristal_shadow_events = new Map();
  }
  return g.__kristal_shadow_events;
}

/** Every Manager-owned department. Order defines UI enumeration; the
 *  workflow-advancement check treats them as an unordered set. HR is NOT
 *  in this list — HR's own block (`shadow.hr`) is what unlocks after all
 *  of these are marked complete. */
export const MANAGER_DEPT_KEYS: readonly ShadowDeptKey[] = [
  "SALES",
  "FINANCE",
  "TECH",
  "IT",
  "CCM",
] as const;

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyRecord(bookingId: string): ShadowEventRecord {
  const now = new Date().toISOString();
  return {
    bookingId,
    kemsStatus: "ACTIVE",
    rosterByDept: {},
    hr: { completed: false, lines: [] },
    finance: { completed: false, lines: [] },
    programFlow: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Fetch the shadow record for a booking. Returns null if it hasn't been
 *  created yet — most callers should use `getOrCreateShadowEvent` instead. */
export function getShadowEvent(bookingId: string): ShadowEventRecord | null {
  return store().get(bookingId) ?? null;
}

/** Lazy-init the shadow record on first access. Safe to call from any
 *  read path that expects the record to always exist for an Active
 *  booking — the write happens once, subsequent calls return the cached
 *  object by reference (mutations must go through the update helpers to
 *  bump updatedAt). */
export function getOrCreateShadowEvent(bookingId: string): ShadowEventRecord {
  const existing = store().get(bookingId);
  if (existing) return existing;
  const created = emptyRecord(bookingId);
  store().set(bookingId, created);
  return created;
}

/** Applies a partial patch to an existing (or lazily-created) shadow
 *  record, bumps updatedAt, and returns the new object. The patch is
 *  shallow-merged; nested blocks (rosterByDept, hr, finance) should be
 *  replaced wholesale by the caller if being modified. */
export function updateShadowEvent(
  bookingId: string,
  patch: Partial<Omit<ShadowEventRecord, "bookingId" | "createdAt" | "updatedAt">>,
): ShadowEventRecord {
  const current = getOrCreateShadowEvent(bookingId);
  const next: ShadowEventRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store().set(bookingId, next);
  return next;
}

/** Read a single department's roster block — treats a missing dept as an
 *  empty, not-yet-started block so callers don't need to null-check. */
export function getDeptRoster(
  bookingId: string,
  deptKey: ShadowDeptKey,
): DeptRoster {
  const shadow = getOrCreateShadowEvent(bookingId);
  return shadow.rosterByDept[deptKey] ?? { completed: false, slots: [], staff: [] };
}

/** Wholesale-replace one department's roster block and recompute the
 *  overall kemsStatus. Returns the updated record. */
export function setDeptRoster(
  bookingId: string,
  deptKey: ShadowDeptKey,
  roster: DeptRoster,
): ShadowEventRecord {
  const current = getOrCreateShadowEvent(bookingId);
  const nextRosterByDept: ShadowEventRecord["rosterByDept"] = {
    ...current.rosterByDept,
    [deptKey]: roster,
  };
  const nextKemsStatus = computeKemsStatus({
    ...current,
    rosterByDept: nextRosterByDept,
  });
  return updateShadowEvent(bookingId, {
    rosterByDept: nextRosterByDept,
    kemsStatus: nextKemsStatus,
  });
}

/** Marks the "booking is now Active — everyone was notified" flag. Idempotent:
 *  a second call with the same bookingId is a no-op, so the calling code can
 *  safely re-run on every Sheet refetch. Returns true when the flag was set
 *  this call (caller then fires the notification fan-out); false when
 *  already set. */
export function markActiveNotified(bookingId: string): boolean {
  const current = getOrCreateShadowEvent(bookingId);
  if (current.activeNotifiedAt) return false;
  updateShadowEvent(bookingId, { activeNotifiedAt: new Date().toISOString() });
  return true;
}

/** Flags HR's block complete and advances the workflow. Idempotent. */
export function markHrComplete(
  bookingId: string,
  userId: string,
): ShadowEventRecord {
  const current = getOrCreateShadowEvent(bookingId);
  if (current.hr.completed) return current;
  const next: ShadowEventRecord = {
    ...current,
    hr: {
      ...current.hr,
      completed: true,
      completedAt: new Date().toISOString(),
      completedByUserId: userId,
    },
  };
  return updateShadowEvent(bookingId, {
    hr: next.hr,
    kemsStatus: computeKemsStatus(next),
  });
}

/** Flags Finance Lead's block complete and advances the workflow to
 *  PUBLISHED. Idempotent. */
export function markFinanceComplete(
  bookingId: string,
  userId: string,
): ShadowEventRecord {
  const current = getOrCreateShadowEvent(bookingId);
  if (current.finance.completed) return current;
  const next: ShadowEventRecord = {
    ...current,
    finance: {
      ...current.finance,
      completed: true,
      completedAt: new Date().toISOString(),
      completedByUserId: userId,
    },
  };
  return updateShadowEvent(bookingId, {
    finance: next.finance,
    kemsStatus: computeKemsStatus(next),
  });
}

/** Derives the KEMS workflow status from the record's completion flags.
 *  Called on every roster/HR/finance write so the status is always in sync
 *  with the underlying data — no separate "advance workflow" step to
 *  forget. The logic is: MANAGERS all done → HR_UNLOCKED; +HR done →
 *  FINANCE_UNLOCKED; +Finance done → PUBLISHED. Any progress before all
 *  managers done keeps us at MANAGERS_IN_PROGRESS or ACTIVE. */
export function computeKemsStatus(record: ShadowEventRecord): ShadowEventKemsStatus {
  const managersDone = MANAGER_DEPT_KEYS.every(
    (k) => record.rosterByDept[k]?.completed === true,
  );
  const managersStarted = MANAGER_DEPT_KEYS.some((k) => {
    const r = record.rosterByDept[k];
    if (!r) return false;
    return r.completed || r.slots.length > 0 || r.staff.length > 0;
  });

  if (record.finance.completed) return "PUBLISHED";
  if (record.hr.completed) return "FINANCE_UNLOCKED";
  if (managersDone) return "HR_UNLOCKED";
  if (managersStarted) return "MANAGERS_IN_PROGRESS";
  return "ACTIVE";
}

/** ID generator exported for callers that build sub-records (roster slots,
 *  HR lines, finance lines) client-side and want a consistent format. */
export function shadowMakeId(prefix: string): string {
  return makeId(prefix);
}

/** Bulk-purge shadow records whose bookingIds are no longer present in
 *  the Sheet. Called opportunistically after a Sheet refresh — the Sales
 *  team occasionally deletes bookings; we shouldn't hold orphan KEMS
 *  state indefinitely. */
export function purgeMissingShadowEvents(activeBookingIds: Set<string>): number {
  const s = store();
  let removed = 0;
  for (const id of s.keys()) {
    if (!activeBookingIds.has(id)) {
      s.delete(id);
      removed += 1;
    }
  }
  return removed;
}

/** Read-only iteration over all shadow records — used by dashboards that
 *  need to layer KEMS state over the Sheet-sourced booking list. */
export function listShadowEvents(): ShadowEventRecord[] {
  return Array.from(store().values());
}
