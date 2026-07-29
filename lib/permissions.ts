import type { Permission, Role, User } from "./types";

/**
 * Role → permission matrix (spec §4).
 *
 * Super Admin bypasses this table entirely — see `can()`.
 * All other roles are permission-exact.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [], // bypass — see `can()`
  BROADCAST_ADMIN: [
    // Nabeng + Sales — full edit across all event form sections
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
  ],
  MANAGER: [
    // Restricted edit: General Info, Financial, Sign-off only
    "dashboard.view",
    "events.view",
    "events.edit",
    "events.publish",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
  ],
  FINANCIAL_ADMIN: [
    // Restricted edit: Financial section only
    "dashboard.view",
    "events.view",
    "events.edit",
    "budget.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
  ],
  HR: [
    // Read-only for staff / roster / meal / overtime — no edits
    "dashboard.view",
    "events.view",
    "calendar.view",
    "reports.view",
    "notifications.view",
  ],
  VIEWER: [
    "dashboard.view",
    "events.view",
    "calendar.view",
    "notifications.view",
  ],
};

export function isSuperAdmin(user: User | null | undefined): boolean {
  return !!user && user.role === "SUPER_ADMIN" && user.status === "active";
}
/** @deprecated Use isSuperAdmin. */
export const isITAdmin = isSuperAdmin;

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function can(user: User | null | undefined, perm: Permission): boolean {
  if (!user) return false;
  if (user.status === "disabled") return false;
  // Super Admin bypass — except sign-off (reserved for the 3 approvers)
  if (isSuperAdmin(user)) {
    if (perm === "events.signoff") return false;
    return true;
  }
  return ROLE_PERMISSIONS[user.role].includes(perm);
}

export function canAny(user: User | null | undefined, perms: Permission[]): boolean {
  return perms.some((p) => can(user, p));
}

export function canViewBudget(user: User | null | undefined): boolean {
  return can(user, "budget.view");
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

/** Persistent edit access — Broadcast Admin, Manager, Financial Admin, Super Admin. */
export function canEditEvent(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return ["BROADCAST_ADMIN", "MANAGER", "FINANCIAL_ADMIN"].includes(user.role);
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
 * Which display-section keys (s1..s8 in the form nav) a user is allowed to
 * edit. Returns "all" for unrestricted roles.
 *
 *   Super Admin / Broadcast Admin → all
 *   Manager                        → s1 (General Info), s5 (Financial), s8 (Sign-off)
 *   Financial Admin                → s5 (Financial) only
 *   Others                         → none
 */
export function editableSectionKeys(user: User | null | undefined): string[] | "all" {
  if (!user || user.status === "disabled") return [];
  if (isSuperAdmin(user)) return "all";
  if (user.role === "BROADCAST_ADMIN") return "all";
  if (user.role === "MANAGER") return ["s1", "s5", "s8"];
  if (user.role === "FINANCIAL_ADMIN") return ["s5"];
  return [];
}

export function canEditSection(user: User | null | undefined, sectionKey: string): boolean {
  const editable = editableSectionKeys(user);
  return editable === "all" || editable.includes(sectionKey);
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  BROADCAST_ADMIN: "Broadcast Admin",
  MANAGER: "Manager",
  FINANCIAL_ADMIN: "Financial Admin",
  HR: "HR",
  VIEWER: "Viewer",
};
