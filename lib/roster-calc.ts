import type { RosterSlot, StaffLine } from "./types";

// ─── Tunables (spec §2B) ───────────────────────────────────────────────────
/** A standard shift is 8 hours; anything beyond is overtime. */
export const STANDARD_SHIFT_HOURS = 8;
/** Overtime paid at 1.5× the hourly rate. */
export const OVERTIME_RATE_MULTIPLIER = 1.5;
/** Meal allowance amounts, BND. */
export const MEAL_ALLOWANCE_LUNCH_BND = 8;
export const MEAL_ALLOWANCE_DINNER_BND = 10;
/** Staff must work at least this many hours in a slot to qualify for a meal. */
export const MEAL_MIN_WORK_HOURS = 4;
/** Weekday dinner window starts at 17:15 (5:15 PM). */
export const WEEKDAY_DINNER_MIN_HOUR = 17.25;
/** Weekend meal window pivot points (decimal hours). */
export const WEEKEND_LUNCH_ANCHOR = 12.5; // slot must cover 12:30 to earn lunch
export const WEEKEND_DINNER_ANCHOR = 18.0; // or start ≥ 17:15

// ─── Time helpers ──────────────────────────────────────────────────────────
function toDecimalHours(hhmm: string): number {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
}

/** Hours worked in the slot (0 if end ≤ start). "All day" slots inherit the event day's window. */
export function slotHours(slot: RosterSlot): number {
  // If allDay is set and start/end aren't populated, default to standard 8-hour day
  if (slot.allDay && (!slot.start || !slot.end)) {
    return STANDARD_SHIFT_HOURS;
  }
  const start = toDecimalHours(slot.start);
  const end = toDecimalHours(slot.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end <= start) return 0;
  return end - start;
}

/** Hours over the standard shift, capped at 0. */
export function overtimeHours(slot: RosterSlot): number {
  return Math.max(0, slotHours(slot) - STANDARD_SHIFT_HOURS);
}

/** Regular (non-OT) hours worked in the slot. */
export function regularHours(slot: RosterSlot): number {
  return Math.min(slotHours(slot), STANDARD_SHIFT_HOURS);
}

/** True for Sat / Sun. Interprets the date at local midnight. */
export function isWeekend(dateISO: string): boolean {
  if (!dateISO) return false;
  const d = new Date(dateISO + "T00:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

// ─── Meal allowance eligibility (spec §2B point 2) ─────────────────────────
export interface MealEligibility {
  lunch: boolean;
  dinner: boolean;
}

/**
 * Weekday: dinner only, if slot starts at or after 17:15 AND worked ≥ 4h.
 * Weekend: lunch if slot covers 12:30 AND worked ≥ 4h; dinner if slot
 * starts ≥ 17:15 or spans 18:00 AND worked ≥ 4h.
 */
export function mealAllowancesForSlot(slot: RosterSlot): MealEligibility {
  const worked = slotHours(slot);
  if (worked < MEAL_MIN_WORK_HOURS) return { lunch: false, dinner: false };

  const startHr = toDecimalHours(slot.start);
  const endHr = toDecimalHours(slot.end);
  const weekend = isWeekend(slot.date);

  if (!weekend) {
    // Weekdays — dinner only
    return {
      lunch: false,
      dinner: startHr >= WEEKDAY_DINNER_MIN_HOUR,
    };
  }

  // Weekends — lunch and/or dinner both possible
  const coversLunch = startHr <= WEEKEND_LUNCH_ANCHOR && endHr > WEEKEND_LUNCH_ANCHOR;
  const coversDinner =
    startHr >= WEEKDAY_DINNER_MIN_HOUR ||
    (startHr <= WEEKEND_DINNER_ANCHOR && endHr > WEEKEND_DINNER_ANCHOR);

  return { lunch: coversLunch, dinner: coversDinner };
}

// ─── Aggregate per-slot cost ───────────────────────────────────────────────
export interface SlotCost {
  hours: number;
  regularHours: number;
  otHours: number;
  baseBND: number;
  overtimeBND: number;
  mealAllowanceBND: number;
  mealLunchCount: number;
  mealDinnerCount: number;
}

export function costForSlot(
  slot: RosterSlot,
  ratePerHourBND: number,
  headcount: number
): SlotCost {
  const hrs = slotHours(slot);
  const reg = regularHours(slot);
  const ot = overtimeHours(slot);
  const rate = ratePerHourBND || 0;
  const heads = headcount || 0;

  const baseBND = reg * rate * heads;
  const overtimeBND = ot * rate * OVERTIME_RATE_MULTIPLIER * heads;

  const meals = mealAllowancesForSlot(slot);
  const lunchCount = meals.lunch ? heads : 0;
  const dinnerCount = meals.dinner ? heads : 0;
  const mealAllowanceBND =
    lunchCount * MEAL_ALLOWANCE_LUNCH_BND + dinnerCount * MEAL_ALLOWANCE_DINNER_BND;

  return {
    hours: hrs,
    regularHours: reg,
    otHours: ot,
    baseBND,
    overtimeBND,
    mealAllowanceBND,
    mealLunchCount: lunchCount,
    mealDinnerCount: dinnerCount,
  };
}

// ─── Whole-event staffing rollup ───────────────────────────────────────────
export interface StaffingCost {
  baseBND: number;
  overtimeBND: number;
  mealAllowanceBND: number;
  totalBND: number;
  totalHours: number;
  slotCount: number;
}

export function calculateStaffing(staff: StaffLine[]): StaffingCost {
  let baseBND = 0;
  let overtimeBND = 0;
  let mealAllowanceBND = 0;
  let totalHours = 0;
  let slotCount = 0;

  for (const line of staff) {
    const rate = line.ratePerHourBND ?? 0;
    const count = line.count ?? 0;
    const slots = line.rosterSlots ?? [];
    for (const slot of slots) {
      const c = costForSlot(slot, rate, count);
      baseBND += c.baseBND;
      overtimeBND += c.overtimeBND;
      mealAllowanceBND += c.mealAllowanceBND;
      totalHours += c.hours * count;
      slotCount += 1;
    }
  }

  return {
    baseBND,
    overtimeBND,
    mealAllowanceBND,
    totalBND: baseBND + overtimeBND + mealAllowanceBND,
    totalHours,
    slotCount,
  };
}

/** Pretty day-of-week + date label — e.g. "Saturday, 15 Aug 2026". */
export function formatDayDate(dateISO: string): string {
  if (!dateISO) return "";
  const d = new Date(dateISO + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
