import type {
  CatalogItem,
  EventInventoryRecord,
  EventInventoryTick,
  InventoryDept,
} from "./inventory-types";
import { buildSeedCatalog } from "./inventory-seed";

/**
 * In-memory store for the inventory feature — one global catalog (item
 * list per dept, editable) plus per-event tick records (Required / Qty /
 * Prepared / Warehouse booleans, keyed by bookingId → itemId).
 *
 * Same globalThis-anchoring pattern as lib/store.ts and lib/shadow-events.ts
 * so Next.js dev-mode HMR doesn't wipe an in-progress edit session; still
 * process-lifetime only (a full `pm2 restart` clears it back to seed).
 */

const g = globalThis as unknown as {
  __kristal_inventory?: {
    catalog: Map<string, CatalogItem>;
    events: Map<string, EventInventoryRecord>;
  };
};

function state(): { catalog: Map<string, CatalogItem>; events: Map<string, EventInventoryRecord> } {
  if (!g.__kristal_inventory) {
    const catalog = new Map<string, CatalogItem>();
    for (const item of buildSeedCatalog()) catalog.set(item.id, item);
    g.__kristal_inventory = { catalog, events: new Map() };
  }
  return g.__kristal_inventory;
}

function makeCustomId(): string {
  return `inv_c_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Catalog ──────────────────────────────────────────────────────────────

/** All catalog items, unsorted — callers group/sort as needed. */
export function listCatalogItems(): CatalogItem[] {
  return Array.from(state().catalog.values());
}

/** Look up one catalog item by id. */
export function getCatalogItem(id: string): CatalogItem | null {
  return state().catalog.get(id) ?? null;
}

/** Add a custom (non-seed) item to the given department. Returns the
 *  fully-populated new record. */
export function addCatalogItem(input: {
  dept: InventoryDept;
  name: string;
}): CatalogItem {
  const now = new Date().toISOString();
  const item: CatalogItem = {
    id: makeCustomId(),
    dept: input.dept,
    name: input.name.trim(),
    isSeed: false,
    createdAt: now,
    updatedAt: now,
  };
  state().catalog.set(item.id, item);
  return item;
}

/** Delete a custom catalog item. Seed items are protected — returns false
 *  and does nothing if called against one. */
export function deleteCatalogItem(id: string): boolean {
  const s = state();
  const existing = s.catalog.get(id);
  if (!existing || existing.isSeed) return false;
  return s.catalog.delete(id);
}

// ─── Per-event ticks ──────────────────────────────────────────────────────

/** Read one booking's tick record. Returns an empty record (no ticks) if
 *  the booking has never been touched — callers don't need to null-check. */
export function getEventInventory(bookingId: string): EventInventoryRecord {
  const existing = state().events.get(bookingId);
  if (existing) return existing;
  return {
    bookingId,
    ticks: {},
    updatedAt: new Date().toISOString(),
  };
}

/** Merge a partial set of tick updates into a booking's record. Any item
 *  ids not present in `patch` are left untouched — callers can save just
 *  the depts they can edit without wiping the others' state. */
export function saveEventInventoryTicks(input: {
  bookingId: string;
  patch: Record<string, EventInventoryTick>;
  userId: string;
}): EventInventoryRecord {
  const s = state();
  const current = s.events.get(input.bookingId) ?? {
    bookingId: input.bookingId,
    ticks: {},
    updatedAt: new Date().toISOString(),
  };
  const nextTicks: Record<string, EventInventoryTick> = { ...current.ticks };
  for (const [itemId, tick] of Object.entries(input.patch)) {
    // Sparse: drop entries that are exactly the empty tick to keep the
    // store lean (matches how getEventInventory treats absent entries).
    const isEmpty =
      !tick.required && !tick.prepared && !tick.atWarehouse && tick.quantity === 0;
    if (isEmpty) delete nextTicks[itemId];
    else nextTicks[itemId] = tick;
  }
  const next: EventInventoryRecord = {
    bookingId: input.bookingId,
    ticks: nextTicks,
    updatedAt: new Date().toISOString(),
    updatedByUserId: input.userId,
  };
  s.events.set(input.bookingId, next);
  return next;
}
