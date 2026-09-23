import type { Permission, Role, User } from "./types";

/**
 * Role → permission matrix (spec §4).
 *
 * Super Admin bypasses this table entirely — see `can()`.
 * All other roles are permission-exact.
 *
 * NOTE: section-level edit gating (which s1..s8 blocks each role can edit)
 * lives in `editableSectionKeysForEvent` below, not here — some grants
 * depend on the event's current status (Manager Staff unlocks only during
 * STAFFING_IN_PROGRESS; Finance Lead Financial only during FINANCIAL_REVIEW).
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [], // bypass — see `can()`
  SALES_ADMIN: [
    // Formerly BROADCAST_ADMIN — Sales team. Creates + edits events with
    // Staff/Financial sections hidden entirely from their form nav.
    "dashboard.view",
    "events.view",
    "events.create",
    "events.edit",
    "events.publish",
    "events.manage_categories",
    "events.manage_venues",
    "events.assign_access",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
    "inventory.view",
  ],
  CCM_ADMIN: [
    // Mirror of SALES_ADMIN, scoped to CCM-department event ownership.
    // Section access is identical — no Staff/Financial editing.
    "dashboard.view",
    "events.view",
    "events.create",
    "events.edit",
    "events.publish",
    "events.manage_categories",
    "events.manage_venues",
    "events.assign_access",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
    "inventory.view",
  ],
  MANAGER: [
    // Staff editor (per-event, status-gated). Also handles Sign-off (s8).
    "dashboard.view",
    "events.view",
    "events.edit",
    "events.publish",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
    "inventory.view",
  ],
  FINANCE_LEAD: [
    // Putri — exclusive Financial editor (status-gated). Global read.
    "dashboard.view",
    "events.view",
    "events.edit",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
    "inventory.view",
  ],
  FINANCIAL_ADMIN: [
    // Rudy — Second Approver in the sign-off chain. Financial edit was
    // moved to FINANCE_LEAD to make Putri's "exclusive access" real.
    "dashboard.view",
    "events.view",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
    "inventory.view",
  ],
  HR: [
    // HR owns the overtime + meal-allowance block on every KOTG booking
    // (see components/kotg/hr-editor.tsx), so they need budget.view to
    // reach it — that permission gates the HR editor's parent on the
    // event detail page. Without it, an HR user can't see, let alone
    // tick, their own meal-allowance grid.
    "dashboard.view",
    "events.view",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
    "inventory.view",
  ],
  VIEWER: [
    "dashboard.view",
    "events.view",
    "calendar.view",
    "notifications.view",
    "inventory.view",
  ],
  ROSTER_ADMIN: [
    // Baseline read access, same shape as VIEWER, plus budget.view since
    // roster admins need to see the staffing cost impact of the shifts
    // they're managing. Deeper roster-editing rights (beyond what a
    // Manager already gets in lib/kotg-permissions.ts) aren't wired up
    // yet — this role exists in the enum and carries a sensible floor of
    // permissions; extending kotg-permissions.ts to recognise it is a
    // follow-up once the exact roster-admin workflow is specced.
    "dashboard.view",
    "events.view",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
    "inventory.view",
  ],
  INVENTORY_ADMIN: [
    // Baseline read across common surfaces, plus inventory.edit — which
    // is department-scoped by User.inventoryDept, enforced at the endpoint
    // and UI layer (see lib/inventory-permissions.ts). Holding
    // inventory.edit by itself doesn't authorise editing every dept.
    "dashboard.view",
    "events.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
    "inventory.view",
    "inventory.edit",
  ],
};

/**
 * All roles a user holds — primary + optional secondary + optional third.
 * Order matters: the primary is always index 0, which some UI surfaces
 * (badges, attribution strings) prefer.
 */
export function rolesFor(user: User | null | undefined): Role[] {
  if (!user) return [];
  const roles: Role[] = [user.role];
  if (user.secondaryRole) roles.push(user.secondaryRole);
  if (user.thirdRole) roles.push(user.thirdRole);
  return roles;
}

/**
 * Does the user hold this specific role, as primary, secondary, or third?
 * The right call in place of a raw `user.role === "X"` check anywhere in
 * the codebase — otherwise the secondary/third role goes ignored.
 */
export function hasRole(user: User | null | undefined, role: Role): boolean {
  if (!user) return false;
  return user.role === role || user.secondaryRole === role || user.thirdRole === role;
}

/** True if the user holds any of the given roles (primary, secondary, or third). */
export function hasAnyRole(user: User | null | undefined, roles: readonly Role[]): boolean {
  if (!user) return false;
  return (
    roles.includes(user.role) ||
    (!!user.secondaryRole && roles.includes(user.secondaryRole)) ||
    (!!user.thirdRole && roles.includes(user.thirdRole))
  );
}

