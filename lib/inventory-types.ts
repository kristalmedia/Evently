/**
 * Types for the department-scoped inventory checklist feature.
 *
 * Two independent data shapes:
 *   - CatalogItem  — global master list of items per department. Edited on
 *                    the /inventory page by department-scoped Inventory
 *                    Admins (or a Super Admin). Seed items ship with the
 *                    app and are protected from deletion; custom items
 *                    added later can be deleted by the same admins.
 *   - EventInventoryTick / EventInventoryRecord — per-event state for one
 *                    booking's inventory checklist. Referenced by
 *                    CatalogItem.id so renaming/removing a catalog item
 *                    doesn't silently rewrite a past event's snapshot.
 *
 * InventoryDept is deliberately a distinct enum from `Department` in
 * lib/types.ts — the inventory sections ("Events", "Others", "Tech Ops",
 * "CCM x Tech Ops") don't 1:1 map to Evently's user-department values,
 * and forcing that overlap would leave "Events" and "Others" without a
 * possible owner. Which section an Inventory Admin can edit is stored
 * separately as User.inventoryDept.
 */

export type InventoryDept =
  | "EVENTS"
  | "SALES"
  | "TECH_OPS"
  | "CCM_TECH_OPS"
  | "IT"
  | "OTHERS";

/** Human-readable label per InventoryDept — the exact wording used across
 *  every UI surface (page headings, section titles, admin picker). */
export const INVENTORY_DEPT_LABEL: Record<InventoryDept, string> = {
  EVENTS: "Events",
  SALES: "Sales",
  TECH_OPS: "Tech Ops",
  CCM_TECH_OPS: "CCM x Tech Ops",
  IT: "IT",
  OTHERS: "Others",
};

/** Iteration order for the UI (top to bottom on the /inventory page and
 *  on the per-event checklist). Matches the order in the source
 *  spreadsheet the seed data comes from. */
export const INVENTORY_DEPT_ORDER: readonly InventoryDept[] = [
  "EVENTS",
  "SALES",
  "TECH_OPS",
  "CCM_TECH_OPS",
  "IT",
  "OTHERS",
];

/** One row in the global catalog. `isSeed` marks the pre-populated
 *  defaults so they can't be accidentally deleted; custom items added
 *  through "Add More Inventory Asset" have isSeed=false and are
 *  deletable by any admin who can edit that dept.
 *
 *  `quantity` is the current stock count held at the catalog level (how
 *  many of this item the department has on hand overall). Editable by
 *  whoever has canEditInventoryDept for the item's dept — see the PATCH
 *  handler in /api/inventory/catalog/[itemId]. This is a global catalog
 *  figure, separate from the per-event `EventInventoryTick.quantity`
 *  which tracks "how many are needed for this specific booking". */
export interface CatalogItem {
  id: string;
  dept: InventoryDept;
  name: string;
  /** Optional free-text description shown under the name in the catalog
   *  row. Not surfaced on the per-event checklist view (that one shows
   *  the name only). Introduced alongside the Save-Changes editor; seed
   *  rows have it blank until a dept member fills one in. */
  description?: string;
  isSeed: boolean;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

/** Per-event state for a single catalog item. Missing/absent entries in
 *  EventInventoryRecord.ticks default to all-false / quantity 0 — the
 *  API and UI both treat "no tick recorded" and "explicitly all-false"
 *  as equivalent, so the store stays sparse. */
export interface EventInventoryTick {
  required: boolean;
  quantity: number;
  prepared: boolean;
  atWarehouse: boolean;
}

/** One booking's inventory ticks, keyed by CatalogItem.id. */
export interface EventInventoryRecord {
  bookingId: string;
  /** Sparse — only items with any non-default state need to be present. */
  ticks: Record<string, EventInventoryTick>;
  updatedAt: string;
  updatedByUserId?: string;
}

/** Default (empty) tick, returned by the store when an item hasn't been
 *  touched yet on a given event. */
export const EMPTY_TICK: EventInventoryTick = {
  required: false,
  quantity: 0,
  prepared: false,
  atWarehouse: false,
};
