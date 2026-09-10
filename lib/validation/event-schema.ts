import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

// ─── Section 1 ────────────────────────────────────────────────────────────
export const section1Schema = z.object({
  eventName: z.string().min(2, "Give the event a name."),
  edition: z.string().optional(),
  eventRefNo: z.string().min(3, "Reference number required."),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  daysOfWeek: z.string().optional(),
  setupAt: z.string().optional(),
  breakdownAt: z.string().optional(),
  venue: z.string().min(2, "Venue required."),
  expectedDurationHours: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
  expectedAttendance: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional()),
  conceptPreparedBy: z.string().min(2, "Preparer name required."),
  conceptDate: z.string().min(1, "Event date required."),
  targetSubmissionDate: z.string().optional(),
});

// ─── Section 2 ────────────────────────────────────────────────────────────
export const section2Schema = z
  .object({
    types: z.array(z.string()).min(1, "Pick at least one event type."),
    typeOther: z.string().optional(),
    classification: z.enum(["COMMERCIAL", "COMMUNITY_CSR"]),
    vogPillars: z.array(z.string()).optional(),
    clientName: z.string().optional(),
    clientContact: z.string().optional(),
    agreedFeeBND: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
    invoiceRef: z.string().optional(),
    scopeOfServices: z.string().optional(),
  })
  .refine(
    (v) =>
      v.classification !== "COMMERCIAL" || (v.clientName && v.clientName.length >= 2),
    { path: ["clientName"], message: "Commercial events need a client name." }
  );

// ─── Section 3 ────────────────────────────────────────────────────────────
// Legacy — form no longer surfaces these; kept optional for existing seed data.
export const section3Schema = z.object({
  description: z.string().optional(),
  broadcastAngle: z.string().optional(),
  objectives: z.array(z.string()).max(5).default([]),
  targetAudience: z.string().optional(),
  successMetrics: z.string().optional(),
  brandLink: z.string().optional(),
});

// ─── Section 4 ────────────────────────────────────────────────────────────
export const equipmentLineSchema = z.object({
  name: z.string().min(1),
  qty: z.coerce.number().int().min(0).default(0),
  notes: z.string().optional(),
  category: z.enum(["OWNED", "HIRED"]),
});
export const section4Schema = z.object({
  equipment: z.array(equipmentLineSchema).default([]),
});

// ─── Section 5 ────────────────────────────────────────────────────────────
export const rosterSlotSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  start: z.string().regex(/^\d{1,2}:\d{2}$/, "HH:mm"),
  end: z.string().regex(/^\d{1,2}:\d{2}$/, "HH:mm"),
  allDay: z.boolean().optional(),
  staffUserId: z.string().optional(),
});
export const staffLineSchema = z.object({
  role: z.string().min(1),
  count: z.coerce.number().int().min(0).default(0),
  ratePerHourBND: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
  assignedTo: z.string().optional(),
  confirmed: z.boolean().default(false),
  notes: z.string().optional(),
  category: z.enum(["INTERNAL", "EXTERNAL"]),
  rosterSlots: z.array(rosterSlotSchema).default([]),
});
export const section5Schema = z.object({
  staff: z.array(staffLineSchema).default([]),
});

// ─── Section 6 ────────────────────────────────────────────────────────────
export const costLineSchema = z.object({
  group: z.enum(["OVERTIME", "MEAL_ALLOWANCE", "EQUIPMENT_LOGISTICS", "PRODUCTION_MARKETING"]),
  item: z.string().min(1),
  estimatedBND: z.coerce.number().min(0).default(0),
  actualBND: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
  notes: z.string().optional(),
});
export const section6Schema = z.object({
  costs: z.array(costLineSchema).default([]),
  autoOvertimeBND: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
  autoMealAllowanceBND: z.preprocess(emptyToUndef, z.coerce.number().min(0).optional()),
});

