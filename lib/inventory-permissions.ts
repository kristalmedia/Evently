import type { User } from "./types";
import type { InventoryDept } from "./inventory-types";
import { INVENTORY_DEPT_ORDER } from "./inventory-types";
import { hasRole, isSuperAdmin, rosterDeptKeyForDepartment } from "./permissions";

/**
 * Authorization rules for the inventory feature.
 *
 * The access rule for every inventory department is "view and modify go
 * together" — gated identically by canEditInventoryDept. There is NO
 * global "anyone signed in can read all catalogs" fallback any more.
 *
 * A user has access to dept X if ANY of these hold:
 *   1. Super Admin — god-mode bypass (consistent with every other
 *      feature in the app except roster).
 *   2. Roster lead for the matching dept — a Manager whose
 *      User.department maps to the inventory dept via the
 *      MANAGER_DEPT_TO_INVENTORY_DEPT table below. The rule from the
 *      spec: "if a user is designated as the person in charge of the IT
 *      department's roster, they automatically gain access to view and
 *      edit only the IT inventory checklist."
 *   3. INVENTORY_ADMIN with User.inventoryDept === X — the explicit
 *      admin designation set by Super Admin on the Users page. Retained
 *      as a fallback for inventory depts that have no 1:1 roster lead
 *      (EVENTS, CCM_TECH_OPS, OTHERS); still works for the mapped depts
 *      too, so a dept can have both a Manager lead and a scoped admin.
 */

/** Maps the roster-side ShadowDeptKey the user leads (derived from
 *  User.department via rosterDeptKeyForDepartment) to the InventoryDept
 *  they get access to under the roster-lead rule. Only three depts have
 *  a clean 1:1 match. Entries NOT in this table (FINANCE, CCM — the
 *  roster depts without a matching inventory section) correctly yield
 *  "no roster-lead inventory access" since the inventory feature
 *  doesn't have a corresponding dept at all. */
const ROSTER_DEPT_TO_INVENTORY_DEPT: Partial<Record<string, InventoryDept>> = {
  IT: "IT",
  SALES: "SALES",
  TECH: "TECH_OPS",
};

/** Returns the single InventoryDept this user leads via their roster
 *  assignment, or null. Null means either: not a Manager at all, OR a
 *  Manager of a department that doesn't correspond to an inventory
 *  section (CCM, Finance). */
export function inventoryDeptForRosterLead(
  user: User | null | undefined,
): InventoryDept | null {
  if (!user || user.status === "disabled") return null;
  if (!hasRole(user, "MANAGER")) return null;
  const rosterKey = rosterDeptKeyForDepartment(user.department);
  if (!rosterKey) return null;
  return ROSTER_DEPT_TO_INVENTORY_DEPT[rosterKey] ?? null;
}

/** View access to a specific inventory department. View and modify use
 *  the SAME rule under the new spec — the paste explicitly says
 *  "view and modify" are both scoped by dept leadership. Use
 *  canViewAnyInventoryDept for page-level visibility gates. */
export function canViewInventory(
  user: User | null | undefined,
  dept: InventoryDept,
): boolean {
  return canEditInventoryDept(user, dept);
}

export function canEditInventoryDept(
  user: User | null | undefined,
  dept: InventoryDept,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;

  // Rule 2 — roster lead for the matching dept.
  if (inventoryDeptForRosterLead(user) === dept) return true;

  // Rule 3 — explicit INVENTORY_ADMIN assignment.
  if (hasRole(user, "INVENTORY_ADMIN") && user.inventoryDept === dept) return true;

  return false;
}

/** Convenience: is this user able to view at least one inventory dept?
 *  Used by page-level route guards and sidebar visibility — a user with
 *  zero accessible depts would just land on an empty page. */
export function canViewAnyInventoryDept(user: User | null | undefined): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  return INVENTORY_DEPT_ORDER.some((dept) => canEditInventoryDept(user, dept));
}

/** Convenience: is this user able to edit any inventory dept at all? Used
 *  to decide whether to render "Add More Inventory Asset" affordances,
 *  whether to expose the ticks-edit UI, etc. Same rule as "view any"
 *  under the current spec, since view and edit are gated identically. */
export function canEditAnyInventoryDept(user: User | null | undefined): boolean {
  return canViewAnyInventoryDept(user);
}
