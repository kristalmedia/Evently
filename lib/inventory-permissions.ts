import type { User } from "./types";
import type { InventoryDept } from "./inventory-types";
import { INVENTORY_DEPT_ORDER } from "./inventory-types";
import { hasRole, isSuperAdmin, rosterDeptKeyForDepartment } from "./permissions";

/**
 * Authorization rules for the inventory feature — strict per-department
 * scoping for every role (Nov 2026 rewrite; see git log for the prior
 * "5 admin roles get master-catalog read" model this replaces).
 *
 * The rule is a single predicate (dept, user) → bool, applied identically
 * to VIEW and EDIT: a user who can see dept X can modify dept X, and a
 * user who can modify dept X obviously can see it. There is no broader
 * read-across-all-depts tier any more — a user's inventory horizon is
 * exactly the set of depts in which they have a concrete assignment.
 *
 * Super Admin bypasses the dept check entirely (god-mode, unchanged).
 *
 * How a non-super-admin user acquires access to dept X:
 *   1. They are the roster lead for the matching dept — i.e. a MANAGER
 *      whose User.department maps to X via ROSTER_DEPT_TO_INVENTORY_DEPT.
 *   2. They hold INVENTORY_ADMIN AND User.inventoryDept === X.
 *   3. They hold an admin role whose "home" inventory dept is X:
 *      SALES_ADMIN → SALES_AND_EVENT, TECH_ADMIN → TECH_OPS,
 *      CCM_ADMIN → CCM_TECH_OPS.
 *
 * View and edit grants are now EQUIVALENT: anyone in rules 1–3 for
 * dept X can both see and modify X's catalog + per-event ticks. The
 * earlier "rule 3 is view-only" caveat was lifted on request so admin-
 * tag holders can tick their own dept's checklist without needing a
 * separate roster-lead or INVENTORY_ADMIN assignment on top.
 *
 * Roles that match none of the above (VIEWER, HR, FINANCE_LEAD,
 * FINANCIAL_ADMIN, ROSTER_ADMIN, a plain MANAGER whose department has no
 * matching inventory section, an INVENTORY_ADMIN without an assignment)
 * see no inventory at all. The page-level guard in app/(main)/inventory
 * redirects them to the dashboard.
 */

/** Maps the roster-side ShadowDeptKey the user leads (derived from
 *  User.department via rosterDeptKeyForDepartment) to the InventoryDept
 *  they get access to under the roster-lead rule. The SALES roster
 *  lead gets SALES_AND_EVENT (the merged Sales & Event inventory
 *  section). Entries NOT in this table (FINANCE, CCM) correctly yield
 *  "no roster-lead inventory access" since the inventory feature
 *  doesn't have a corresponding dept at all. */
