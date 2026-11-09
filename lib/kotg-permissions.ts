import type { Role, User } from "./types";
import type { ShadowEventEventlyStatus } from "./shadow-events-types";
import type { ShadowDeptKey } from "./shadow-events-types";
import type { InventoryDept } from "./inventory-types";
import {
  hasAnyRole,
  hasRole,
  isSuperAdmin,
  rosterDeptKeyForDepartment,
} from "./permissions";
import { MANAGER_DEPT_KEYS } from "./shadow-events";

/** Inverse of ROSTER_DEPT_TO_INVENTORY_DEPT (in lib/inventory-permissions.ts):
 *  maps an InventoryAdmin's User.inventoryDept to the ShadowDeptKey they
 *  should be dept-scoped to on the roster side. Only the four inventory
 *  depts that have a corresponding roster block appear here —
 *  EVENTS/OTHERS have no roster counterpart, so an InventoryAdmin
 *  assigned to those gets zero roster access (same "no clean match"
 *  outcome as a Manager whose dept doesn't map, e.g. General Manager). */
const INVENTORY_DEPT_TO_SHADOW_DEPT: Partial<Record<InventoryDept, ShadowDeptKey>> = {
  IT: "IT",
  SALES: "SALES",
  TECH_OPS: "TECH",
  CCM_TECH_OPS: "CCM",
};

/**
 * Evently-side authorisation rules for shadow-record editing on KOTG
 * bookings. Separated from lib/permissions.ts because these rules
 * depend on the shadow record's eventlyStatus, which lib/permissions is
 * deliberately kept independent of.
 *
 * Roster surfaces (view AND edit) are gated to exactly three roles —
 * MANAGER, ROSTER_ADMIN, INVENTORY_ADMIN. This narrower-than-default
 * matrix is deliberate (explicit product decision, see commit message)
 * and intentionally departs from the "Super Admin bypasses everything"
 * pattern used elsewhere in the app: Super Admin has NO roster access
 * unless they also hold one of the three authorised roles.
 *
 * HR's separate meal-ticks / OT editor (canEditHr, canEditHrOvertime
 * below) is NOT part of "the roster" and still grants HR access as
 * before — HR's OT/meal workflow would otherwise be unperformable, and
 * removing it was out of scope for the roster-access change.
 */
export const ROSTER_AUTHORIZED_ROLES: readonly Role[] = [
  "MANAGER",
  "ROSTER_ADMIN",
  "INVENTORY_ADMIN",
];

/** Does this user hold any role that grants roster-feature access?
 *  Baseline for every other roster helper in this file — if this is
 *  false, the user sees no roster surfaces at all. */
export function canAccessRoster(user: User | null | undefined): boolean {
  if (!user || user.status === "disabled") return false;
  return hasAnyRole(user, ROSTER_AUTHORIZED_ROLES);
}

/** The single roster dept this user is dept-scoped to, derived from
 *  User.department. Returns null for users whose department doesn't
 *  map to any ShadowDeptKey (General Manager, Unassigned, HR,
 *  Finance). Used by Managers and Roster Admins (both scoped via
 *  User.department).
 *
 *  Independent of role — the role check is the caller's job. */
function ownRosterDeptForUser(
  user: User | null | undefined,
): ShadowDeptKey | null {
  if (!user || user.status === "disabled") return null;
  const key = rosterDeptKeyForDepartment(user.department);
  if (!key) return null;
  // Filter to the dept keys the shadow store knows about (excludes
  // the shared DJ pool, which isn't a Manager-owned roster).
  if (!(MANAGER_DEPT_KEYS as readonly string[]).includes(key)) return null;
  return key as ShadowDeptKey;
}

/** The single roster dept an INVENTORY_ADMIN is dept-scoped to, derived
 *  from User.inventoryDept via INVENTORY_DEPT_TO_SHADOW_DEPT. Returns
 *  null when the user doesn't hold INVENTORY_ADMIN, has no inventoryDept
 *  assigned, or is assigned to a dept with no roster counterpart
 *  (EVENTS, OTHERS). */
function ownRosterDeptForInventoryAdmin(
  user: User | null | undefined,
): ShadowDeptKey | null {
  if (!user || user.status === "disabled") return null;
  if (!hasRole(user, "INVENTORY_ADMIN")) return null;
  if (!user.inventoryDept) return null;
  return INVENTORY_DEPT_TO_SHADOW_DEPT[user.inventoryDept] ?? null;
}

/** Union of all roster depts this user is scoped to, across every role
 *  they hold. Keeps the "pick a side by priority" problem out of the
 *  call sites — a user who is both MANAGER of IT and INVENTORY_ADMIN
 *  for SALES correctly sees both IT and SALES rosters (and nothing
 *  else). Deduplicated; order matches MANAGER_DEPT_KEYS. */
function allOwnedRosterDepts(
  user: User | null | undefined,
): readonly ShadowDeptKey[] {
  if (!user) return [];
  const set = new Set<ShadowDeptKey>();
  // MANAGER / ROSTER_ADMIN own their User.department-derived dept.
  if (hasAnyRole(user, ["MANAGER", "ROSTER_ADMIN"])) {
    const own = ownRosterDeptForUser(user);
    if (own) set.add(own);
  }
  // INVENTORY_ADMIN owns the roster dept that corresponds to their
  // inventoryDept, if any.
  const invOwn = ownRosterDeptForInventoryAdmin(user);
  if (invOwn) set.add(invOwn);
  return MANAGER_DEPT_KEYS.filter((k) => set.has(k));
}

/** @deprecated Use ownRosterDeptForUser + a Manager role check at the
 *  call site. Kept as a named export because external code may still
 *  import it; semantics are unchanged (null for non-Managers). */
