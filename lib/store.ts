import type {
  AuditEntry,
  AuditKind,
  EventCategory,
  EventConcept,
  EventListRow,
  EventVenue,
  Notification,
  User,
  VerificationStatus,
} from "./types";
import { DEFAULT_CATEGORIES } from "./constants";
import { SEED_EVENTS, SEED_USERS, SEED_VENUES } from "./mock-data";
import { makeId } from "./utils";

/**
 * Module-scoped in-memory store, anchored to globalThis so HMR doesn't
 * clobber test data during development.
 */
type Store = {
  users: Map<string, User>;
  events: Map<string, EventConcept>;
  venues: Map<string, EventVenue>;
  categories: Map<string, EventCategory>;
  notifications: Map<string, Notification>;
};

const g = globalThis as unknown as { __kristal_store?: Store };

function seed(): Store {
  const users = new Map(SEED_USERS.map((u) => [u.id, u]));
  const events = new Map(SEED_EVENTS.map((e) => [e.id, e]));
  const venues = new Map(SEED_VENUES.map((v) => [v.id, v]));
  const categories = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
  const notifications = new Map<string, Notification>();
  return { users, events, venues, categories, notifications };
}

export const store: Store = g.__kristal_store ?? (g.__kristal_store = seed());

// ─── User queries ──────────────────────────────────────────────────────────
export function getAllUsers(): User[] {
  return Array.from(store.users.values()).sort((a, b) =>
    a.fullName.localeCompare(b.fullName)
  );
}
export function getUserById(id: string) {
  return store.users.get(id) ?? null;
}
export function getUserByEmail(email: string) {
  return getAllUsers().find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}
export function upsertUser(user: User) {
  store.users.set(user.id, user);
  return user;
}
export function deleteUser(id: string) {
  return store.users.delete(id);
}

/**
 * Create a new user in INVITED state with a fresh invitation token.
 * They must complete `/auth/set-password` before they're VERIFIED.
 */
export function inviteUser(input: Omit<User, "id" | "createdAt" | "verificationStatus" | "invitationToken" | "invitedAt" | "verifiedAt" | "passwordHash" | "status"> & { status?: "active" | "disabled" }): User {
  const now = new Date().toISOString();
  const record: User = {
    ...input,
    id: makeId("u"),
    status: input.status ?? "active",
    verificationStatus: "INVITED" as VerificationStatus,
    invitationToken: makeId("tok"),
    invitedAt: now,
    createdAt: now,
  };
  store.users.set(record.id, record);
  return record;
}

/**
 * Provision a Viewer account for a user who signed in successfully via
 * Microsoft Entra ID but doesn't exist in Evently yet. No invitation/password
 * flow is needed — Entra already verified their identity — so the account
 * is created directly in VERIFIED state. Department is left "Unassigned"
 * for a Super Admin to correct on the Users page.
 */
export function provisionEntraUser(input: { email: string; fullName: string }): User {
  const now = new Date().toISOString();
  const record: User = {
    id: makeId("u"),
    fullName: input.fullName,
    email: input.email,
    department: "Unassigned",
    jobTitle: "Auto-provisioned via Microsoft sign-in",
    role: "VIEWER",
    status: "active",
    verificationStatus: "VERIFIED",
    verifiedAt: now,
    createdAt: now,
    lastLoginAt: now,
  };
  store.users.set(record.id, record);
  return record;
}

/**
 * Regenerate the invitation token (used by "Resend invite" action).
 */
export function refreshInvitation(id: string): User | null {
  const user = store.users.get(id);
  if (!user || user.verificationStatus !== "INVITED") return null;
  const updated: User = {
    ...user,
    invitationToken: makeId("tok"),
    invitedAt: new Date().toISOString(),
  };
  store.users.set(id, updated);
  return updated;
}

/**
 * Find a user by their invitation token — used by /auth/set-password.
 */
