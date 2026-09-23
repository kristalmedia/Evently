import type { User } from "./types";
import type { InventoryDept } from "./inventory-types";
import { hasRole, isSuperAdmin } from "./permissions";

/**
 * Authorization rules for the inventory feature.
 *
 * Read: anyone signed in and active can view the catalog + any event's
 * checklist. This mirrors the spec's "All authenticated users can view
 * (read-only) the completed inventory list within the Event Details
 * page" — we extend the same read floor to the /inventory catalog page.
 *
 * Edit: two rules union together.
 *   - Super Admin edits every dept, everywhere.
 *   - INVENTORY_ADMIN edits ONLY the dept named in their `inventoryDept`
 *     field. An admin whose inventoryDept isn't set can't edit anything;
 *     Super Admin has to assign one via the Users page first.
 *
 * There is deliberately no "any INVENTORY_ADMIN can edit any dept" fall-
 * through — the spec is explicit that a dept-scoped admin sees only
 * their own section as editable, and every other section is locked.
 */

export function canViewInventory(user: User | null | undefined): boolean {
  return !!user && user.status === "active";
}

export function canEditInventoryDept(
  user: User | null | undefined,
  dept: InventoryDept,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  if (!hasRole(user, "INVENTORY_ADMIN")) return false;
  return user.inventoryDept === dept;
}

/** Convenience: is this user able to edit any inventory dept at all? Used
 *  to decide whether to render "Add More Inventory Asset" affordances,
 *  whether to expose the ticks-edit UI, etc. */
export function canEditAnyInventoryDept(user: User | null | undefined): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  return hasRole(user, "INVENTORY_ADMIN") && !!user.inventoryDept;
}
