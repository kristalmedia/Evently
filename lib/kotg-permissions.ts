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

/** Which department roster block, if any, can this user edit right now?
 *  Returns the dept key (e.g. "SALES", "TECH") or null.
 *
 *  Managers remain dept-scoped — they can edit ONLY their own
 *  department's roster, derived from User.department. Roster/Inventory
 *  Admins have no equivalent dept-scoping field, so they're handled in
 *  canEditDept directly as "edit any dept" callers.
 *
 *  Managers can edit their own dept's roster at any eventlyStatus,
 *  including after their own block is marked complete and after the
 *  event is fully Confirmed (PUBLISHED) — last-minute corrections to a
 *  completed/past roster are explicitly allowed. There is no stage-
 *  based freeze. */
export function editableDeptForManager(
  user: User | null | undefined,
): ShadowDeptKey | null {
  if (!user || user.status === "disabled") return null;
  if (!hasRole(user, "MANAGER")) return null;

  const key = rosterDeptKeyForDepartment(user.department);
  if (!key) return null;
  // Filter to the dept keys the shadow store knows about (excludes the
  // shared DJ pool, which isn't a Manager-owned roster).
  if (!(MANAGER_DEPT_KEYS as readonly string[]).includes(key)) return null;
  return key as ShadowDeptKey;
}

/** Full authorisation check for editing a specific dept's roster block.
 *  Only the three ROSTER_AUTHORIZED_ROLES hold roster edit rights:
 *    - MANAGER: edits only their own department (dept-scoped via
 *      editableDeptForManager).
 *    - ROSTER_ADMIN / INVENTORY_ADMIN: edit any department (no dept-
 *      scoping field exists for them).
 *
 *  HR, Finance Lead, and Super Admin have NO roster edit access — this
 *  is intentional per the roster-access-restriction spec. Super Admin
 *  users who need roster edit must additionally hold MANAGER /
 *  ROSTER_ADMIN / INVENTORY_ADMIN as a secondary/third role. The
 *  eventlyStatus argument is retained for API-signature stability but
 *  no longer gates anything here. */
export function canEditDept(
  user: User | null | undefined,
  deptKey: ShadowDeptKey,
  _eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!canAccessRoster(user)) return false;

  // Roster/Inventory Admins — any dept.
  if (hasRole(user, "ROSTER_ADMIN") || hasRole(user, "INVENTORY_ADMIN")) {
    return true;
  }

  // Pure Manager (no roster-admin / inventory-admin hat) — own dept only.
  return editableDeptForManager(user) === deptKey;
}

/** Whether the current user is allowed to edit any confirmed-event
 *  roster (i.e. after PUBLISHED, from the unified "Who's working"
 *  table). Convenience wrapper around canAccessRoster for a UI-side
 *  render-or-hide check — the three authorised roles can all make
 *  last-minute edits via the confirmed-event unified table. */
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

/** Read access to the full roster (not just one dept).
 *
 *  Only the three ROSTER_AUTHORIZED_ROLES see the roster at all:
 *    - MANAGER: sees only their own department's block (dept-scoped).
 *    - ROSTER_ADMIN / INVENTORY_ADMIN: see every dept.
 *
 *  The eventlyStatus argument is retained for API-signature stability
 *  but no longer unlocks additional viewers at HR_UNLOCKED+ — that
 *  broader "once planning closes, everyone can see" rule is gone. */
export function canViewFullRoster(
  user: User | null | undefined,
  _eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!canAccessRoster(user)) return false;
  // Managers are dept-scoped (visibleDeptKeysForShadow returns just
  // their own key); only Roster/Inventory Admins see every dept.
  return hasRole(user, "ROSTER_ADMIN") || hasRole(user, "INVENTORY_ADMIN");
}

/** Which dept keys should this user see on the event detail page's
 *  roster grid? Only the three ROSTER_AUTHORIZED_ROLES see anything:
 *    - MANAGER: just their own department.
 *    - ROSTER_ADMIN / INVENTORY_ADMIN: every department.
 *    - Everyone else: an empty list — the roster surface doesn't render. */
export function visibleDeptKeysForShadow(
  user: User | null | undefined,
  _eventlyStatus: ShadowEventEventlyStatus,
): readonly ShadowDeptKey[] {
  if (!user) return [];
  if (!canAccessRoster(user)) return [];

  if (hasRole(user, "ROSTER_ADMIN") || hasRole(user, "INVENTORY_ADMIN")) {
    return MANAGER_DEPT_KEYS;
  }

  if (hasAnyRole(user, ["MANAGER"])) {
    const own = rosterDeptKeyForDepartment(user.department);
    if (own && (MANAGER_DEPT_KEYS as readonly string[]).includes(own)) {
      return [own as ShadowDeptKey];
    }
  }
  return [];
}
