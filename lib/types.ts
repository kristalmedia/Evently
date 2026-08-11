// ─── Users & auth ──────────────────────────────────────────────────────────

export type Role =
  | "SUPER_ADMIN"
  | "BROADCAST_ADMIN"
  | "MANAGER"
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
  role: Role;
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
  | "PENDING_APPROVAL"        // With Rudy (2nd approver)
  | "PENDING_FINAL_APPROVAL"  // With Jenny (final approver)
  | "REVISION_REQUIRED"       // Denied by an approver, back to submitter
  | "APPROVED"
  | "PUBLISHED"               // Finally approved
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
  qty: number;
  notes?: string;
  category: "OWNED" | "HIRED";
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
  | "USER_INVITED";

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