export function isSuperAdmin(user: User | null | undefined): boolean {
  return !!user && hasRole(user, "SUPER_ADMIN") && user.status === "active";
}
/** @deprecated Use isSuperAdmin. */
export const isITAdmin = isSuperAdmin;

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function can(user: User | null | undefined, perm: Permission): boolean {
  if (!user) return false;
  if (user.status === "disabled") return false;
  // Super Admin bypass — except sign-off (reserved for the 3 approvers).
  if (isSuperAdmin(user)) {
    if (perm === "events.signoff") return false;
    return true;
  }
  // Union of primary + secondary role permissions — more permissive wins.
  for (const r of rolesFor(user)) {
    if (ROLE_PERMISSIONS[r].includes(perm)) return true;
  }
  return false;
}

export function canAny(user: User | null | undefined, perms: Permission[]): boolean {
  return perms.some((p) => can(user, p));
}

export function canViewBudget(user: User | null | undefined): boolean {
  return can(user, "budget.view");
}

/**
 * Narrower than canViewBudget — gates the "Estimated staffing budget" tile
 * at the top of the Staff section (Base Pay / OT / Meal Allowance / Total).
 * Restricted so Managers filling in roster don't see the money impact of
 * each shift they add. Only the money-owning roles + Super Admin see it.
 */
export function canViewStaffBudgetTile(user: User | null | undefined): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  return hasAnyRole(user, ["FINANCE_LEAD", "FINANCIAL_ADMIN"]);
}

/**
 * Maps User.department → the corresponding DEPT_ROSTER key in
 * lib/constants.ts. Returns null when the department has no roster card
 * (currently: "General Manager" and "Unassigned") — callers treat null as
 * "no scoping applies" and fall back to showing every card.
 */
export function rosterDeptKeyForDepartment(department: string | undefined): string | null {
  switch (department) {
    case "Sales":            return "SALES";
    case "Finance":          return "FINANCE";
    case "Technical":        return "TECH";
    case "IT":               return "IT";
    case "CCM":              return "CCM";
    case "HR":               return "HR";
    default:                 return null;   // General Manager, Unassigned, etc.
  }
}

/**
 * Which DEPT_ROSTER card keys should be visible to `user` when they tick
 * roster members. Rules:
 *   - Super Admin sees every card.
 *   - A user whose department maps to a roster card sees their own card +
 *     the DJ card (DJs are a shared pool with no departmental owner).
 *   - A user whose department doesn't map (General Manager, Unassigned)
 *     falls back to seeing every card — so a GM doesn't get locked out.
 * Return "all" as a sentinel to save the caller from building the full list.
 */
export function visibleRosterDeptKeys(user: User | null | undefined): string[] | "all" {
  if (!user || user.status === "disabled") return [];
  if (isSuperAdmin(user)) return "all";
  const own = rosterDeptKeyForDepartment(user.department);
  if (!own) return "all"; // fallback for GM/Unassigned per the spec
  return [own, "DJ"];
}

/**
 * Sign-off authorization — Nabeng (1st), Rudy (2nd), Jenny (Final) only.
 * Super Admins are explicitly EXCLUDED — sign-off is reserved for the three
 * designated approvers.
 */
const SIGNOFF_EMAILS = new Set(
  [
    "nabil.mahrub@kristal.media",     // Nabeng — 1st
    "khairuddin.rosli@kristal.media", // Rudy — 2nd
    "jenny.malaiali@kristal.media",   // Jenny — Final
  ].map((e) => e.toLowerCase())
);

export function canSignOff(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.status === "disabled") return false;
  return SIGNOFF_EMAILS.has(user.email.toLowerCase());
}

export type ApproverRole = "FIRST_APPROVER" | "SECOND_APPROVER" | "FINAL_APPROVER";

const EMAIL_TO_ROLE: Record<string, ApproverRole> = {
  "nabil.mahrub@kristal.media": "FIRST_APPROVER",
  "khairuddin.rosli@kristal.media": "SECOND_APPROVER",
  "jenny.malaiali@kristal.media": "FINAL_APPROVER",
};

export function approverRoleForUser(user: User | null | undefined): ApproverRole | null {
  if (!user) return null;
  return EMAIL_TO_ROLE[user.email.toLowerCase()] ?? null;
}

// ─── Action-specific helpers ───────────────────────────────────────────────

export function canDeleteEvent(user: User | null | undefined): boolean {
  return isSuperAdmin(user);
}

/** Persistent edit access — anyone who can edit at least one section on some event. */
export function canEditEvent(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return hasAnyRole(user, ["SALES_ADMIN", "CCM_ADMIN", "MANAGER", "FINANCE_LEAD"]);
}

export function canCancelEvent(user: User | null | undefined): boolean {
  return canEditEvent(user) || isSuperAdmin(user);
}

export function canApproveNow(
  user: User | null | undefined,
  status: string | undefined
): boolean {
  if (!user || user.status === "disabled") return false;
  const email = user.email.toLowerCase();
  if (status === "PENDING_APPROVAL") return email === "khairuddin.rosli@kristal.media";
  if (status === "PENDING_FINAL_APPROVAL") return email === "jenny.malaiali@kristal.media";
  return false;
}

