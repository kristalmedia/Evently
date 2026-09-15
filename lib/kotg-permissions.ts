import type { User } from "./types";
import type { ShadowEventKemsStatus } from "./shadow-events-types";
import type { ShadowDeptKey } from "./shadow-events-types";
import {
  hasAnyRole,
  hasRole,
  isSuperAdmin,
  rosterDeptKeyForDepartment,
} from "./permissions";
import { MANAGER_DEPT_KEYS } from "./shadow-events";

/**
 * KEMS-side authorisation rules for shadow-record editing on KOTG
 * bookings. Separated from lib/permissions.ts because these rules
 * depend on the shadow record's kemsStatus, which lib/permissions is
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
 *  Editing is allowed at any kemsStatus except PUBLISHED — once finance
 *  finishes, everything freezes. The `HR_UNLOCKED` and later states also
 *  freeze Manager blocks (the completion is what unlocked HR); attempts
 *  to edit past that point return null. */
export function editableDeptForManager(
  user: User | null | undefined,
  kemsStatus: ShadowEventKemsStatus,
): ShadowDeptKey | null {
  if (!user || user.status === "disabled") return null;
  if (kemsStatus === "PUBLISHED") return null;

  // Super Admin bypass — surface a sentinel the caller can special-case
  // ("edit any"); most callers should use `canEditDept` for that check.
  if (isSuperAdmin(user)) return null;

  if (!hasRole(user, "MANAGER")) return null;

  // Once every Manager block is done (HR_UNLOCKED or later), Manager
  // edits are frozen so HR's read of the roster stays stable.
  if (kemsStatus !== "ACTIVE" && kemsStatus !== "MANAGERS_IN_PROGRESS") {
    return null;
  }
  const key = rosterDeptKeyForDepartment(user.department);
  if (!key) return null;
  // Filter to the dept keys the shadow store knows about (excludes the
  // shared DJ pool, which isn't a Manager-owned roster).
  if (!(MANAGER_DEPT_KEYS as readonly string[]).includes(key)) return null;
  return key as ShadowDeptKey;
}

/** Full authorisation check for editing a specific dept's roster block.
 *  Super Admin can edit any dept; Managers only their own (see rules on
 *  editableDeptForManager). */
export function canEditDept(
  user: User | null | undefined,
  deptKey: ShadowDeptKey,
  kemsStatus: ShadowEventKemsStatus,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (kemsStatus === "PUBLISHED") return false;
  if (isSuperAdmin(user)) {
    // Super Admin can edit any dept, but only until the finance freeze.
    return kemsStatus === "ACTIVE" || kemsStatus === "MANAGERS_IN_PROGRESS";
  }
  return editableDeptForManager(user, kemsStatus) === deptKey;
}

/** HR can edit their block once the workflow reaches HR_UNLOCKED and
 *  until the workflow freezes at PUBLISHED.
 *
 *  Super Admin bypasses ALL the gates here — including the PUBLISHED
 *  freeze — so IT can always fix a mis-typed OT amount or a wrong
 *  meal tick without having to reopen a Sheet booking. That matches
 *  Super Admin's role as a god-mode override across every other
 *  workflow in KEMS. */
export function canEditHr(
  user: User | null | undefined,
  kemsStatus: ShadowEventKemsStatus,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  if (kemsStatus === "PUBLISHED") return false;
  if (!hasRole(user, "HR")) return false;
  return kemsStatus === "HR_UNLOCKED" || kemsStatus === "FINANCE_UNLOCKED";
}

/** Finance Lead (Putri) can edit her block once HR finishes and until
 *  she marks her own block complete (which flips the record to PUBLISHED). */
export function canEditFinance(
  user: User | null | undefined,
  kemsStatus: ShadowEventKemsStatus,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (kemsStatus === "PUBLISHED") return false;
  if (isSuperAdmin(user)) return kemsStatus === "FINANCE_UNLOCKED";
  return hasRole(user, "FINANCE_LEAD") && kemsStatus === "FINANCE_UNLOCKED";
}

/** Read access to the full roster (not just one dept). Post the HR
 *  unlock, HR sees every dept's block; before then, only Super Admin
 *  and the dept's own Manager see their block.
 *
 *  Once the roster is "done" — every Manager block flagged complete,
 *  i.e. kemsStatus reaches HR_UNLOCKED or later — every viewer gets
 *  read access to every dept's slots. The event detail page becomes
 *  the shared source of truth for who's on shift, which is what people
 *  reach for once the planning phase closes. */
export function canViewFullRoster(
  user: User | null | undefined,
  kemsStatus: ShadowEventKemsStatus,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;

  // Once managers finish, the roster is a shared read for everyone.
  // Same threshold that unlocks HR — the "roster is done" moment.
  if (
    kemsStatus === "HR_UNLOCKED" ||
    kemsStatus === "FINANCE_UNLOCKED" ||
    kemsStatus === "PUBLISHED"
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
  kemsStatus: ShadowEventKemsStatus,
): readonly ShadowDeptKey[] {
  if (!user || user.status === "disabled") return [];
  if (canViewFullRoster(user, kemsStatus)) return MANAGER_DEPT_KEYS;
  if (hasAnyRole(user, ["MANAGER"])) {
    const own = rosterDeptKeyForDepartment(user.department);
    if (own && (MANAGER_DEPT_KEYS as readonly string[]).includes(own)) {
      return [own as ShadowDeptKey];
    }
  }
  return [];
}
