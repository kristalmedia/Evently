// ─── Users & auth ──────────────────────────────────────────────────────────

/**
 * Roles are hierarchical + orthogonal. See lib/permissions.ts for the full
 * ROLE_PERMISSIONS matrix.
 *
 *   SUPER_ADMIN     — bypass (IT admins)
 *   SALES_ADMIN     — event creation + edits (formerly BROADCAST_ADMIN;
 *                     Staff + Financial sections hidden from their nav)
 *   CCM_ADMIN       — same access surface as SALES_ADMIN, different dept
 *   MANAGER         — Staff editor (unlocks per-event after Jenny finalizes)
 *   FINANCE_LEAD    — exclusive Financial editor (unlocks per-event after
 *                     Managers finish Staff); global read across all events
 *   FINANCIAL_ADMIN — Finance dept read + 2nd-approver duties (Rudy);
 *                     no longer holds Financial edit — that moved to
 *                     FINANCE_LEAD to make the "exclusive" grant real
 *   HR / VIEWER     — read-only tiers
 */
export type Role =
  | "SUPER_ADMIN"
  | "SALES_ADMIN"
  | "CCM_ADMIN"
  | "MANAGER"
  | "FINANCE_LEAD"
  | "FINANCIAL_ADMIN"
  | "HR"
  | "VIEWER";

export type Department =
  | "Sales"
  | "Finance"
  | "Technical"
  | "IT"
  | "CCM"
  | "HR"
  | "General Manager"
  /** Placeholder for accounts auto-provisioned via Microsoft Entra ID sign-in — a Super Admin should assign a real department. */
  | "Unassigned";

export type VerificationStatus = "INVITED" | "VERIFIED";

