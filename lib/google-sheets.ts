import { JWT } from "google-auth-library";
import type {
  KotgBookingWithClient,
  SheetClient,
  SheetCustomPackage,
  SheetServiceBooking,
} from "./google-sheets-types";

/**
 * Read-only live sync from the Sales team's external Google Sheet
 * (ServiceBookings + Clients tabs). Auth is via a service account granted
 * Viewer access on that one Sheet — see .env.local.example for setup.
 *
 * Category we filter on: the Sheet uses "KRISTAL On The Go" as the literal
 * value — matches this app's own KOTG event type (see EVENT_TYPES in
 * lib/constants.ts). Matched case-insensitively + trimmed since the Sheet
 * is manually maintained by Sales and typos/whitespace drift are likely.
 */

const KOTG_CATEGORY = "kristal on the go";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

// Generous range caps — well beyond any realistic row count for a manually
// maintained sales sheet, cheap to over-request on a values.get call.
// Range extended to W to include LocationDetails (added 2026-09).
const RANGE_SERVICE_BOOKINGS = "ServiceBookings!A1:W10000";
const RANGE_CLIENTS = "Clients!A1:M10000";
const RANGE_CUSTOM_PACKAGES = "CustomPackages!A1:K10000";

/**
 * JWT client anchored to globalThis — same HMR-survival pattern as
 * lib/store.ts and lib/better-auth.ts — so Next.js dev-mode per-route
 * module reloading doesn't force a fresh auth handshake on every navigation.
 * google-auth-library's internal gtoken already caches the access token
 * until near-expiry, so reusing this client is what makes that caching
 * actually pay off across requests.
 */
const g = globalThis as unknown as { __kristal_sheets_auth?: JWT };

function getAuthClient(): JWT {
  if (g.__kristal_sheets_auth) return g.__kristal_sheets_auth;

  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      "Google Sheets integration not configured — set GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY in .env.local."
    );
  }

  // .env.local stores the key with literal \n sequences (can't have real
  // newlines in a single-line env value); the PEM format requires actual
  // newlines to parse.
  const normalizedKey = key.replace(/\\n/g, "\n");

  const client = new JWT({ email, key: normalizedKey, scopes: SCOPES });
  g.__kristal_sheets_auth = client;
  return client;
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not set in .env.local.");
  }
  return id;
}

/** Fetches one A1-notation range and returns its raw 2D cell values. */
async function fetchRange(range: string): Promise<string[][]> {
  const client = getAuthClient();
  const { access_token } = await client.authorize();
  if (!access_token) throw new Error("Failed to obtain a Google Sheets access token.");

  const spreadsheetId = getSpreadsheetId();
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${access_token}` },
    // Never let Next.js cache a live-sync fetch at the framework level —
    // our own short in-process cache (below) already governs freshness.
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets API error (${res.status}) fetching "${range}": ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

/**
 * First row of `rows` is treated as the header row and used to map every
 * subsequent row into an object keyed by header name — NOT by column
 * position. This means the Sales team reordering columns in their Sheet
 * doesn't break parsing; only renaming a column KEMS reads by name would.
 * Missing trailing cells (Sheets omits them rather than padding with
 * blanks) are treated as "".
 */
function parseSheetRows<T>(rows: string[][]): T[] {
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows.map((row) => {
    // Built as a plain string-keyed record, then cast to the caller's
    // named interface (SheetServiceBooking / SheetClient) — those interfaces
    // have no index signature, so they don't structurally satisfy a
    // `Record<string, string>` generic constraint even though every field
    // IS a string. The cast is safe here because both callers only read
    // fields that exist in the interface, sourced from the header row we
    // control (see the module doc comment on header-name coupling).
    const obj: Record<string, string> = {};
    header.forEach((colName, i) => {
      obj[colName] = row[i] ?? "";
    });
    return obj as T;
  });
}

// ─── Short in-process cache ─────────────────────────────────────────────
// Avoids hammering the Sheets API (and its per-minute read quota) on every
// page load. 30s is short enough that "live sync" still feels live for a
// manually-updated sales sheet, long enough to absorb a burst of page
// visits. Anchored to globalThis for the same HMR-survival reason as above.
const CACHE_TTL_MS = 30_000;
interface Cache {
  data: KotgBookingWithClient[];
  fetchedAt: number;
}
const cacheHolder = globalThis as unknown as { __kristal_kotg_cache?: Cache };

/**
 * Fetches ServiceBookings + Clients, filters ServiceBookings to
 * Category === "KRISTAL On The Go" (case-insensitive, trimmed), and joins
 * each booking to its Clients row by ClientID.
 *
 * `client: null` on a result means the booking's ClientID didn't match any
 * row in the Clients sheet — surfaced to the caller as a data-quality flag
 * rather than silently dropped.
 */
export async function getKotgBookingsWithClients(opts?: {
  /** Bypass the 30s cache — use for an explicit user-triggered refresh. */
  forceRefresh?: boolean;
}): Promise<KotgBookingWithClient[]> {
  const cached = cacheHolder.__kristal_kotg_cache;
  if (!opts?.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const [bookingRows, clientRows, packageRows] = await Promise.all([
    fetchRange(RANGE_SERVICE_BOOKINGS),
    fetchRange(RANGE_CLIENTS),
    fetchRange(RANGE_CUSTOM_PACKAGES),
  ]);

  const bookings = parseSheetRows<SheetServiceBooking>(bookingRows);
  const clients = parseSheetRows<SheetClient>(clientRows);
  const packages = parseSheetRows<SheetCustomPackage>(packageRows);
  const clientsById = new Map(clients.map((c) => [c.ClientID, c]));
  const packagesById = new Map(packages.map((p) => [p.CustomPackageID, p]));

  const kotgBookings = bookings.filter(
    (b) => b.Category.trim().toLowerCase() === KOTG_CATEGORY
  );

  const joined: KotgBookingWithClient[] = kotgBookings.map((booking) => ({
    booking,
    client: clientsById.get(booking.ClientID) ?? null,
    // CustomPackageID is empty on most bookings (they use a standard
    // ServiceID instead). Only look up + surface the package when set.
    customPackage: booking.CustomPackageID
      ? packagesById.get(booking.CustomPackageID) ?? null
      : null,
  }));

  cacheHolder.__kristal_kotg_cache = { data: joined, fetchedAt: Date.now() };
  return joined;
}

// ─── Lightweight clients-only fetch (for the event-form autofill combobox) ─
interface ClientsCache {
  data: SheetClient[];
  fetchedAt: number;
}
const clientsCacheHolder = globalThis as unknown as {
  __kristal_clients_cache?: ClientsCache;
};

/**
 * All rows from the Clients sheet, unfiltered. Used by the event-form's
 * commercial-client combobox (Section 1, when classification=COMMERCIAL)
 * so Sales users can pick from the Sales team's canonical client list
 * instead of retyping names.
 *
 * Separate cache from getKotgBookingsWithClients() so a clients-only
 * refresh (typing in the combobox) doesn't invalidate the KOTG bookings
 * page's cache and vice-versa.
 */
export async function getAllSheetClients(opts?: {
  forceRefresh?: boolean;
}): Promise<SheetClient[]> {
  const cached = clientsCacheHolder.__kristal_clients_cache;
  if (!opts?.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const rows = await fetchRange(RANGE_CLIENTS);
  const clients = parseSheetRows<SheetClient>(rows);
  clientsCacheHolder.__kristal_clients_cache = { data: clients, fetchedAt: Date.now() };
  return clients;
}