export function findUserByInvitationToken(token: string): User | null {
  for (const u of store.users.values()) {
    if (u.invitationToken === token && u.verificationStatus === "INVITED") return u;
  }
  return null;
}

/**
 * Complete verification — burn the token, mark verified, store password hash.
 * In real deployment, hash server-side with bcrypt/argon2.
 */
export function verifyUserPassword(token: string, passwordHash: string): User | null {
  const user = findUserByInvitationToken(token);
  if (!user) return null;
  const updated: User = {
    ...user,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date().toISOString(),
    invitationToken: undefined,
    passwordHash,
  };
  store.users.set(user.id, updated);
  return updated;
}

// ─── Event queries ─────────────────────────────────────────────────────────
export function getAllEvents(): EventConcept[] {
  return Array.from(store.events.values()).sort(
    (a, b) => +new Date(b.s1.startDate) - +new Date(a.s1.startDate)
  );
}

export function getEventById(id: string) {
  return store.events.get(id) ?? null;
}

export function createEvent(input: Omit<EventConcept, "id" | "createdAt" | "updatedAt">): EventConcept {
  const id = makeId("evt");
  const now = new Date().toISOString();
  const record: EventConcept = { ...input, id, createdAt: now, updatedAt: now };
  store.events.set(id, record);
  return record;
}

export function updateEvent(id: string, patch: Partial<EventConcept>): EventConcept | null {
  const existing = store.events.get(id);
  if (!existing) return null;
  const updated: EventConcept = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  store.events.set(id, updated);
  return updated;
}

export function deleteEvent(id: string) {
  return store.events.delete(id);
}

/** Compact row projection for lists / dashboards */
export function projectRow(e: EventConcept): EventListRow {
  const now = Date.now();
  const start = +new Date(e.s1.startDate);
  const end = +new Date(e.s1.endDate);
  const isLive = e.status === "ONGOING" || (now >= start && now <= end && e.s8.liveBroadcast === "YES");
  return {
    id: e.id,
    title: e.s1.eventName,
    refNo: e.s1.eventRefNo,
    category: e.category,
    venue: e.s1.venue,
    organizer: e.s1.conceptPreparedBy,
    startDate: e.s1.startDate,
    endDate: e.s1.endDate,
    status: e.status,
    priority: e.priority,
    isLive,
  };
}

export function getEventRows(): EventListRow[] {
  return getAllEvents().map(projectRow);
}

// ─── Reference data ────────────────────────────────────────────────────────
export function getVenues() {
  return Array.from(store.venues.values());
}
export function getCategories() {
  return Array.from(store.categories.values());
}

