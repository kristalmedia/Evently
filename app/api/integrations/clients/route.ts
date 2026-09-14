import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getAllSheetClients } from "@/lib/google-sheets";

/**
 * GET — unfiltered list of clients from the Sales team's Google Sheet.
 * Used by the event-form commercial-client combobox for autofill.
 * Gated behind events.create (same rule as /api/integrations/kotg-bookings).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!can(session?.user, "events.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  try {
    const clients = await getAllSheetClients({ forceRefresh });
    return NextResponse.json({ clients });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
