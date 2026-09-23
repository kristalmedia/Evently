import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getKotgBookingsWithClients } from "@/lib/google-sheets";
import { reconcileKotgBookings } from "@/lib/kotg-sync";

/**
 * GET — KOTG service bookings from the Sales team's Google Sheet, joined
 * with their Clients records. Gated behind `events.create` (Sales Admin,
 * CCM Admin, Super Admin) since this is sales-facing client/booking data,
 * not something every Evently role needs to see.
 *
 * Pass ?refresh=1 to bypass the 30s in-process cache (lib/google-sheets.ts)
 * for an explicit user-triggered refresh.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!can(session?.user, "events.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  try {
    const bookings = await getKotgBookingsWithClients({ forceRefresh });
    // Same on-visit reconciliation as the page-level fetch — see
    // lib/kotg-sync.ts. Refresh clicks are a valid transition-detection
    // trigger too, so we run it here too (idempotent via shadow flag).
    reconcileKotgBookings(bookings);
    return NextResponse.json({ bookings, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