export interface User {
  id: string;
  fullName: string;
  email: string; // @kristal.media
  department: Department;
  jobTitle?: string;
  /**
   * Primary role — everyone has one. Drives the badge shown in the user
   * menu, the department dropdown default, and audit trail attribution.
   */
  role: Role;
  /**
   * Optional secondary role. When present, ALL permission checks union
   * the two roles' allowed permissions (see `can()` in permissions.ts):
   * whichever role is more permissive wins. Common use case: a Manager
   * who also acts as Sales Admin gets both surfaces.
   */
  secondaryRole?: Role;
  /**
   * ISO timestamp of when the user last acknowledged the onboarding
   * tutorial (either by dismissing it or by ticking "Don't show again").
   * Unset means they haven't seen it — the modal fires on next login.
   * Persisted server-side via the /api/users/me/onboarding endpoint so
   * the flag survives sign-outs and browser changes.
   */
  onboardingSeenAt?: string;
  status: "active" | "disabled";
  /** Onboarding pipeline — INVITED until they set a password via /auth/set-password */
  verificationStatus: VerificationStatus;
  invitationToken?: string;
  invitedAt?: string;
  verifiedAt?: string;
  /** In-memory demo — real deployment stores a hash of this */
  passwordHash?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface Session {
  user: User;
  issuedAt: string;
}

// ─── Permissions (RBAC) ────────────────────────────────────────────────────

export type Permission =
  | "dashboard.view"
  | "events.view"
  | "events.create"
  | "events.edit"
  | "events.delete"
  | "events.publish"
  | "events.archive"
  | "events.signoff"
  | "events.manage_categories"
  | "events.manage_venues"
  | "events.manage_settings"
  | "events.assign_access"
  | "budget.view"
  | "calendar.view"
  | "users.manage"
  | "roles.manage"
  | "system.settings"
  | "reports.view"
  | "notifications.view";

// ─── Event Concept (mirrors the KM-EVT-CONCEPT-v1 template) ────────────────

export type EventStatus =
  | "DRAFT"
  | "BUDGET_PENDING"          // With Putri (Finance Lead) — pre-approval budget gate
  | "PENDING_APPROVAL"        // With Rudy (2nd approver)
  | "PENDING_FINAL_APPROVAL"  // With Jenny (final approver)
  | "REVISION_REQUIRED"       // Denied by an approver, back to submitter
  | "APPROVED"
  | "STAFFING_IN_PROGRESS"    // Jenny finalized; Managers filling Staff (s4)
  | "FINANCIAL_REVIEW"        // Managers finished Staff; Finance Lead filling Financial (s5)
  | "PUBLISHED"               // Financial complete; broadcast to all users
  | "UPCOMING"
  | "ONGOING"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED";

export type EventPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type EventClassification = "COMMERCIAL" | "COMMUNITY_CSR";

export type VoiceOfGoodPillar =
  | "CAPACITY_BUILDING"
  | "CHAMPION_COMMUNITY"
  | "ECONOMIC_VITALITY"
  | "COMMUNITY_ENGAGEMENT"
  | "NA";

export type EventType =
  | "KOTG"
  | "INDOOR_REMOTE_BROADCAST"
  | "LIVE_EVENT"
  | "TALK_FORUM"
  | "COMPETITION"
  | "EXHIBITION"
  | "COMMUNITY_ACTIVATION"
  | "PRODUCT_LAUNCH"
  | "COLLABORATION"
  | "ROAD_SHOW"
  | "SCHOOL_INSTITUTION"
  | "OTHER";

// ─── Program flow ─────────────────────────────────────────────────────────
/**
 * One entry in the event's run-of-show. A flat list of timed rows sorted
 * by their time field client-side — no explicit ordering column, so
 * inserting a step at 14:30 into a 14:00 → 15:00 stretch just works.
 */
export interface ProgramFlowStep {
  id: string;
  /** HH:mm, 24-hour. */
  time: string;
  activity: string;
  /** Person or role responsible for this step (Emcee, DJ, Technical Lead, etc.). */
  owner: string;
  notes?: string;
}

// ─── Section 1: Identification ─────────────────────────────────────────────
export interface Section1_Identification {
  eventName: string;
  edition?: string;
  eventRefNo: string; // e.g. KM-EVT-2026-0007
  startDate: string;
  endDate: string;
  daysOfWeek?: string;
  setupAt?: string;
  breakdownAt?: string;
  venue: string;
  expectedDurationHours?: number;
  expectedAttendance?: number;
  conceptPreparedBy: string;
  conceptDate: string;
  targetSubmissionDate?: string;
  /**
   * Program flow / run-of-show for the event — a timed list of activities
   * with owners. Optional (not every event needs one) and empty by default.
   * See the "hidden until approval" gating in section-01-identification.tsx
   * for the visibility rule that surfaces this to all users only once the
   * event reaches an approved status.
   */
  programFlow?: ProgramFlowStep[];
}

// ─── Section 2: Nature ─────────────────────────────────────────────────────
export interface Section2_Nature {
  types: EventType[];
  typeOther?: string;
  classification: EventClassification;
  vogPillars?: VoiceOfGoodPillar[];
  // commercial-only
  clientName?: string;
  clientContact?: string;
  agreedFeeBND?: number;
  invoiceRef?: string;
  scopeOfServices?: string;
  /**
   * Merchandise sales tracking — off by default. When true, the inventory
   * fields below become the source of truth for "how much did we bring vs
   * how much walked out" post-event. Both counters are non-negative
   * integers; qtySoldOut > qtyToBring is a valid state (over-sold via
   * pre-orders or re-orders) and surfaced as a soft warning in the UI.
   */
  sellMerchandise?: boolean;
  merchandiseQtyToBring?: number;
  merchandiseQtySoldOut?: number;
  merchandiseNotes?: string;
}

// ─── Section 3: Concept & objectives ──────────────────────────────────────
export interface Section3_Concept {
  description: string;
  broadcastAngle?: string;
  objectives: string[]; // up to 5
  targetAudience: string;
  successMetrics: string;
  brandLink: string;
}

// ─── Section 4: Resources ──────────────────────────────────────────────────
export interface EquipmentLine {
  name: string;
  /**
   * How many units of this item are needed. Aligned with the form field
   * name (was `qty` — the form component has always used `quantity`, they
   * diverged silently for a while).
   */
  quantity: number;
  notes?: string;
  category: "OWNED" | "HIRED";
  /**
   * Whether the item is essential for the event to go ahead — the checkbox
   * next to the item's row. Kept optional so seed data / older records
   * without the field still validate as EquipmentLine.
   */
  required?: boolean;
}
export interface Section4_Resources {
  equipment: EquipmentLine[];
}

// ─── Section 5: Staff ──────────────────────────────────────────────────────
export interface RosterSlot {
  id: string;
  date: string;  // YYYY-MM-DD
  start: string; // HH:mm
  end: string;   // HH:mm
  allDay?: boolean;
  staffUserId?: string; // resolved from combobox
}
export interface StaffLine {
  role: string;
  count: number;
  ratePerHourBND?: number;
  assignedTo?: string;
  confirmed: boolean;
  notes?: string;
  category: "INTERNAL" | "EXTERNAL";
  rosterSlots?: RosterSlot[];
  /** When added via department checklist, records the source department key. */
  deptKey?: string;
}
export interface Section5_Staff {
  staff: StaffLine[];
}

// ─── Section 6: Budget ─────────────────────────────────────────────────────
export type CostGroup =
  | "OVERTIME"
  | "MEAL_ALLOWANCE"
  | "EQUIPMENT_LOGISTICS"
  | "PRODUCTION_MARKETING";
export interface CostLine {
  group: CostGroup;
  item: string;
  estimatedBND: number;
  actualBND?: number;
  notes?: string;
}
export interface Section6_Budget {
  costs: CostLine[];
  /** Auto-calculated from Section 5 rosters — read-only display value */
  autoOvertimeBND?: number;
  autoMealAllowanceBND?: number;
}

// ─── Section 7: Timeline ───────────────────────────────────────────────────
export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";
export type TimelinePhase =
  | "CONCEPT_APPROVAL"
  | "PRODUCTION_LOGISTICS"
  | "BROADCAST_CONTENT"
  | "EVENT_DAY"
  | "POST_EVENT";
export interface TimelineTask {
  phase: TimelinePhase;
  task: string;
  owner: string;
  dueDate?: string;
  status: TaskStatus;
}
export interface Section7_Timeline {
  tasks: TimelineTask[];
}

// ─── Section 8: Broadcast & content ────────────────────────────────────────
export interface BroadcastSlot {
  id: string;
  start: string; // HH:mm
  end: string;   // HH:mm
}
export interface BroadcastDay {
  date: string;  // YYYY-MM-DD
  slots: BroadcastSlot[];
}
export interface Section8_Broadcast {
  liveBroadcast: "YES" | "NO" | "TBC";
  platforms: string[];
  platformOther?: string;
  schedule: BroadcastDay[];
  onAirPresenter?: string;
  podcastRecording: boolean;
  socialPlatforms: string[];
  socialContentPlan?: string;
  hashtags: string[];
  postEventContentPlan?: string;
}

// ─── Section 9: Risk ───────────────────────────────────────────────────────
export type RiskLevel = "LOW" | "MED" | "HIGH";
export interface RiskLine {
  risk: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  contingency: string;
}
export interface Section9_Risk {
  risks: RiskLine[];
}

// ─── Section 10: Debrief ───────────────────────────────────────────────────
export interface Section10_Debrief {
  actualAttendance?: number;
  broadcastReach?: number;
  socialReach?: number;
  socialImpressions?: number;
  whatWentWell?: string;
  improvements?: string;
  recommendations?: string;
  clientFeedback?: string;
  overallRating?: 1 | 2 | 3 | 4 | 5;
  debriefCompletedBy?: string;
  debriefDate?: string;
  submittedToGM?: boolean;
}

// ─── Section 11: Sign-off ──────────────────────────────────────────────────
export type ApproverRole = "FIRST_APPROVER" | "SECOND_APPROVER" | "FINAL_APPROVER";
export interface SignOffEntry {
  name: string;
  signedAt?: string;
  role: ApproverRole;
}
export interface Section11_SignOff {
  entries: SignOffEntry[];
  /** Present when an approval was denied — carries the reason. */
  denialReason?: string;
  deniedBy?: string;
  deniedAt?: string;
}

// ─── The unified event concept ─────────────────────────────────────────────
export interface EventConcept {
  id: string;
  status: EventStatus;
  priority: EventPriority;
  category?: string;
  createdBy: string; // user id
  createdAt: string;
  updatedAt: string;
  s1: Section1_Identification;
  s2: Section2_Nature;
  s3: Section3_Concept;
  s4: Section4_Resources;
  s5: Section5_Staff;
  s6: Section6_Budget;
  s7: Section7_Timeline;
  s8: Section8_Broadcast;
  s9: Section9_Risk;
  s10: Section10_Debrief;
  s11: Section11_SignOff;
}

// A compact "row" projection for lists / dashboards
export interface EventListRow {
  id: string;
  title: string;
  refNo: string;
  category?: string;
  venue: string;
  organizer: string;
  startDate: string;
  endDate: string;
  status: EventStatus;
  priority: EventPriority;
  isLive?: boolean;
}

// ─── Reference data ────────────────────────────────────────────────────────
export interface EventCategory {
  id: string;
  name: string;
  color: string;
}

export interface EventVenue {
  id: string;
  name: string;
  address?: string;
  capacity?: number;
}

// ─── Notifications ─────────────────────────────────────────────────────────
export type NotificationKind =
  | "EVENT_CREATED"
  | "EVENT_UPDATED"
  | "EVENT_CANCELLED"
  | "EVENT_PUBLISHED"      // Broadcast when Jenny final-approves
  | "APPROVAL_REQUEST"
  | "APPROVAL_GRANTED"
  | "APPROVAL_DENIED"
  | "REMINDER"
  | "TODAY";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  eventId?: string;
  createdAt: string;
  readAt?: string;
  recipientUserId: string;
  approverStage?: ApproverRole;
  denialReason?: string;
  actedOn?: boolean;
  /** Set once a real-time toast has already fired for this notification. */
  toastShown?: boolean;
}

// ─── Audit log ─────────────────────────────────────────────────────────────
export type AuditKind =
  | "EVENT_CREATED"
  | "EVENT_EDITED"
  | "DRAFT_SAVED"
  | "EVENT_CANCELLED"
  | "EVENT_ARCHIVED"
  | "EVENT_DELETED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_DENIED"
  | "STATUS_CHANGED"
  | "USER_UPDATED"
  | "USER_INVITED"
  | "ATTACHMENT_UPLOADED"
  | "ATTACHMENT_DOWNLOADED"
  | "ATTACHMENT_DELETED";

export interface AuditEntry {
  id: string;
  kind: AuditKind;
  actorUserId: string;
  actorEmail: string;
  actorName: string;
  eventId?: string;
  eventRefNo?: string;
  targetUserId?: string;
  details?: string;
  createdAt: string;
}
