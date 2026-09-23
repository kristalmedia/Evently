import type { KotgBookingWithClient } from "./google-sheets-types";
import type { EventListRow, EventStatus } from "./types";
import type {
  ShadowEventEventlyStatus,
  ShadowEventRecord,
} from "./shadow-events-types";
import { getShadowEvent } from "./shadow-events";

/**
 * Projection layer — turns a Sheet-sourced KOTG booking (plus, when it
 * exists, its Evently shadow record) into the shapes the existing dashboard /
 * calendar / events-table UI already consumes. Keeps the swap from the
 * old EventConcept source to the new Sheet+shadow source strictly a
 * data-plumbing change; no UI component needs to know the origin.
 */

/** Sheet-Status values that should never surface to non-Sales Evently
 *  users. Cancelled bookings remain in the Sheet (Sales keeps them for
 *  audit) but every list — dashboard, calendar, events, reports, event
 *  detail — filters them out via `filterVisibleBookings`. Matched
 *  case-insensitively + trimmed. */
const HIDDEN_SHEET_STATUSES = new Set(["cancelled", "canceled"]);

/** Predicate: is this Sheet-Status value one Evently should surface? */
export function isVisibleBookingStatus(sheetStatus: string): boolean {
  return !HIDDEN_SHEET_STATUSES.has(sheetStatus.trim().toLowerCase());
}

/** Convenience: drop every booking whose Sheet Status is Cancelled.
 *  Every Evently list page should route the raw fetch through this before
 *  handing rows to the UI. */
export function filterVisibleBookings(
  bookings: KotgBookingWithClient[],
): KotgBookingWithClient[] {
  return bookings.filter((b) => isVisibleBookingStatus(b.booking.Status));
}

/** Matches an already-ISO "YYYY-MM-DD" date, optionally with a time
 *  component tacked on — passed straight through unchanged. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Matches DD/MM/YYYY or DD-MM-YYYY — the day-first format Google Sheets
 *  renders dates in for locales like ours. */
const DAY_FIRST_DATE_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Normalizes a Sheet date cell into a plain "YYYY-MM-DD" string, or null
 *  if it isn't a real date. The Sheet is hand-typed and read via the
 *  Sheets API's default FORMATTED_VALUE mode, so a "date" cell can come
 *  back as an ISO string, a locale-formatted day-first string
 *  ("25/09/2026"), or plain placeholder text ("TBC", "TBD", blank) for a
 *  booking that's Active but not yet locked in.
 *
 *  Deliberately does the ISO and day-first cases as pure string
 *  manipulation rather than round-tripping through a `Date` object and
 *  reading back y/m/d — `new Date("2026-09-25")` is UTC midnight per the
 *  ECMAScript spec, while `new Date(2026, 8, 25)` (what you'd build for
 *  the day-first case) is local time, so reading both back through the
 *  same getters would silently shift one of them by a day depending on
 *  the server's timezone. Working on the string directly sidesteps that
 *  entirely for the two formats we actually expect. Any other
 *  native-parseable format (e.g. "Sep 25, 2026") is rare enough here that
 *  we fall back to `Date` + local getters for it and accept the small
 *  residual timezone risk. JS's Date constructor also doesn't reliably
 *  reject day-first strings — for a day ≤ 12 it happily reinterprets
 *  "25/09/2026"-shaped input as month=25 (invalid) or, worse, silently
 *  swaps day/month with no error — so day-first must be tried explicitly
 *  rather than left to native parsing. */
export function normalizeSheetDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(ISO_DATE_RE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dayFirst = trimmed.match(DAY_FIRST_DATE_RE);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
    // Day-first didn't produce a valid month (e.g. "9/25/2026" — day=9,
    // "month"=25) — this is unambiguously NOT a day-first date, so fall
    // through to native parsing instead of giving up, which correctly
    // recovers US month/day-ordered input like this one.
  }

  const native = new Date(trimmed);
  if (!Number.isNaN(native.getTime())) {
    return `${native.getFullYear()}-${pad2(native.getMonth() + 1)}-${pad2(native.getDate())}`;
  }
  return null;
}