export function editableDeptForManager(
  user: User | null | undefined,
): ShadowDeptKey | null {
  if (!user || !hasRole(user, "MANAGER")) return null;
  return ownRosterDeptForUser(user);
}

/** Full authorisation check for editing a specific dept's roster block.
 *  All three ROSTER_AUTHORIZED_ROLES are now dept-scoped (Nov 2026):
 *    - MANAGER: edits only their own department (via User.department).
 *    - ROSTER_ADMIN: edits only their own department (via User.department,
 *      same mechanism as Manager).
 *    - INVENTORY_ADMIN: edits only the roster dept that corresponds to
 *      their User.inventoryDept, via INVENTORY_DEPT_TO_SHADOW_DEPT
 *      (IT/SALES/TECH_OPS/CCM_TECH_OPS → IT/SALES/TECH/CCM). An admin
 *      assigned to EVENTS or OTHERS gets no roster access — those
 *      inventory sections have no roster counterpart.
 *
 *  A user who holds multiple roles (e.g. MANAGER + INVENTORY_ADMIN) is
 *  authorised for the UNION of their scopes.
 *
 *  HR, Finance Lead, and Super Admin have NO roster edit access. The
 *  eventlyStatus argument is retained for API-signature stability but
 *  no longer gates anything here. */
export function canEditDept(
  user: User | null | undefined,
  deptKey: ShadowDeptKey,
  _eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!canAccessRoster(user)) return false;
  return allOwnedRosterDepts(user).includes(deptKey);
}

/** Whether the current user is allowed to edit a confirmed-event
 *  roster at all (not WHICH dept). The three authorised roles can all
 *  make last-minute edits via the confirmed-event unified table — the
 *  table itself still gates per-row by canEditDept, so a dept-scoped
 *  Manager/Roster-Admin sees only their own rows as editable. */
export function canEditConfirmedRoster(
  user: User | null | undefined,
): boolean {
  return canAccessRoster(user);
}

/** HR can edit their block (meal ticks + "Mark complete" gesture) once
 *  the workflow reaches HR_UNLOCKED and until the workflow freezes at
 *  PUBLISHED.
 *
 *  Super Admin bypasses ALL the gates here — including the PUBLISHED
 *  freeze — so IT can always fix a mis-typed OT amount or a wrong
 *  meal tick without having to reopen a Sheet booking. That matches
 *  Super Admin's role as a god-mode override across every other
 *  workflow in Evently. */
export function canEditHr(
  user: User | null | undefined,
  eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  if (eventlyStatus === "PUBLISHED") return false;
  if (!hasRole(user, "HR")) return false;
  return eventlyStatus === "HR_UNLOCKED" || eventlyStatus === "FINANCE_UNLOCKED";
}

/** Overtime amounts are a shared concern between HR (who proposes) and
 *  Finance Lead (who signs off on the money). So Finance Lead can edit
 *  the OT amounts too during their turn (FINANCE_UNLOCKED), even after
 *  HR marked its block complete — the "completed" freeze doesn't stop
 *  Finance from making a last-minute adjustment before publishing.
 *
 *  Meal ticks stay HR-only via canEditHr — Finance doesn't get to
 *  redefine who ate what. */
export function canEditHrOvertime(
  user: User | null | undefined,
  eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  if (eventlyStatus === "PUBLISHED") return false;
  if (hasRole(user, "HR")) {
    return eventlyStatus === "HR_UNLOCKED" || eventlyStatus === "FINANCE_UNLOCKED";
  }
  if (hasRole(user, "FINANCE_LEAD")) {
    return eventlyStatus === "FINANCE_UNLOCKED";
  }
  return false;
}

/** Finance Lead (Putri) can edit her block once HR finishes and until
 *  she marks her own block complete (which flips the record to PUBLISHED). */
export function canEditFinance(
  user: User | null | undefined,
  eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (eventlyStatus === "PUBLISHED") return false;
  if (isSuperAdmin(user)) return eventlyStatus === "FINANCE_UNLOCKED";
  return hasRole(user, "FINANCE_LEAD") && eventlyStatus === "FINANCE_UNLOCKED";
}

/** Read access to the full roster (every dept, not just one). Nobody
 *  now gets full-roster read via the roster permission layer — every
 *  authorised role is dept-scoped (Nov 2026 strict-dept rewrite), so
 *  cross-dept visibility would only come from HR's flat-roster surface
 *  or Super Admin tooling that bypasses these gates. Returns false for
 *  every user; retained as an exported symbol for API-signature
 *  stability with earlier call sites. */
export function canViewFullRoster(
  _user: User | null | undefined,
  _eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  return false;
}

/** Which dept keys should this user see on the event detail page's
 *  roster grid? Strict per-dept (Nov 2026):
 *    - MANAGER: their own department (via User.department).
 *    - ROSTER_ADMIN: their own department (via User.department).
 *    - INVENTORY_ADMIN: the roster dept corresponding to their
 *      User.inventoryDept (via INVENTORY_DEPT_TO_SHADOW_DEPT).
 *    - A user who holds multiple of the above sees the UNION.
 *    - Everyone else: an empty list — the roster surface doesn't render.
 *
 *  A user whose User.department doesn't map to a ShadowDeptKey (HR,
 *  Finance, General Manager, Unassigned) contributes nothing from the
 *  Manager/RosterAdmin side; similarly an INVENTORY_ADMIN assigned to
 *  EVENTS/OTHERS contributes nothing. A user with zero contributions
 *  across all roles sees no roster cards at all. */
export function visibleDeptKeysForShadow(
  user: User | null | undefined,
  _eventlyStatus: ShadowEventEventlyStatus,
): readonly ShadowDeptKey[] {
  if (!user) return [];
  if (!canAccessRoster(user)) return [];
  return allOwnedRosterDepts(user);
}
