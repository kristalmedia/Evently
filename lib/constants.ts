import type {
  EventCategory,
  EventPriority,
  EventStatus,
  EventType,
  TimelinePhase,
  VoiceOfGoodPillar,
} from "./types";

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "KOTG", label: "KOTG — Kristal On The Go" },
  { value: "INDOOR_REMOTE_BROADCAST", label: "Indoor Remote Broadcast" },
  { value: "LIVE_EVENT", label: "Live Event / Concert / Show" },
  { value: "TALK_FORUM", label: "Talk / Forum / Panel / Conference" },
  { value: "COMPETITION", label: "Competition / Tournament" },
  { value: "EXHIBITION", label: "Exhibition / Showcase" },
  { value: "COMMUNITY_ACTIVATION", label: "Community Activation" },
  { value: "PRODUCT_LAUNCH", label: "Product / Service Launch" },
  { value: "COLLABORATION", label: "Collaboration / Partnership Event" },
  { value: "ROAD_SHOW", label: "Road Show" },
  { value: "SCHOOL_INSTITUTION", label: "School / Institution Event" },
  { value: "OTHER", label: "Other" },
];

export const VOG_PILLARS: { value: VoiceOfGoodPillar; label: string; icon: string }[] = [
  { value: "CAPACITY_BUILDING", label: "Capacity Building", icon: "🏫" },
  { value: "CHAMPION_COMMUNITY", label: "Champion the Community", icon: "🏆" },
  { value: "ECONOMIC_VITALITY", label: "Economic Vitality", icon: "💹" },
  { value: "COMMUNITY_ENGAGEMENT", label: "Community Engagement & Building", icon: "🤝" },
  { value: "NA", label: "N/A — Commercial", icon: "—" },
];

export const EVENT_STATUSES: { value: EventStatus; label: string; tone: string }[] = [
  { value: "DRAFT", label: "Draft", tone: "muted" },
  { value: "BUDGET_PENDING", label: "Pending Budget Approval", tone: "amber" },
  { value: "PENDING_APPROVAL", label: "Pending 2nd Approval", tone: "amber" },
  { value: "PENDING_FINAL_APPROVAL", label: "Pending Final Approval", tone: "amber" },
  { value: "REVISION_REQUIRED", label: "Revision Required", tone: "rose" },
  { value: "APPROVED", label: "Approved", tone: "signal" },
  { value: "STAFFING_IN_PROGRESS", label: "Staffing in Progress", tone: "signal" },
  // FINANCIAL_REVIEW is legacy — no code path produces it now. Kept
  // in the taxonomy so any stale record surfaces with a sensible label.
  { value: "FINANCIAL_REVIEW", label: "Financial Review (legacy)", tone: "amber" },
  { value: "PUBLISHED", label: "Confirmed Event", tone: "emerald" },
  { value: "UPCOMING", label: "Upcoming", tone: "signal" },
  { value: "ONGOING", label: "Ongoing", tone: "onair" },
  { value: "COMPLETED", label: "Completed", tone: "emerald" },
  { value: "CANCELLED", label: "Cancelled", tone: "rose" },
  { value: "ARCHIVED", label: "Archived", tone: "muted" },
];

export const EVENT_PRIORITIES: { value: EventPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

/**
 * Kristal event category taxonomy — 7 fixed options. The `name` value is
 * both the display label AND the value stored on `EventConcept.category`,
 * so any rename must be paired with a data migration.
 *
 * The `color` is the calendar swatch (see components/events/events-calendar.tsx).
 */
export const DEFAULT_CATEGORIES: EventCategory[] = [
  { id: "cat_kotg_indoor", name: "kotg - indoor", color: "#FF5733" },
  { id: "cat_kotg_outdoor", name: "kotg - outdoor", color: "#33FF57" },
  { id: "cat_live_announcement", name: "live announcement", color: "#3357FF" },
  { id: "cat_panel", name: "panel", color: "#F333FF" },
  { id: "cat_social_media", name: "social media", color: "#FF33F3" },
  { id: "cat_radio", name: "radio", color: "#F3FF33" },
  { id: "cat_website", name: "website", color: "#33FFF3" },
];

/**
 * Fast lookup from category name → hex color. Used by the calendar to
 * colour events without importing the whole DEFAULT_CATEGORIES list.
 */
export const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.name, c.color])
);