/** Does this booking have a StartDate that's actually a real, parseable
 *  date — not just a non-empty string? A naive `!!booking.StartDate`
 *  truthy check treats placeholder text like "TBC" as "has a date",
 *  which silently drops the booking from FullCalendar (it can't place an
 *  event with an unparseable start) with no visible sign anything went
 *  wrong — the booking just never appears anywhere. Every caller that
 *  needs to decide "does this belong on the calendar grid" should use
 *  this instead of checking StartDate for truthiness directly. */
export function hasScheduledDate(booking: KotgBookingWithClient): boolean {
  return normalizeSheetDate(booking.booking.StartDate) !== null;
}

/** Derives the UI EventStatus from the pair (Sheet booking status, Evently
 *  shadow.eventlyStatus). Called for every row every render, so kept as a
 *  pure lookup with no side effects.
 *
 *  Logic:
 *    - Sheet says Cancelled → CANCELLED
 *    - Sheet says Completed → COMPLETED
 *    - Sheet Active + shadow eventlyStatus determines the Evently internal stage:
 *        ACTIVE / MANAGERS_IN_PROGRESS → STAFFING_IN_PROGRESS
 *        HR_UNLOCKED / FINANCE_UNLOCKED → FINANCIAL_REVIEW
 *        PUBLISHED → PUBLISHED
 *    - Anything else (Pending, Draft, blank) → UPCOMING
 *
 *  The mapping deliberately reuses existing EventStatus values so the
 *  StatusBadge / calendar colouring / filters continue to work unchanged.
 */
export function mapKotgBookingToEventStatus(
  sheetStatus: string,
  eventlyStatus: ShadowEventEventlyStatus | undefined,
): EventStatus {
  const s = sheetStatus.trim().toLowerCase();
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  if (s === "completed") return "COMPLETED";
  if (s !== "active") return "UPCOMING";

  switch (eventlyStatus) {
    case "PUBLISHED":
      // Terminal state after HR marks complete — badge reads
      // "Confirmed Event" (see EVENT_STATUSES in lib/constants.ts).
      return "PUBLISHED";
    case "HR_UNLOCKED":
    case "FINANCE_UNLOCKED":
      // HR (or the legacy Finance step) is finalising staff-related
      // items — booking is still in an in-progress state.
      return "STAFFING_IN_PROGRESS";
    case "MANAGERS_IN_PROGRESS":
    case "ACTIVE":
    default:
      return "STAFFING_IN_PROGRESS";
  }
}

/** Heuristic — Sheet doesn't carry an indoor/outdoor discriminator, so
 *  we infer from the free-text ServiceName. Falls back to outdoor since
 *  KRISTAL On The Go is inherently a mobile/outdoor product line. */
export function inferKotgCategory(booking: KotgBookingWithClient): string {
  const svc = booking.booking.ServiceName.toLowerCase();
  if (svc.includes("indoor")) return "kotg - indoor";
  return "kotg - outdoor";
}

/** Best-effort human label for the booking — CustomPackage name preferred
 *  (users think in packages, not raw service names), then ServiceName,
 *  then a synthesised placeholder. Same rule the KOTG bookings table uses. */
export function kotgDisplayTitle(booking: KotgBookingWithClient): string {
  return (
    booking.customPackage?.PackageName ||
    booking.booking.ServiceName ||
    `KOTG booking ${booking.booking.BookingID}`
  );
}

/** Best-effort "who is this for" — CompanyName then contact name, then em-dash. */
export function kotgOrganizerLabel(booking: KotgBookingWithClient): string {
  return (
    booking.client?.CompanyName ||
    booking.client?.ClientName ||
    booking.booking.ContactPersonName ||
    "—"
  );
}

/** Projects one booking into the EventListRow shape the dashboard,
 *  events list and event table components consume. Uses BookingID as the
 *  row id (so /events/[id] links resolve back to the booking). */
