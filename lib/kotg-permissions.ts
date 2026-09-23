import type { User } from "./types";
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
 */

/** Which department roster block, if any, can this user edit right now?
 *  Returns the dept key (e.g. "SALES", "TECH") or null.
 *
 *  Rules:
 *    - Super Admin: can edit any dept; caller passes the target key.
 *    - Manager whose User.department maps to a dept key: that key.
 *    - Everyone else: null.
 *
 *  Managers can edit their own dept's roster at ANY eventlyStatus,
 *  including after their own block is marked complete and after the
 *  event is fully Confirmed (PUBLISHED) — last-minute corrections to a
 *  completed/past roster are explicitly allowed, not just the broader
 *  "any Manager can edit any dept" exception that kicks in at PUBLISHED
 *  (see canEditDept below). There is deliberately no stage-based freeze
 *  here any more, so this no longer takes an eventlyStatus argument. */
export function editableDeptForManager(
  user: User | null | undefined,
): ShadowDeptKey | null {
  if (!user || user.status === "disabled") return null;

  // Super Admin bypass — surface a sentinel the caller can special-case
  // ("edit any"); most callers should use `canEditDept` for that check.
  if (isSuperAdmin(user)) return null;

  if (!hasRole(user, "MANAGER")) return null;

  const key = rosterDeptKeyForDepartment(user.department);
  if (!key) return null;
  // Filter to the dept keys the shadow store knows about (excludes the
  // shared DJ pool, which isn't a Manager-owned roster).
  if (!(MANAGER_DEPT_KEYS as readonly string[]).includes(key)) return null;
  return key as ShadowDeptKey;
}

/** Full authorisation check for editing a specific dept's roster block.
 *  Super Admin can edit any dept; Managers only their own (see rules on
 *  editableDeptForManager).
 *
 *  Post-confirmation exception: once eventlyStatus reaches PUBLISHED
 *  (the event is "Confirmed"), ANY Manager, HR, or Super Admin can
 *  edit ANY dept's roster — this is the last-minute-changes surface
 *  called out in the spec. The confirmed-event page renders a single
 *  unified roster table that saves per-dept via this same endpoint. */
export function canEditDept(
  user: User | null | undefined,
  deptKey: ShadowDeptKey,
  eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!user || user.status === "disabled") return false;

  // Post-confirmation: any Manager / HR / Super Admin can edit any dept.
  if (eventlyStatus === "PUBLISHED") {
    if (isSuperAdmin(user)) return true;
    return hasRole(user, "MANAGER") || hasRole(user, "HR");
  }

  if (isSuperAdmin(user)) {
    // Super Admin can edit any dept, but only until the workflow
    // reaches HR (then the roster freezes for HR to work with) —
    // resumes above at PUBLISHED for last-minute changes.
    return eventlyStatus === "ACTIVE" || eventlyStatus === "MANAGERS_IN_PROGRESS";
  }
  return editableDeptForManager(user) === deptKey;
}

/** Whether the current user is allowed to edit any confirmed-event
 *  roster (i.e. after PUBLISHED, from the unified "Who's working"
 *  table). Convenience wrapper around canEditDept for a UI-side
 *  render-or-hide check. */
export function canEditConfirmedRoster(
  user: User | null | undefined,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  return hasRole(user, "MANAGER") || hasRole(user, "HR");
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

/** Read access to the full roster (not just one dept). Post the HR
 *  unlock, HR sees every dept's block; before then, only Super Admin
 *  and the dept's own Manager see their block.
 *
 *  Once the roster is "done" — every Manager block flagged complete,
 *  i.e. eventlyStatus reaches HR_UNLOCKED or later — every viewer gets
 *  read access to every dept's slots. The event detail page becomes
 *  the shared source of truth for who's on shift, which is what people
 *  reach for once the planning phase closes. */
export function canViewFullRoster(
  user: User | null | undefined,
  eventlyStatus: ShadowEventEventlyStatus,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;

  // Once managers finish, the roster is a shared read for everyone.
  // Same threshold that unlocks HR — the "roster is done" moment.
  if (
    eventlyStatus === "HR_UNLOCKED" ||
    eventlyStatus === "FINANCE_UNLOCKED" ||
    eventlyStatus === "PUBLISHED"
  ) {
    return true;
  }

  // Pre-completion: only role-based readers get full roster access
  // (there is currently none before HR_UNLOCKED — Managers see their
  // own dept via visibleDeptKeysForShadow; kept as a hook if a future
  // role needs earlier full-read).
  return false;
}

/** Which dept keys should this user see on the event detail page's
 *  roster grid? A Manager sees only their own; anyone with full-roster
 *  read (Super Admin, HR post-unlock, Finance Lead post-unlock) sees all. */
export function visibleDeptKeysForShadow(
  user: User | null | undefined,
  eventlyStatus: ShadowEventEventlyStatus,
): readonly ShadowDeptKey[] {
  if (!user || user.status === "disabled") return [];
  if (canViewFullRoster(user, eventlyStatus)) return MANAGER_DEPT_KEYS;
  if (hasAnyRole(user, ["MANAGER"])) {
    const own = rosterDeptKeyForDepartment(user.department);
    if (own && (MANAGER_DEPT_KEYS as readonly string[]).includes(own)) {
      return [own as ShadowDeptKey];
    }
  }
  return [];
}