/** Fallback swatch when an event has no category assigned. */
export const CATEGORY_COLOR_UNSET = "#94a3b8";

/**
 * Kristal-owned broadcast/production kit — Section 4 checklist prefill.
 */
export const OWNED_EQUIPMENT_TEMPLATE = [
  "Trailer / Mobile Broadcast Unit",
  "Indoor Remote Broadcast Setup",
  "Outdoor LED Screen / Display",
  "PA System / Sound Equipment",
  "Mixing Console / Audio Board",
  "Microphones (handheld / lapel / stand)",
  "Lighting Rig / Stage Lights",
  "Generator / Power Supply",
  "Broadcast Camera(s)",
  "Livestream / Encoding Equipment",
  "Branding / Backdrop / Banners",
  "Gazebo / Tent / Canopy",
  "Tables & Chairs",
  "Extension Cables / Cable Management",
];

export const HIRED_EQUIPMENT_TEMPLATE = [
  "Stage / Stage Structure",
  "Additional PA / Sound System",
  "Transportation / Lorry for Equipment",
  "Barriers / Crowd Control",
  "Portable Toilets / Facilities",
];

export const INTERNAL_STAFF_TEMPLATE = [
  "Event Lead / Project Manager",
  "On-Air DJ / Presenter",
  "Emcee / Host",
  "Technical Lead",
  "Technical Crew — Setup",
  "Technical Crew — Live Event",
  "Technical Crew — Breakdown",
  "Broadcast Operator",
  "Social Media / Digital Content",
  "Sales / Client Liaison",
  "Administrative / Logistics Support",
];

export const EXTERNAL_STAFF_TEMPLATE = [
  "External Emcee",
  "Performers / Talent(s)",
  "Photographer",
  "Videographer",
  "Security",
  "Volunteers",
];

export const COST_TEMPLATE: { group: string; item: string }[] = [
  { group: "OVERTIME", item: "Overtime (OT) — Technical Staff" },
  { group: "OVERTIME", item: "Overtime (OT) — Broadcast Staff" },
  { group: "OVERTIME", item: "Overtime (OT) — Admin / Other" },
  { group: "OVERTIME", item: "Time Off In Lieu (TOIL) liability" },
  { group: "OVERTIME", item: "External Emcee / Host fee" },
  { group: "OVERTIME", item: "Performer / Talent fees" },
  { group: "OVERTIME", item: "Freelancer / Contractor fees" },
  { group: "OVERTIME", item: "Transportation — Staff" },
  { group: "OVERTIME", item: "Accommodation (if applicable)" },
  { group: "MEAL_ALLOWANCE", item: "Meal Allowance — Setup Crew" },
  { group: "MEAL_ALLOWANCE", item: "Meal Allowance — Event Day Staff" },
  { group: "EQUIPMENT_LOGISTICS", item: "Equipment hire / rental" },
  { group: "EQUIPMENT_LOGISTICS", item: "Transportation — Equipment / Trailer" },
  { group: "EQUIPMENT_LOGISTICS", item: "Generator / Power costs" },
  { group: "EQUIPMENT_LOGISTICS", item: "Stage / Tent / Structure hire" },
  { group: "EQUIPMENT_LOGISTICS", item: "Venue hire / site fee" },
  { group: "EQUIPMENT_LOGISTICS", item: "Permits / Licences" },
  { group: "EQUIPMENT_LOGISTICS", item: "Security (external)" },
  { group: "PRODUCTION_MARKETING", item: "Printing — banners / collateral / programmes" },
  { group: "PRODUCTION_MARKETING", item: "Branding / Signage production" },
  { group: "PRODUCTION_MARKETING", item: "Photography / Videography (external)" },
  { group: "PRODUCTION_MARKETING", item: "Social media promotion / boosts" },
  { group: "PRODUCTION_MARKETING", item: "Gifts / Prizes / Giveaways" },
  { group: "PRODUCTION_MARKETING", item: "Catering — event / VIP" },
  { group: "PRODUCTION_MARKETING", item: "Miscellaneous / contingency (5–10%)" },
];