export function projectKotgBookingRow(
  booking: KotgBookingWithClient,
): EventListRow {
  const shadow = getShadowEvent(booking.booking.BookingID);
  const status = mapKotgBookingToEventStatus(
    booking.booking.Status,
    shadow?.eventlyStatus,
  );
  const now = Date.now();
  // Same day-first-date pitfall as projectKotgCalendarItem — go through
  // normalizeSheetDate rather than `+new Date(rawString)` directly, or a
  // "25/09/2026"-style StartDate parses as NaN and this booking silently
  // never counts as "live" no matter what today's date is.
  const normalizedStart = normalizeSheetDate(booking.booking.StartDate);
  const normalizedEnd = normalizeSheetDate(booking.booking.EndDate);
  const start = normalizedStart ? +new Date(normalizedStart) : 0;
  const end = normalizedEnd ? +new Date(normalizedEnd) : start;
  const isLive =
    status !== "CANCELLED" &&
    status !== "COMPLETED" &&
    start > 0 &&
    now >= start &&
    now <= end;

  return {
    id: booking.booking.BookingID,
    title: kotgDisplayTitle(booking),
    refNo: booking.booking.QuotationNumber || booking.booking.BookingID,
    category: inferKotgCategory(booking),
    venue: booking.booking.LocationDetails || "TBC",
    organizer: kotgOrganizerLabel(booking),
    startDate: booking.booking.StartDate || "",
    endDate: booking.booking.EndDate || booking.booking.StartDate || "",
    status,
    priority: "MEDIUM",
    isLive,
  };
}

/** Projects one booking into the calendar-item shape EventsCalendar
 *  expects. Description is the Sheet's Notes column (that's the closest
 *  the Sheet has to a free-text summary). */
export function projectKotgCalendarItem(
  booking: KotgBookingWithClient,
): {
  id: string;
  title: string;
  start: string;
  end?: string;
  status: EventStatus;
  category?: string;
  description?: string;
  venue?: string;
} {
  const shadow = getShadowEvent(booking.booking.BookingID);
  // Normalize both dates through the same day-first-aware parser that
  // hasScheduledDate uses, rather than handing FullCalendar the raw Sheet
  // string — a day-first "25/09/2026" StartDate would pass
  // hasScheduledDate but still fail to place on the calendar if we didn't
  // convert it to "2026-09-25" here too. Callers of this function are
  // expected to have already filtered to hasScheduledDate(booking)
  // bookings, so `start` should never actually be null in practice — the
  // fallback to the raw string is just so a caller that skips that
  // filter doesn't get `start: undefined` handed to FullCalendar.
  const start = normalizeSheetDate(booking.booking.StartDate) ?? booking.booking.StartDate;
  const end = normalizeSheetDate(booking.booking.EndDate) ?? undefined;
  return {
    id: booking.booking.BookingID,
    title: kotgDisplayTitle(booking),
    start,
    end,
    status: mapKotgBookingToEventStatus(booking.booking.Status, shadow?.eventlyStatus),
    category: inferKotgCategory(booking),
    description: booking.booking.Notes || undefined,
    venue: booking.booking.LocationDetails || undefined,
  };
}

/** Sums the HR + Finance shadow lines for one booking. Used by the
 *  dashboard budget rollup and the reports page's cost columns.
 *  Returns zeroes when no shadow record exists yet. */
export function sumShadowBudget(shadow: ShadowEventRecord | null | undefined): {
  overtimeBND: number;
  mealAllowanceBND: number;
  otherEstBND: number;
  otherActBND: number;
  totalEstBND: number;
  totalActBND: number;
} {
  if (!shadow) {
    return {
      overtimeBND: 0,
      mealAllowanceBND: 0,
      otherEstBND: 0,
      otherActBND: 0,
      totalEstBND: 0,
      totalActBND: 0,
    };
  }
  // OT: HR-typed per row.
  const overtimeBND = shadow.hr.overtime.reduce((s, l) => s + l.amountBND, 0);
  // Meal allowance: BND 5 per AM tick + BND 5 per PM tick. Iterating
  // the tick map (not the slot list) — the HR editor is the sole author
  // of tick keys, and it never leaves ticks for a deleted slot.
  const mealAllowanceBND = Object.values(shadow.hr.mealTicks).reduce(
    (s, t) => s + (t.am ? 5 : 0) + (t.pm ? 5 : 0),
    0,
  );
  let otherEstBND = 0;
  let otherActBND = 0;
  for (const line of shadow.finance.lines) {
    otherEstBND += line.estimatedBND;
    otherActBND += line.actualBND ?? 0;
  }
  return {
    overtimeBND,
    mealAllowanceBND,
    otherEstBND,
    otherActBND,
    totalEstBND: overtimeBND + mealAllowanceBND + otherEstBND,
    totalActBND: overtimeBND + mealAllowanceBND + otherActBND,
  };
}
