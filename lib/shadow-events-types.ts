import type {
  ProgramFlowStep,
  RosterSlot,
  StaffLine,
} from "./types";

/**
 * Evently "shadow event" — the Evently-only fields layered on top of a Sheet
 * booking. The Sheet (ServiceBookings + Clients + CustomPackages) is the
 * source of truth for the booking itself (dates, client, price, location,
 * status). This shadow record holds everything Evently adds on top:
 * per-department rosters, HR overtime/meals, other financial lines,
 * program flow, and the Evently-internal workflow position.
 *
 * Keyed by BookingID from the Sheet (see lib/google-sheets-types.ts) —
 * that's the join field. A booking is only a shadow record's identity;
 * a shadow record cannot exist without a matching Sheet row (garbage-
 * collected if the Sheet row is later removed).
 */

/** Evently-side workflow position for one booking's shadow record.
 *  Separate from the Sheet's own `Status` column (which is the Sales team's
 *  booking-lifecycle status: Pending / Active / Completed / Cancelled). */
export type ShadowEventEventlyStatus =
  /** Booking is Active in the Sheet, everyone has been notified, and
   *  Managers can start filling their department's rosters. */
  | "ACTIVE"
  /** At least one department has flagged its part complete, but not all. */
  | "MANAGERS_IN_PROGRESS"
  /** Every Manager-department has flagged its part complete. HR now has
   *  full roster read access and can fill OT + meal allowance. */
  | "HR_UNLOCKED"
  /** HR has flagged their part complete. Putri (Finance Lead) now fills
   *  the remaining Financial (equipment, production, marketing). */
  | "FINANCE_UNLOCKED"
  /** All parties done. Event is fully published to everyone. */
  | "PUBLISHED";

/** Overtime row — one per shift HR wants to compensate. Restricted to
 *  IT and Technical staff (business rule). staffName + staffDept are
 *  captured at edit time so a later user rename / dept change doesn't
 *  retroactively rewrite the receipt. */
export interface OvertimeLine {
  id: string;
  /** User.id from the directory; may be blank for a legacy free-text
   *  entry, in which case staffName is the display value. */
  staffUserId: string;
  staffName: string;
  /** Must be "IT" or "Technical" — validated server-side too. */
  staffDept: string;
  amountBND: number;
  notes?: string;
  /** Optional: the roster slot that motivates the OT. Not required —
   *  HR may know from context; leaving it null keeps the OT row valid. */
  slotId?: string;
}

/** Per-slot meal-allowance ticks. HR flips AM / PM per roster shift;
 *  each flag is worth BND 5, so a both-halves shift = BND 10.
 *
 *  Stored as a keyed record rather than embedded on the RosterSlot so:
 *   - HR's tick pass is isolated from the Manager's roster edit,
 *   - a slot's deletion doesn't accidentally take a tick with it (the
 *     stale entries are harmless and get GC'd by mealAllowanceTotal
 *     since sums iterate the current slot list). */
export type MealTickMap = Record<string, { am: boolean; pm: boolean }>;

/** Non-HR financial line owned by the Finance Lead (Putri). Kept as a
 *  simple flat list rather than reusing lib/types.ts CostGroup so the
 *  OT + MEAL_ALLOWANCE groups can be explicitly disallowed here. */
export interface FinanceFinancialLine {
  id: string;
  group: "EQUIPMENT_LOGISTICS" | "PRODUCTION_MARKETING";
  item: string;
  estimatedBND: number;
  actualBND?: number;
  notes?: string;
}

/** Explicit publish state for a department's roster block.
 *  "DRAFT" — the Manager can freely save progress; nothing has gone out
 *  to assigned staff and the overall Evently workflow doesn't advance.
 *  "PUBLISHED" — the block was submitted (`completed: true`); kept as a
 *  distinct field (rather than only inferring it from `completed`) so
 *  the publish state is explicit in the schema, not just a side-effect
 *  of a boolean's name. The two fields are always written together —
 *  see setDeptRoster in lib/shadow-events.ts, the sole write path. */
export type DeptRosterStatus = "DRAFT" | "PUBLISHED";

/** Per-department roster block. Each department fills their own; other
 *  departments only see it read-only (HR sees all once HR_UNLOCKED). */
export interface DeptRoster {
  /** Explicit draft/published state — see DeptRosterStatus. */
  status: DeptRosterStatus;
  /** Whether the Manager for this department has flagged their part
   *  complete. Advances the Evently workflow when the last dept flips
   *  true. Equivalent to `status === "PUBLISHED"` — kept alongside it
   *  since the workflow-advancement logic in lib/shadow-events.ts reads
   *  this boolean specifically. */
  completed: boolean;
  completedAt?: string;
  completedByUserId?: string;
  slots: RosterSlot[];
  /** Free-form staff-lines the department manager wants to record
   *  (roles, counts, rates, notes) — mirror of Section 5's StaffLine shape
   *  scoped to this dept only. */
  staff: StaffLine[];
}

/** Standard DEPT_ROSTER keys the Managers can hold rosters for.
 *  Mirror of `visibleRosterDeptKeys` returns in lib/permissions.ts,
 *  minus the DJ pool (which is shared, not owned by a department). */
export type ShadowDeptKey =
  | "SALES"
  | "FINANCE"
  | "TECH"
  | "IT"
  | "CCM"
  | "HR";