export const TIMELINE_TEMPLATE: { phase: TimelinePhase; task: string; owner: string }[] = [
  { phase: "CONCEPT_APPROVAL", task: "Event concept brief completed", owner: "Event Lead" },
  { phase: "CONCEPT_APPROVAL", task: "Budget estimated and submitted", owner: "Event Lead" },
  { phase: "CONCEPT_APPROVAL", task: "GM approval of concept and budget", owner: "GM" },
  { phase: "CONCEPT_APPROVAL", task: "Client / partner confirmed (commercial)", owner: "Sales" },
  { phase: "CONCEPT_APPROVAL", task: "Venue confirmed and booked", owner: "Event Lead" },
  { phase: "CONCEPT_APPROVAL", task: "Permits / licences applied for", owner: "HR / Admin" },
  { phase: "PRODUCTION_LOGISTICS", task: "Equipment checklist completed", owner: "Technical Lead" },
  { phase: "PRODUCTION_LOGISTICS", task: "Trailer / broadcast setup booked", owner: "Technical Lead" },
  { phase: "PRODUCTION_LOGISTICS", task: "Staff roster confirmed", owner: "HR / Event Lead" },
  { phase: "PRODUCTION_LOGISTICS", task: "OT / TOIL pre-approval obtained", owner: "HR" },
  { phase: "PRODUCTION_LOGISTICS", task: "Freelancers / talents confirmed", owner: "Event Lead" },
  { phase: "PRODUCTION_LOGISTICS", task: "Transportation arranged (staff + equipment)", owner: "Admin" },
  { phase: "PRODUCTION_LOGISTICS", task: "Runsheet / script drafted", owner: "Emcee / Producer" },
  { phase: "PRODUCTION_LOGISTICS", task: "Social media plan approved", owner: "Content Team" },
  { phase: "PRODUCTION_LOGISTICS", task: "Branding / collateral production complete", owner: "Content Team" },
  { phase: "PRODUCTION_LOGISTICS", task: "Sponsor / partner assets received", owner: "Sales" },
  { phase: "BROADCAST_CONTENT", task: "Broadcast schedule confirmed", owner: "Broadcast / Technical" },
  { phase: "BROADCAST_CONTENT", task: "Signal / connection test completed", owner: "Technical Lead" },
  { phase: "BROADCAST_CONTENT", task: "Jingle / promo produced and scheduled", owner: "Content Team" },
  { phase: "BROADCAST_CONTENT", task: "Social media go-live posts scheduled", owner: "Content Team" },
  { phase: "EVENT_DAY", task: "Setup / soundcheck complete", owner: "Technical Lead" },
  { phase: "EVENT_DAY", task: "Broadcast test / signal check done", owner: "Broadcast Op" },
  { phase: "EVENT_DAY", task: "All staff briefed and in position", owner: "Event Lead" },
  { phase: "EVENT_DAY", task: "Client / partner briefed on-site", owner: "Sales" },
  { phase: "EVENT_DAY", task: "Photography / video in place", owner: "Content Team" },
  { phase: "POST_EVENT", task: "Breakdown and equipment return complete", owner: "Technical Lead" },
  { phase: "POST_EVENT", task: "Equipment condition report filed", owner: "Technical Lead" },
  { phase: "POST_EVENT", task: "OT / TOIL records submitted to HR", owner: "Event Lead" },
  { phase: "POST_EVENT", task: "Actual costs submitted to Finance", owner: "Event Lead" },
  { phase: "POST_EVENT", task: "Invoice issued to client (commercial)", owner: "Finance" },
  { phase: "POST_EVENT", task: "Post-event content posted (social media)", owner: "Content Team" },
  { phase: "POST_EVENT", task: "Photos / footage archived", owner: "Content Team" },
  { phase: "POST_EVENT", task: "Post-event debrief conducted", owner: "Event Lead" },
  { phase: "POST_EVENT", task: "Debrief report submitted to GM", owner: "Event Lead" },
];

export const TIMELINE_PHASE_LABEL: Record<TimelinePhase, string> = {
  CONCEPT_APPROVAL: "Concept & Approval",
  PRODUCTION_LOGISTICS: "Production & Logistics",
  BROADCAST_CONTENT: "Broadcast & Content",
  EVENT_DAY: "Event Day",
  POST_EVENT: "Post-Event",
};