// ─── Section 7 ────────────────────────────────────────────────────────────
export const timelineTaskSchema = z.object({
  phase: z.enum([
    "CONCEPT_APPROVAL",
    "PRODUCTION_LOGISTICS",
    "BROADCAST_CONTENT",
    "EVENT_DAY",
    "POST_EVENT",
  ]),
  task: z.string().min(1),
  owner: z.string().min(1),
  dueDate: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE"]).default("NOT_STARTED"),
});
export const section7Schema = z.object({
  tasks: z.array(timelineTaskSchema).default([]),
});

// ─── Section 8 ────────────────────────────────────────────────────────────
export const broadcastSlotSchema = z.object({
  id: z.string().min(1),
  start: z.string().regex(/^\d{1,2}:\d{2}$/, "HH:mm"),
  end: z.string().regex(/^\d{1,2}:\d{2}$/, "HH:mm"),
});
export const broadcastDaySchema = z.object({
  date: z.string().min(1),
  slots: z.array(broadcastSlotSchema).default([]),
});
export const section8Schema = z.object({
  liveBroadcast: z.enum(["YES", "NO", "TBC"]).default("TBC"),
  platforms: z.array(z.string()).default([]),
  platformOther: z.string().optional(),
  schedule: z.array(broadcastDaySchema).default([]),
  onAirPresenter: z.string().optional(),
  podcastRecording: z.boolean().default(false),
  socialPlatforms: z.array(z.string()).default([]),
  socialContentPlan: z.string().optional(),
  hashtags: z.array(z.string()).default([]),
  postEventContentPlan: z.string().optional(),
});

// ─── Section 9 ────────────────────────────────────────────────────────────
export const riskLineSchema = z.object({
  risk: z.string().min(1),
  likelihood: z.enum(["LOW", "MED", "HIGH"]),
  impact: z.enum(["LOW", "MED", "HIGH"]),
  contingency: z.string().min(1),
});
export const section9Schema = z.object({
  risks: z.array(riskLineSchema).default([]),
});

// ─── Section 10 ───────────────────────────────────────────────────────────
export const section10Schema = z.object({
  actualAttendance: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional()),
  broadcastReach: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional()),
  socialReach: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional()),
  socialImpressions: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional()),
  whatWentWell: z.string().optional(),
  improvements: z.string().optional(),
  recommendations: z.string().optional(),
  clientFeedback: z.string().optional(),
  overallRating: z.preprocess(emptyToUndef, z.coerce.number().min(1).max(5).optional()),
  debriefCompletedBy: z.string().optional(),
  debriefDate: z.string().optional(),
  submittedToGM: z.boolean().optional(),
});

// ─── Section 11 ───────────────────────────────────────────────────────────
export const signOffEntrySchema = z.object({
  name: z.string().optional(),
  signedAt: z.string().optional(),
  role: z.enum(["FIRST_APPROVER", "SECOND_APPROVER", "FINAL_APPROVER"]),
});
export const section11Schema = z.object({
  entries: z.array(signOffEntrySchema).default([]),
});

// ─── The composed schema (loose — permits partial drafts) ─────────────────
export const eventConceptSchema = z.object({
  status: z
    .enum([
      "DRAFT",
      "PENDING_APPROVAL",
      "PENDING_FINAL_APPROVAL",
      "REVISION_REQUIRED",
      "APPROVED",
      "PUBLISHED",
      "UPCOMING",
      "ONGOING",
      "COMPLETED",
      "CANCELLED",
      "ARCHIVED",
    ])
    .default("DRAFT"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  category: z.string().optional(),
  s1: section1Schema,
  s2: section2Schema,
  s3: section3Schema,
  s4: section4Schema,
  s5: section5Schema,
  s6: section6Schema,
  s7: section7Schema,
  s8: section8Schema,
  s9: section9Schema,
  s10: section10Schema,
  s11: section11Schema,
});

export type EventConceptForm = z.infer<typeof eventConceptSchema>;