export interface ShadowEventRecord {
  bookingId: string;
  eventlyStatus: ShadowEventEventlyStatus;
  /** ISO timestamp of when the "booking is now Active — all-hands notify"
   *  fan-out fired. Set once, never cleared — used to avoid double-firing
   *  the notification when the Sheet is refetched. */
  activeNotifiedAt?: string;
  /** ISO timestamp of when the "event confirmed — all-hands notify"
   *  fan-out fired. Set once, on the first visit AFTER eventlyStatus reaches
   *  PUBLISHED — the reconciliation loop retries every page load until
   *  the flag is set, so a Sheet outage or SMTP failure at HR-complete
   *  time doesn't permanently swallow the announcement. */
  confirmedNotifiedAt?: string;
  /** Per-department roster records. A key missing here means "not yet
   *  started" — treated the same as `completed: false` with empty slots. */
  rosterByDept: Partial<Record<ShadowDeptKey, DeptRoster>>;
  /** HR-owned block after the meal-tick / OT-rules rework:
   *
   *   - `mealTicks` — HR's per-slot AM/PM checkboxes. The meal-allowance
   *     total is derived, not stored: BND 5 per ticked half.
   *   - `overtime` — HR-added OT rows for IT/Technical shifts only. Amount
   *     is HR-typed (not auto-computed) since OT rate varies by seniority. */
  hr: {
    completed: boolean;
    completedAt?: string;
    completedByUserId?: string;
    mealTicks: MealTickMap;
    overtime: OvertimeLine[];
  };
  /** Finance Lead-owned block: remaining Financial (equipment / prod /
   *  marketing), plus completion flag. */
  finance: {
    completed: boolean;
    completedAt?: string;
    completedByUserId?: string;
    lines: FinanceFinancialLine[];
  };
  /** Evently-side program flow (run-of-show). Same shape as the domain type
   *  in lib/types.ts. Editable by Managers during ACTIVE / MANAGERS_
   *  IN_PROGRESS. */
  programFlow: ProgramFlowStep[];
  /** Free-form notes any editor can append to the shadow record. Rarely
   *  used but a handy escape hatch — Sheet's Notes column is Sales-only. */
  notes?: string;
  /** Sales-owned "does this booking need authority approval" block.
   *  Absent/undefined means "not set yet" and is treated the same as
   *  `{ required: false, bodies: [] }` on read. Editable only by
   *  SALES_ADMIN role holders — enforced server-side in
   *  /api/kotg/[bookingId]/authority-approval. */
  authorityApproval?: AuthorityApproval;
  /** Sales-owned optional games selection. Absent/undefined means
   *  nothing's been saved and the section is hidden from non-Sales
   *  viewers. See GamesSelection type and
   *  /api/kotg/[bookingId]/games. */
  games?: GamesSelection;
  createdAt: string;
  updatedAt: string;
}

// ─── Authority Approval (Sales-owned, per-booking) ──────────────────────────

/** One uploaded-document reference tied to an authority body. The app's
 *  storage layer is in-memory with no file persistence, so this stores
 *  METADATA ONLY — filename, size, who uploaded it, when. The actual
 *  file bytes never reach the server; the client-side file picker reads
 *  File.name + File.size and that's all we record. A viewer can see
 *  "foo.pdf (2.1 MB) uploaded by Alice on Oct 16" but cannot re-download
 *  the file through Evently — the file itself lives wherever Sales keeps
 *  it (email, SharePoint, hand-off). This is deliberate given the
 *  current infra; swapping in real storage is a separate piece of work. */
export interface AuthorityDocumentRef {
  id: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByUserId: string;
}

/** One row in the "Authority Body" repeating group. Order is preserved;
 *  the UI numbers them "Authority body 1", "Authority body 2", ... in
 *  array order. */
export interface AuthorityBody {
  id: string;
  name: string;
  documents: AuthorityDocumentRef[];
}

/** The Sales-owned authority-approval block on one booking. */
export interface AuthorityApproval {
  /** The toggle value — "Require me authoritative approval?" No / Yes.
   *  When false the bodies list is ignored entirely (and the UI hides
   *  the dynamic fields); kept rather than discarded so a Sales user
   *  can flip No→Yes→No without losing their work in a single session. */
  required: boolean;
  bodies: AuthorityBody[];
  updatedAt?: string;
  updatedByUserId?: string;
}

/** The "nothing set yet" default returned by callers that want a shape
 *  rather than a maybe-undefined. The shadow store only writes the field
 *  on first save, so this empty value shows for every booking that
 *  hasn't been touched. */
export const EMPTY_AUTHORITY_APPROVAL: AuthorityApproval = {
  required: false,
  bodies: [],
};

// ─── Optional Games Selection (Sales-owned, per-booking) ────────────────────

/** The canonical list of games Sales can pick from. Hardcoded rather than
 *  user-managed because the business list is small, stable, and the whole
 *  catalog belongs in version control (so a Super Admin adding "Spin the
 *  Wheel 2" wouldn't produce a scoreable catalog that varies per
 *  environment). If the Sales team want to extend this, add an entry here
 *  and ship a new build. */
export const AVAILABLE_GAMES = [
  "Jenga",
  "Ketupat Toss",
  "Spin the Wheel",
  "Drop the Mic",
  "Proboscis Monkey",
  "Guess the Kueh",
  "Guess the Kampong",
] as const;

export type GameName = (typeof AVAILABLE_GAMES)[number];

/** Sales-owned "which optional games are planned for this booking" block.
 *  Entirely optional — a booking can be saved without any games. Writes
 *  go through PUT /api/kotg/[bookingId]/games (SALES_ADMIN only); DELETE
 *  on the same route clears the whole selection. */
export interface GamesSelection {
  /** Subset of AVAILABLE_GAMES. Order isn't meaningful — the server
   *  normalises to the AVAILABLE_GAMES order on save so round-tripping
   *  through the UI doesn't shuffle the display. */
  selectedGames: GameName[];
  updatedAt?: string;
  updatedByUserId?: string;
}

export const EMPTY_GAMES_SELECTION: GamesSelection = {
  selectedGames: [],
};
