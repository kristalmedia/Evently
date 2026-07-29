import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can, canDeleteEvent, canEditEvent } from "@/lib/permissions";
import { deleteEvent, getEventById, logAudit, updateEvent } from "@/lib/store";
import type { EventConcept } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!can(session?.user, "events.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ event });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!canEditEvent(session?.user) && !can(session?.user, "events.edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = getEventById(id);
  const body = (await req.json().catch(() => ({}))) as Partial<EventConcept>;
  const updated = updateEvent(id, body);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Detailed audit for Broadcast Admin edits (spec §4).
  const user = session!.user;
  let details = "PATCH via API";
  if (existing) {
    const changed: string[] = [];
    const sectionKeys = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11"] as const;
    for (const k of sectionKeys) {
      if (k in body && JSON.stringify(existing[k]) !== JSON.stringify((body as Record<string, unknown>)[k])) {
        changed.push(k);
      }
    }
    if (user.role === "BROADCAST_ADMIN" && changed.length > 0) {
      details = `Broadcast Admin edit — sections modified: ${changed.join(", ")}`;
    } else if (changed.length > 0) {
      details = `${user.role} edit — sections modified: ${changed.join(", ")}`;
    }
  }

  logAudit({
    kind: "EVENT_EDITED",
    actor: user,
    eventId: updated.id,
    eventRefNo: updated.s1.eventRefNo,
    details,
  });
  return NextResponse.json({ event: updated });
}

/**
 * DELETE — Super Admin exclusive (spec §1 & §4).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!canDeleteEvent(session?.user)) {
    return NextResponse.json({ error: "Delete restricted to Super Admin" }, { status: 403 });
  }
  const { id } = await params;
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ok = deleteEvent(id);
  logAudit({
    kind: "EVENT_DELETED",
    actor: session!.user,
    eventId: event.id,
    eventRefNo: event.s1.eventRefNo,
    details: "Hard delete",
  });
  return NextResponse.json({ ok });
}
