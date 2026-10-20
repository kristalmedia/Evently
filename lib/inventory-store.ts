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
  quantity?: number;
}): CatalogItem {
  const now = new Date().toISOString();
  const item: CatalogItem = {
    id: makeCustomId(),
    dept: input.dept,
    name: input.name.trim(),
    isSeed: false,
    quantity: Math.max(0, Math.floor(input.quantity ?? 0)),
    createdAt: now,
    updatedAt: now,
  };
  state().catalog.set(item.id, item);
  return item;
}

/** Delete any catalog item (seed or custom). Returns false only when the
 *  id doesn't exist. Seed-protection was removed per the "Delete button
 *  for every item" spec — if a dept wants their original seed roster
 *  back, a process restart will rebuild it from lib/inventory-seed.ts. */
export function deleteCatalogItem(id: string): boolean {
  const s = state();
  if (!s.catalog.has(id)) return false;
  return s.catalog.delete(id);
}

/** Update any subset of a catalog item's editable fields in one write.
 *  Returns the updated record, or null if the id doesn't exist. Writes
 *  are shallow — only the fields present in `patch` are touched. Does
 *  NOT touch updatedAt if every field in the patch already matches the
 *  stored value (so a no-op PATCH stays reference-equal for the caller
 *  to detect and skip auditing). */
export function updateCatalogItem(
  id: string,
  patch: { name?: string; description?: string; quantity?: number },
): CatalogItem | null {
  const s = state();
  const existing = s.catalog.get(id);
  if (!existing) return null;

  const next: CatalogItem = { ...existing };
  let changed = false;

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim().slice(0, 200);
    if (trimmed && trimmed !== existing.name) {
      next.name = trimmed;
      changed = true;
    }
  }

  if (patch.description !== undefined) {
    const trimmed = patch.description.trim().slice(0, 1000);
    // Treat "" as "clear the description" rather than "no change".
    const nextDescription = trimmed || undefined;
    if (nextDescription !== existing.description) {
      next.description = nextDescription;
      changed = true;
    }
  }

  if (patch.quantity !== undefined) {
    const q = Number.isFinite(patch.quantity)
      ? Math.max(0, Math.floor(patch.quantity))
      : 0;
    if (q !== existing.quantity) {
      next.quantity = q;
      changed = true;
    }
  }

  if (!changed) return existing;
  next.updatedAt = new Date().toISOString();
  s.catalog.set(id, next);
  return next;
}

/** @deprecated Use updateCatalogItem({ quantity }). Kept as a thin shim so
 *  older callers (and the quantity-only PATCH path in the API route)
 *  continue to work during the transition. */
export function setCatalogItemQuantity(
  id: string,
  quantity: number,
): CatalogItem | null {
  return updateCatalogItem(id, { quantity });
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
