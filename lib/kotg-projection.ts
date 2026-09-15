import type { KotgBookingWithClient } from "./google-sheets-types";
import type { EventListRow, EventStatus } from "./types";
import type {
  ShadowEventKemsStatus,
  ShadowEventRecord,
} from "./shadow-events-types";
import { getShadowEvent } from "./shadow-events";

/**
 * Projection layer — turns a Sheet-sourced KOTG booking (plus, when it
 * exists, its KEMS shadow record) into the shapes the existing dashboard /
 * calendar / events-table UI already consumes. Keeps the swap from the
 * old EventConcept source to the new Sheet+shadow source strictly a
 * data-plumbing change; no UI component needs to know the origin.
 */

/** Sheet-Status values that should never surface to non-Sales KEMS
 *  users. Cancelled bookings remain in the Sheet (Sales keeps them for
 *  audit) but every list — dashboard, calendar, events, reports, event
 *  detail — filters them out via `filterVisibleBookings`. Matched
 *  case-insensitively + trimmed. */
const HIDDEN_SHEET_STATUSES = new Set(["cancelled", "canceled"]);

/** Predicate: is this Sheet-Status value one KEMS should surface? */
export function isVisibleBookingStatus(sheetStatus: string): boolean {
  return !HIDDEN_SHEET_STATUSES.has(sheetStatus.trim().toLowerCase());
}

/** Convenience: drop every booking whose Sheet Status is Cancelled.
 *  Every KEMS list page should route the raw fetch through this before
 *  handing rows to the UI. */
export function filterVisibleBookings(
  bookings: KotgBookingWithClient[],
): KotgBookingWithClient[] {
  return bookings.filter((b) => isVisibleBookingStatus(b.booking.Status));
}

/** Derives the UI EventStatus from the pair (Sheet booking status, KEMS
 *  shadow.kemsStatus). Called for every row every render, so kept as a
 *  pure lookup with no side effects.
 *
 *  Logic:
 *    - Sheet says Cancelled → CANCELLED
 *    - Sheet says Completed → COMPLETED
 *    - Sheet Active + shadow kemsStatus determines the KEMS internal stage:
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
  kemsStatus: ShadowEventKemsStatus | undefined,
): EventStatus {
  const s = sheetStatus.trim().toLowerCase();
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  if (s === "completed") return "COMPLETED";
  if (s !== "active") return "UPCOMING";

  switch (kemsStatus) {
    case "PUBLISHED":
      return "PUBLISHED";
    case "HR_UNLOCKED":
    case "FINANCE_UNLOCKED":
      return "FINANCIAL_REVIEW";
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
    shadow?.kemsStatus,
  );
  const now = Date.now();
  const start = booking.booking.StartDate
    ? +new Date(booking.booking.StartDate)
    : 0;
  const end = booking.booking.EndDate
    ? +new Date(booking.booking.EndDate)
    : start;
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
  return {
    id: booking.booking.BookingID,
    title: kotgDisplayTitle(booking),
    start: booking.booking.StartDate,
    end: booking.booking.EndDate || undefined,
    status: mapKotgBookingToEventStatus(booking.booking.Status, shadow?.kemsStatus),
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
