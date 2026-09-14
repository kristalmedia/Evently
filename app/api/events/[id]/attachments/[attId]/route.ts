import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditEvent } from "@/lib/permissions";
import { deleteAttachment, getAttachment } from "@/lib/attachments";

/**
 * GET    — download one attachment. Any authenticated user (events.view
 *          equivalent) can grab it; matches list access on the parent route.
 * DELETE — remove one. Same gate as upload (canEditEvent).
 *
 * The `id` param is the event ID (used in URL to keep attachments logically
 * scoped to an event), but the actual lookup is by attachment id — we
 * enforce the scoping by cross-checking eventId at both call sites.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; attId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id, attId } = await params;
  const att = getAttachment(attId);
  if (!att || att.eventId !== id) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }
  // Response's BodyInit union accepts Uint8Array but Node's Buffer type
  // isn't in the Web-standards typings — a Buffer IS a Uint8Array at
  // runtime, so a plain assignment wrapping is safe and cheap.
  return new Response(new Uint8Array(att.bytes), {
    headers: {
      "Content-Type": att.contentType,
      // Encode the filename for RFC 5987 support in modern browsers — a
      // filename with spaces / non-ASCII survives without the browser
      // truncating at the first space.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      "Content-Length": String(att.size),
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attId: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canEditEvent(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, attId } = await params;
  const existing = getAttachment(attId);
  if (!existing || existing.eventId !== id) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }
  const removed = deleteAttachment(attId);
  return NextResponse.json({ deleted: removed });
}