// ─── Section-level edit gating (spec §4) ───────────────────────────────────
/**
 * Section keys, defined once so string typos don't drift out of sync.
 * Matches ALL_SECTIONS in components/events/event-form/index.tsx.
 *
 *   s1 = General Info    s2 = Additional Info   s3 = Broadcast
 *   s4 = Staff           s5 = Financial         s6 = Project Management
 *   s7 = Risk            s8 = Sign-off
 */
const NON_STAFF_NON_FINANCIAL: readonly string[] = ["s1", "s2", "s3", "s6", "s7", "s8"];

/**
 * Per-role editable section list for a specific event status. Kept as a
 * pure function of (role, status) so multi-role users can union results
 * from both their primary and secondary role. Returns null for roles that
 * hold no section-edit rights — cleaner to union than a `[]` sentinel.
 */
function editableSectionsForRoleOnEvent(
  role: Role,
  eventStatus: string | undefined
): string[] | "all" | null {
  switch (role) {
    case "SUPER_ADMIN":
      return "all";
    case "SALES_ADMIN":
    case "CCM_ADMIN":
      // Staff (s4) and Financial (s5) are permanently hidden — Sales/CCM
      // never fill those, at any stage.
      return [...NON_STAFF_NON_FINANCIAL];
    case "MANAGER": {
      const keys = ["s1", "s8"];
      if (eventStatus === "STAFFING_IN_PROGRESS") keys.push("s4");
      return keys;
    }
    case "FINANCE_LEAD":
      if (eventStatus === "FINANCIAL_REVIEW") return ["s5"];
      return [];
    case "FINANCIAL_ADMIN":
    case "HR":
    case "VIEWER":
    default:
      return null;
  }
}

/** Same shape as above but for the max-possible surface (no event yet). */
function editableSectionsForRoleMax(role: Role): string[] | "all" | null {
  switch (role) {
    case "SUPER_ADMIN":
      return "all";
    case "SALES_ADMIN":
    case "CCM_ADMIN":
      return [...NON_STAFF_NON_FINANCIAL];
    case "MANAGER":
      return ["s1", "s4", "s8"];
    case "FINANCE_LEAD":
      return ["s5"];
    default:
      return null;
  }
}

/** Union multiple per-role results into a single deduped list (or "all"). */
function unionEditable(results: (string[] | "all" | null)[]): string[] | "all" {
  if (results.some((r) => r === "all")) return "all";
  const set = new Set<string>();
  for (const r of results) {
    if (Array.isArray(r)) for (const k of r) set.add(k);
  }
  return Array.from(set);
}

/**
 * Which display-section keys a user is allowed to edit ON A SPECIFIC EVENT.
 * The event.status matters because Manager Staff access and Finance Lead
 * Financial access both unlock only at specific stages of the workflow.
 * Callers that don't have an event in hand should use `editableSectionKeys`
 * (below) which returns the role's *maximum* possible edit surface.
 *
 * Multi-role users get the UNION of both roles' allowances — more
 * permissive wins.
 */
export function editableSectionKeysForEvent(
  user: User | null | undefined,
  event: { status: string } | null | undefined
): string[] | "all" {
  if (!user || user.status === "disabled") return [];
  return unionEditable(
    rolesFor(user).map((r) => editableSectionsForRoleOnEvent(r, event?.status))
  );
}

/**
 * Role's maximum possible edit surface, ignoring per-event status.
 * Used by the "new event" form (no event yet) and by anywhere that needs
 * to decide whether to show edit affordances at all.
 */
export function editableSectionKeys(user: User | null | undefined): string[] | "all" {
  if (!user || user.status === "disabled") return [];
  return unionEditable(rolesFor(user).map((r) => editableSectionsForRoleMax(r)));
}

export function canEditSection(user: User | null | undefined, sectionKey: string): boolean {
  const editable = editableSectionKeys(user);
  return editable === "all" || editable.includes(sectionKey);
}

/**
 * Status-aware section edit check — the right call for "should the field
 * be disabled in this render?" (the plain version answers "could this role
 * ever edit this section, on any event?").
 */
export function canEditSectionOnEvent(
  user: User | null | undefined,
  sectionKey: string,
  event: { status: string } | null | undefined
): boolean {
  const editable = editableSectionKeysForEvent(user, event);
  return editable === "all" || editable.includes(sectionKey);
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  SALES_ADMIN: "Sales Admin",
  CCM_ADMIN: "CCM Admin",
  MANAGER: "Manager",
  FINANCE_LEAD: "Finance Lead",
  FINANCIAL_ADMIN: "Financial Admin",
  HR: "HR",
  VIEWER: "Viewer",
  ROSTER_ADMIN: "Roster Admin",
  INVENTORY_ADMIN: "Inventory Admin",
};
