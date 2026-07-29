import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canCancelEvent } from "@/lib/permissions";
import { getEventById, logAudit, updateEvent } from "@/lib/store";

/**
 * Cancel action — moves the event directly to Archived (spec §4).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!canCancelEvent(session?.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = updateEvent(id, { status: "ARCHIVED" });
  logAudit({
    kind: "EVENT_ARCHIVED",
    actor: session!.user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: "Cancelled → Archived",
  });
  return NextResponse.json({ event: updated });
}