export const RISK_TEMPLATE = [
  "Weather / outdoor conditions",
  "Technical failure (broadcast / sound / power)",
  "Key staff unavailable on the day",
  "Client / partner cancellation",
  "Low attendance / turnout",
  "Budget overrun",
  "Permit / approval delay",
];

// ─── Section 8 — Broadcast platform choices (spec §3.8) ────────────────────
// "Mobile Livestream" was intentionally removed — any legacy event records
// that already stored this value keep it in the DB but the option no longer
// appears in the picker for new selections.
export const BROADCAST_PLATFORMS = [
  "Web Livestream",
  "FM Radio",
  "Instagram",
  "TikTok",
];

// ─── Section 9 — Predefined risk categories (spec §3.9) ────────────────────
export const RISK_CATEGORIES = [
  "Weather / Outdoor conditions",
  "Technical failure (Broadcast / Sound / Power)",
  "Key staff unavailable on the day",
  "Client / Partner cancellation",
  "Low attendance / Turnout",
  "Budget overrun",
  "Permit / Approval delay",
];

// ─── Section 7 — Concept & Approval predefined checklist (spec §3.7) ───────
export const CONCEPT_APPROVAL_CHECKLIST = [
  "Event concept brief completed",
  "Budget estimated and submitted",
  "GM approval of concept and budget",
  "Client / partner confirmed (commercial)",
  "Venue confirmed and booked",
  "Permits / licences applied for",
];

// ─── Section 11 — Designated approvers (spec §1) ───────────────────────────
export const APPROVER_EMAILS = {
  FIRST_APPROVER: "nabil.mahrub@kristal.media",       // Nabeng
  SECOND_APPROVER: "khairuddin.rosli@kristal.media",  // Rudy
  FINAL_APPROVER: "jenny.malaiali@kristal.media",     // Jenny
} as const;

export const APPROVER_LABEL: Record<
  "FIRST_APPROVER" | "SECOND_APPROVER" | "FINAL_APPROVER",
  { title: string; who: string }
> = {
  FIRST_APPROVER: { title: "First Approver", who: "Nabeng" },
  SECOND_APPROVER: { title: "Second Approver — Finance", who: "Rudy" },
  FINAL_APPROVER: { title: "Final Approver — GM", who: "Jenny" },
};

/** Ordered sequence for the sequential approval workflow. */
export const APPROVER_SEQUENCE: ("FIRST_APPROVER" | "SECOND_APPROVER" | "FINAL_APPROVER")[] = [
  "FIRST_APPROVER",
  "SECOND_APPROVER",
  "FINAL_APPROVER",
];

// ─── Section 4 — 7-department roster checklists (spec §6B) ─────────────────
export const DEPT_ROSTER: { key: string; label: string; members: string[] }[] = [
  { key: "HR", label: "HR", members: ["Putri"] },
  { key: "IT", label: "IT", members: ["Zaki", "Rashid", "Haziq"] },
  { key: "SALES", label: "Sales", members: ["Wafi", "Nabil", "Didi", "Hazwan", "Nabeng"] },
  { key: "CCM", label: "CCM", members: ["Dinny", "Fecks", "Hafiz", "Faiq", "Fadhil", "Azim", "Yaya"] },
  { key: "TECH", label: "Technical", members: ["Raf", "Eddy", "Shaming", "Hj Zikri", "Aiman", "Qawi", "Izz", "Faris"] },
  { key: "FINANCE", label: "Finance", members: ["Rudy", "Choon Ling", "Suriati", "Jariyah"] },
  { key: "DJ", label: "DJ", members: [
    "Indra", "Daffy", "Dean", "Nadzri", "Yaya", "Yante", "Monica", "Nazz",
    "Hilmi", "Nad", "Hai", "Ayu", "Fierah", "Zureen", "Razi", "Izan",
  ]},
];

/**
 * Unique reference key generator — spec format: `EVENTLY-EVT-####`.
 * The number is always 4-digit zero-padded. Uniqueness is enforced by the
 * `nextSequentialRefKey` helper in the store which scans existing events.
 */
export function generateReferenceKey(seed?: number): string {
  const num = String(seed ?? Math.floor(Math.random() * 9000) + 1000).padStart(4, "0");
  return `EVENTLY-EVT-${num}`;
}