// ─── Notifications ─────────────────────────────────────────────────────────
export function getNotifications(userId: string) {
  return Array.from(store.notifications.values())
    .filter((n) => n.recipientUserId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function getUnreadCount(userId: string) {
  return getNotifications(userId).filter((n) => !n.readAt).length;
}

export function pushNotification(n: Omit<Notification, "id" | "createdAt">) {
  const id = makeId("ntf");
  const rec: Notification = { ...n, id, createdAt: new Date().toISOString() };
  store.notifications.set(id, rec);
  return rec;
}

export function markNotificationRead(id: string) {
  const n = store.notifications.get(id);
  if (!n) return null;
  const updated: Notification = { ...n, readAt: new Date().toISOString() };
  store.notifications.set(id, updated);
  return updated;
}

/**
 * Broadcast a notification to every active user in the system.
 * Wired to the event-created / event-published lifecycle (spec §4A).
 */
export function broadcastNotification(input: Omit<Notification, "id" | "createdAt" | "recipientUserId">) {
  const now = new Date().toISOString();
  const active = getAllUsers().filter((u) => u.status === "active");
  const created: Notification[] = [];
  for (const u of active) {
    const rec: Notification = {
      ...input,
      id: makeId("ntf"),
      createdAt: now,
      recipientUserId: u.id,
    };
    store.notifications.set(rec.id, rec);
    created.push(rec);
  }
  return created;
}

// ─── Audit log (spec §8) ───────────────────────────────────────────────────
const auditStore: { entries: Map<string, AuditEntry> } =
  (globalThis as unknown as { __kristal_audit?: { entries: Map<string, AuditEntry> } }).__kristal_audit
  ?? ((globalThis as unknown as { __kristal_audit?: { entries: Map<string, AuditEntry> } }).__kristal_audit = { entries: new Map() });

export function logAudit(input: {
  kind: AuditKind;
  actor: { id: string; email: string; fullName: string };
  eventId?: string;
  eventRefNo?: string;
  targetUserId?: string;
  details?: string;
}): AuditEntry {
  const entry: AuditEntry = {
    id: makeId("aud"),
    kind: input.kind,
    actorUserId: input.actor.id,
    actorEmail: input.actor.email,
    actorName: input.actor.fullName,
    eventId: input.eventId,
    eventRefNo: input.eventRefNo,
    targetUserId: input.targetUserId,
    details: input.details,
    createdAt: new Date().toISOString(),
  };
  auditStore.entries.set(entry.id, entry);
  return entry;
}

export function getAuditEntries(): AuditEntry[] {
  return Array.from(auditStore.entries.values()).sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
  );
}

// ─── Notification action mark ──────────────────────────────────────────────
export function markNotificationActed(id: string) {
  const n = store.notifications.get(id);
  if (!n) return null;
  const updated = { ...n, actedOn: true, readAt: n.readAt ?? new Date().toISOString() };
  store.notifications.set(id, updated);
  return updated;
}

/** Send a notification to a specific user (unlike broadcast which fans out). */
export function pushNotificationTo(
  recipientUserId: string,
  input: Omit<Notification, "id" | "createdAt" | "recipientUserId">
) {
  const rec: Notification = {
    ...input,
    id: makeId("ntf"),
    createdAt: new Date().toISOString(),
    recipientUserId,
  };
  store.notifications.set(rec.id, rec);
  return rec;
}

/**
 * Return the next unused EVENTLY-EVT-#### reference key.
 * Scans every existing event's ref no. and finds the next slot.
 */
export function nextSequentialRefKey(): string {
  let max = 0;
  for (const e of store.events.values()) {
    const m = e.s1.eventRefNo?.match(/EVENTLY-EVT-(\d{4})/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  const next = String(max + 1).padStart(4, "0");
  return `EVENTLY-EVT-${next}`;
}

// ─── Simulated email log + real delivery (spec §3) ─────────────────────────
import { deliverMail, transportStatus, type MailResult } from "./email-transport";

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
  delivered: boolean;
  simulated: boolean;
  error?: string;
  messageId?: string;
}
const emailStore: { emails: Map<string, SentEmail> } =
  (globalThis as unknown as { __kristal_email?: { emails: Map<string, SentEmail> } }).__kristal_email
  ?? ((globalThis as unknown as { __kristal_email?: { emails: Map<string, SentEmail> } }).__kristal_email = { emails: new Map() });

/**
 * Send an email through the configured transport, log the attempt, and
 * return the result. If SMTP isn't configured, the send is honestly reported
 * as simulated — the log still captures it so IT can inspect.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<SentEmail> {
  const result: MailResult = await deliverMail(input);
  const rec: SentEmail = {
    ...input,
    id: makeId("mail"),
    sentAt: new Date().toISOString(),
    delivered: result.ok,
    simulated: result.simulated,
    error: result.error,
    messageId: result.messageId,
  };
  emailStore.emails.set(rec.id, rec);
  return rec;
}

export function getSentEmails(): SentEmail[] {
  return Array.from(emailStore.emails.values()).sort(
    (a, b) => +new Date(b.sentAt) - +new Date(a.sentAt)
  );
}

/** Expose transport status so the UI can warn honestly. */
export { transportStatus };
