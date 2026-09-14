import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditEvent } from "@/lib/permissions";
import { getEventById, logAudit } from "@/lib/store";
import { listAttachments, saveAttachment } from "@/lib/attachments";

/**
 * GET  — list attachments on an event.
 *        Any authenticated user who can view the event (events.view) sees
 *        the list; download is gated the same way in [attId]/route.ts.
 *
 * POST — upload one or more files (multipart/form-data, field name "files").
 *        Requires event-edit permission; unlimited count and size per the
 *        spec (backed by in-memory store — see lib/attachments.ts caveat).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ attachments: listAttachments(id) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canEditEvent(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const event = getEventById(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'files' field." },
      { status: 400 }
    );
  }

  // Accept single-value or repeated "files" fields — a native
  // <input type="file" multiple> POSTs one field per selected file.
  const files = form.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }

  const saved = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = saveAttachment({
      eventId: id,
      filename: file.name,
      contentType: file.type,
      bytes,
      uploadedByUserId: user.id,
      uploadedByName: user.fullName,
    });
    saved.push(meta);
    // One audit line per file — easier to filter later by filename than
    // a single grouped line, and matches how downloads / deletes are logged.
    logAudit({
      kind: "ATTACHMENT_UPLOADED",
      actor: user,
      eventId: id,
      eventRefNo: event.s1.eventRefNo,
      details: `Uploaded "${meta.filename}" (${meta.size} bytes, ${meta.contentType})`,
    });
  }
  return NextResponse.json({ uploaded: saved });
}