const ROSTER_DEPT_TO_INVENTORY_DEPT: Partial<Record<string, InventoryDept>> = {
  IT: "IT",
  SALES: "SALES_AND_EVENT",
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

/** Admin-role → "home" inventory dept. Used to grant VIEW-only access
 *  under rule 3, and surfaced in the UI as the default dept-filter value
 *  on the per-event checklist. Any admin role NOT in this map (e.g.
 *  FINANCIAL_ADMIN, which has no corresponding inventory section)
 *  contributes no inventory access by its tag alone. */
const INVENTORY_HOME_DEPT_BY_ADMIN_ROLE: Partial<Record<string, InventoryDept>> = {
  SALES_ADMIN: "SALES_AND_EVENT",
  TECH_ADMIN: "TECH_OPS",
  CCM_ADMIN: "CCM_TECH_OPS",
};

/** The InventoryDept this user treats as their "home" — used to seed the
 *  default dept filter on the per-event checklist (and surfaced in the
 *  user-facing badge there). INVENTORY_ADMIN's explicit assignment wins
 *  over the roster-lead mapping; the roster-lead mapping wins over the
 *  admin-role fallback. Returns null for roles with no mapping. */
export function primaryInventoryDeptForUser(
  user: User | null | undefined,
): InventoryDept | null {
  if (!user || user.status === "disabled") return null;
  if (hasRole(user, "INVENTORY_ADMIN") && user.inventoryDept) {
    return user.inventoryDept;
  }
  const rosterLedDept = inventoryDeptForRosterLead(user);
  if (rosterLedDept) return rosterLedDept;
  for (const [roleName, dept] of Object.entries(INVENTORY_HOME_DEPT_BY_ADMIN_ROLE)) {
    if (hasRole(user, roleName as Parameters<typeof hasRole>[1])) return dept ?? null;
  }
  return null;
}

/** Does this user hold an admin role whose home inventory dept is X?
 *  Rule 3 of the dept grant (SALES_ADMIN → SALES_AND_EVENT, TECH_ADMIN
 *  → TECH_OPS, CCM_ADMIN → CCM_TECH_OPS). Independent of the
 *  INVENTORY_ADMIN assignment and the roster-lead mapping; checked on
 *  top of both. */
function adminHomeDeptGrants(
  user: User | null | undefined,
  dept: InventoryDept,
): boolean {
  if (!user) return false;
  for (const [roleName, home] of Object.entries(INVENTORY_HOME_DEPT_BY_ADMIN_ROLE)) {
    if (home !== dept) continue;
    if (hasRole(user, roleName as Parameters<typeof hasRole>[1])) return true;
  }
  return false;
}

/** EDIT access to a specific inventory department. Any of the three
 *  dept-grant rules (roster lead, INVENTORY_ADMIN assignment, or admin
 *  role home dept) is sufficient; Super Admin bypass applies as usual.
 *  View and edit grants are equivalent — if you can see dept X here,
 *  you can modify X's catalog and ticks. */
export function canEditInventoryDept(
  user: User | null | undefined,
  dept: InventoryDept,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;

  // Rule 1 — roster lead for the matching dept.
  if (inventoryDeptForRosterLead(user) === dept) return true;

  // Rule 2 — explicit INVENTORY_ADMIN assignment.
  if (hasRole(user, "INVENTORY_ADMIN") && user.inventoryDept === dept) return true;

  // Rule 3 — admin role whose home inventory dept matches.
  if (adminHomeDeptGrants(user, dept)) return true;

  return false;
}

/** READ access to a specific inventory department. Identical to
 *  canEditInventoryDept — view and edit grants are the same strict
 *  per-dept set (Super Admin bypass applies). There is no "broad read
 *  across all depts" tier — the previous MASTER_INVENTORY_READ_ROLES
 *  grant was removed in the Nov 2026 strict-dept rewrite, and the
 *  "admin home is view-only" asymmetry was lifted shortly after. */
export function canViewInventory(
  user: User | null | undefined,
  dept: InventoryDept,
): boolean {
  return canEditInventoryDept(user, dept);
}

/** The authoritative department filter for a user — the complete set of
 *  InventoryDepts this user is allowed to see. Primary consumer: query
 *  layers that want an explicit `WHERE dept IN (...)` style filter rather
 *  than filtering-after-fetch via canViewInventory. The UI also uses
 *  this to constrain the dept-filter dropdown so a scoped user doesn't
 *  see options they can't open.
 *
 *  Super Admin gets the full INVENTORY_DEPT_ORDER list. */
export function visibleInventoryDeptsForUser(
  user: User | null | undefined,
): readonly InventoryDept[] {
  if (!user || user.status === "disabled") return [];
  if (isSuperAdmin(user)) return INVENTORY_DEPT_ORDER;
  return INVENTORY_DEPT_ORDER.filter((dept) => canViewInventory(user, dept));
}

/** Convenience: is this user able to view at least one inventory dept?
 *  Used by page-level route guards — a zero-dept user is redirected
 *  away from /inventory rather than shown an empty catalog. */
export function canViewAnyInventoryDept(user: User | null | undefined): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  return INVENTORY_DEPT_ORDER.some((dept) => canViewInventory(user, dept));
}

/** Convenience: is this user able to edit any inventory dept at all?
 *  Narrower than canViewAnyInventoryDept — a user with only rule-3
 *  admin-home access can view but not edit. */
export function canEditAnyInventoryDept(user: User | null | undefined): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  return INVENTORY_DEPT_ORDER.some((dept) => canEditInventoryDept(user, dept));
}
