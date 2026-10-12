import type { Role, User } from "./types";
import type { ShadowEventEventlyStatus } from "./shadow-events-types";
import type { ShadowDeptKey } from "./shadow-events-types";
import {
  hasAnyRole,
  hasRole,
  isSuperAdmin,
  rosterDeptKeyForDepartment,
} from "./permissions";
import { MANAGER_DEPT_KEYS } from "./shadow-events";

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
 *  Finance). This is the mechanism Managers AND Roster Admins both
 *  use to be scoped to their own department; INVENTORY_ADMIN is NOT
 *  dept-scoped on the roster side and gets all-dept access.
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
 *  Only the three ROSTER_AUTHORIZED_ROLES hold roster edit rights, and
 *  two of the three are now dept-scoped:
 *    - MANAGER: edits only their own department (dept-scoped via
 *      User.department).
 *    - ROSTER_ADMIN: edits only their own department (dept-scoped via
 *      User.department, same mechanism as Manager — per the "roster
 *      admin only can be access based on their department only" rule).
 *    - INVENTORY_ADMIN: edits any department. NOT dept-scoped on the
 *      roster side — User.inventoryDept uses a different enum
 *      (InventoryDept) that doesn't 1:1 match ShadowDeptKey, and
 *      narrowing them here would require either a new field or a
 *      mapping that drops EVENTS/CCM_TECH_OPS/OTHERS admins into "no
 *      roster access", which wasn't the ask. Flag separately if you
 *      want them dept-scoped too.
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

  // Inventory Admin — all depts (not dept-scoped on the roster side).
  if (hasRole(user, "INVENTORY_ADMIN")) return true;

  // Manager OR Roster Admin — own dept only, via User.department.
  if (hasRole(user, "MANAGER") || hasRole(user, "ROSTER_ADMIN")) {
    return ownRosterDeptForUser(user) === deptKey;
  }

  return false;
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

/** Read access to the full roster (every dept, not just one).
 *
 *  Only INVENTORY_ADMIN gets the full-roster read now — Managers AND
 *  Roster Admins are both dept-scoped, so they see just their own
 *  department's block via visibleDeptKeysForShadow.
 *
 *  The eventlyStatus argument is retained for API-signature stability
 *  but no longer unlocks additional viewers at HR_UNLOCKED+. */
export function canViewFullRoster(
  user: User | null | undefined,
  _eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!canAccessRoster(user)) return false;
  return hasRole(user, "INVENTORY_ADMIN");
}

/** Which dept keys should this user see on the event detail page's
 *  roster grid? Only the three ROSTER_AUTHORIZED_ROLES see anything:
 *    - MANAGER: just their own department (via User.department).
 *    - ROSTER_ADMIN: just their own department (via User.department) —
 *      same dept-scoping as Manager.
 *    - INVENTORY_ADMIN: every department (not dept-scoped; see
 *      canEditDept doc).
 *    - Everyone else: an empty list — the roster surface doesn't render.
 *
 *  A Manager or Roster Admin whose User.department doesn't map to a
 *  ShadowDeptKey (HR, Finance, General Manager, Unassigned) sees
 *  nothing — same behavior as before this change. */
export function visibleDeptKeysForShadow(
  user: User | null | undefined,
  _eventlyStatus: ShadowEventEventlyStatus,
): readonly ShadowDeptKey[] {
  if (!user) return [];
  if (!canAccessRoster(user)) return [];

  if (hasRole(user, "INVENTORY_ADMIN")) {
    return MANAGER_DEPT_KEYS;
  }

  if (hasAnyRole(user, ["MANAGER", "ROSTER_ADMIN"])) {
    const own = ownRosterDeptForUser(user);
    if (own) return [own];
  }
  return [];
}
