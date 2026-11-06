import type { Role, User } from "./types";
import type { InventoryDept } from "./inventory-types";
import { INVENTORY_DEPT_ORDER } from "./inventory-types";
import { hasAnyRole, hasRole, isSuperAdmin, rosterDeptKeyForDepartment } from "./permissions";

/**
 * Authorization rules for the inventory feature.
 *
 * View and edit are now SEPARATE rules (as of the Nov 2026 reshuffle):
 *
 *   VIEW — the five admin roles get read access to every department's
 *          master catalog. The rule: "all 5 admin roles must have full
 *          read/browsing access to the complete master inventory
 *          catalog." Plus Super Admin bypass as always, plus anyone with
 *          dept-scoped edit also sees their own dept.
 *
 *   EDIT — unchanged. A user can edit dept X if ANY of:
 *     1. Super Admin (god-mode).
 *     2. Roster lead for the matching dept (Manager whose
 *        User.department maps via ROSTER_DEPT_TO_INVENTORY_DEPT).
 *     3. INVENTORY_ADMIN with User.inventoryDept === X.
 *
 * Non-admin roles (VIEWER, HR, FINANCE_LEAD, MANAGER-without-matching-
 * dept) see nothing at all unless they also hold one of the five admin
 * tags or are the roster lead / Inventory-Admin for a specific dept.
 */

/** The five admin roles the spec grants master-catalog read access to.
 *  Kept as a const so the list has one source of truth across the view
 *  check, the sidebar permission grants in lib/permissions.ts, and any
 *  future "list every admin" surface. */
export const MASTER_INVENTORY_READ_ROLES: readonly Role[] = [
  "INVENTORY_ADMIN",
  "SALES_ADMIN",
  "CCM_ADMIN",
  "TECH_ADMIN",
  "FINANCIAL_ADMIN",
];

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

/** Maps an admin role to the InventoryDept it is "primarily responsible"
 *  for — used to seed the default dept filter on the per-event checklist
 *  (and surfaced in the user-facing badge there). Non-admin roles map
 *  to null, as do the broad-access ones (INVENTORY_ADMIN, which spans
 *  every dept by design).
 *
 *  FINANCIAL_ADMIN has no matching inventory dept, so defaults to
 *  "show all" — the role has catalog read but not a specific home. */
export function primaryInventoryDeptForUser(
  user: User | null | undefined,
): InventoryDept | null {
  if (!user || user.status === "disabled") return null;
  // INVENTORY_ADMIN with an explicit assignment → that one.
  if (hasRole(user, "INVENTORY_ADMIN") && user.inventoryDept) {
    return user.inventoryDept;
  }
  // Manager → their roster-mapped inventory dept, if any.
  const rosterLedDept = inventoryDeptForRosterLead(user);
  if (rosterLedDept) return rosterLedDept;
  // Admin-tag roles whose name implies a dept.
  if (hasRole(user, "SALES_ADMIN")) return "SALES";
  if (hasRole(user, "TECH_ADMIN")) return "TECH_OPS";
  // CCM_ADMIN — the inventory enum has CCM_TECH_OPS, closest match.
  if (hasRole(user, "CCM_ADMIN")) return "CCM_TECH_OPS";
  // FINANCIAL_ADMIN / INVENTORY_ADMIN-without-assignment / Super Admin
  // / anyone else: no "primary" dept.
  return null;
}

/** READ access to a specific inventory department. Broader than EDIT —
 *  any of the five admin roles (MASTER_INVENTORY_READ_ROLES) can read
 *  every dept's master catalog, independent of dept-scoping. */
export function canViewInventory(
  user: User | null | undefined,
  dept: InventoryDept,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  if (hasAnyRole(user, MASTER_INVENTORY_READ_ROLES)) return true;
  // A user who can EDIT a dept also sees it — this covers a Manager
  // whose roster-lead mapping gives them edit on their dept even
  // though they don't hold any of the admin tags above.
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
 *  Used by page-level route guards and sidebar visibility. */
export function canViewAnyInventoryDept(user: User | null | undefined): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  // The five admin roles always see at least one dept (they see all).
  if (hasAnyRole(user, MASTER_INVENTORY_READ_ROLES)) return true;
  // Otherwise fall back to dept-by-dept edit check for anyone who has
  // edit access somewhere via the roster-lead or inventory-dept rules.
  return INVENTORY_DEPT_ORDER.some((dept) => canEditInventoryDept(user, dept));
}

/** Convenience: is this user able to edit any inventory dept at all?
 *  NOTE this is NOT the same as canViewAnyInventoryDept any more — a
 *  SALES_ADMIN without a dept-edit rule has view-all but no edit. */
export function canEditAnyInventoryDept(user: User | null | undefined): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  return INVENTORY_DEPT_ORDER.some((dept) => canEditInventoryDept(user, dept));
}
