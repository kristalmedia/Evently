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
  ],
  HR: [
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

/** Persistent edit access — anyone who can edit at least one section on some event. */
export function canEditEvent(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return ["SALES_ADMIN", "CCM_ADMIN", "MANAGER", "FINANCE_LEAD"].includes(user.role);
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
 * Which display-section keys a user is allowed to edit ON A SPECIFIC EVENT.
 * The event.status matters because Manager Staff access and Finance Lead
 * Financial access both unlock only at specific stages of the workflow.
 * Callers that don't have an event in hand should use `editableSectionKeys`
 * (below) which returns the role's *maximum* possible edit surface.
 */
export function editableSectionKeysForEvent(
  user: User | null | undefined,
  event: { status: string } | null | undefined
): string[] | "all" {
  if (!user || user.status === "disabled") return [];
  if (isSuperAdmin(user)) return "all";

  switch (user.role) {
    case "SALES_ADMIN":
    case "CCM_ADMIN":
      // Staff (s4) and Financial (s5) are permanently hidden from Sales/CCM
      // — they never fill those, at any stage. Everything else is theirs.
      return [...NON_STAFF_NON_FINANCIAL];

    case "MANAGER": {
      // Always: General Info (s1) + Sign-off (s8). Staff (s4) only unlocks
      // after Jenny finalizes the event.
      const keys = ["s1", "s8"];
      if (event?.status === "STAFFING_IN_PROGRESS") keys.push("s4");
      return keys;
    }

    case "FINANCE_LEAD":
      // Putri — exclusive Financial editor, and only during the review stage.
      // Read-only at every other stage; enforced separately by canViewBudget.
      if (event?.status === "FINANCIAL_REVIEW") return ["s5"];
      return [];

    case "FINANCIAL_ADMIN":
    case "HR":
    case "VIEWER":
    default:
      return [];
  }
}

/**
 * Role's maximum possible edit surface, ignoring per-event status.
 * Used by the "new event" form (no event yet) and by anywhere that needs
 * to decide whether to show edit affordances at all.
 */
export function editableSectionKeys(user: User | null | undefined): string[] | "all" {
  if (!user || user.status === "disabled") return [];
  if (isSuperAdmin(user)) return "all";

  switch (user.role) {
    case "SALES_ADMIN":
    case "CCM_ADMIN":
      return [...NON_STAFF_NON_FINANCIAL];
    case "MANAGER":
      return ["s1", "s4", "s8"];
    case "FINANCE_LEAD":
      return ["s5"];
    default:
      return [];
  }
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
};
