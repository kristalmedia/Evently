import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";
import {
  getOrCreateShadowEvent,
  setAuthorityApproval,
  shadowMakeId,
} from "@/lib/shadow-events";
import type {
  AuthorityApproval,
  AuthorityBody,
  AuthorityDocumentRef,
} from "@/lib/shadow-events-types";
import { logAudit } from "@/lib/store";

/**
 * PUT — replace the booking's authority-approval block wholesale. Body:
 *       { required: boolean, bodies: AuthorityBody[] }
 *
 * Auth: SALES_ADMIN only. The whole feature is Sales-restricted per spec;
 * Super Admin does NOT bypass — if an IT admin needs to touch this, they
 * must additionally hold SALES_ADMIN as a secondary/third role. This
 * matches the pattern we established for the roster-access restriction
 * (commit 421b48c), where Super Admin was also stripped.
 *
 * Document uploads are metadata-only (filename + size + uploader + when);
 * no bytes are transferred or stored. The client-side file picker reads
 * File.name and File.size from the browser's File API and sends those
 * fields in the `documents` array for each body. New document entries
 * get a server-stamped id/uploadedAt/uploadedByUserId; existing entries
 * (ones the client sent back unchanged with an id already present) keep
 * their original stamps so an authority-name edit doesn't rewrite the
 * uploaded-at timestamp of every attached doc.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasRole(user, "SALES_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { bookingId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    required?: unknown;
    bodies?: unknown;
  };

  if (typeof body.required !== "boolean") {
    return NextResponse.json({ error: "required must be a boolean" }, { status: 400 });
  }
  if (!Array.isArray(body.bodies)) {
    return NextResponse.json({ error: "bodies must be an array" }, { status: 400 });
  }

  const shadow = getOrCreateShadowEvent(bookingId);
  const existingBodies = shadow.authorityApproval?.bodies ?? [];
  const existingDocsById = new Map<string, AuthorityDocumentRef>();
  for (const b of existingBodies) for (const d of b.documents) existingDocsById.set(d.id, d);

  const now = new Date().toISOString();
  const sanitizedBodies: AuthorityBody[] = [];
  for (const raw of body.bodies) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
    const inputId = typeof r.id === "string" && r.id ? r.id : shadowMakeId("auth");
    const inputDocs = Array.isArray(r.documents) ? r.documents : [];

    const docs: AuthorityDocumentRef[] = [];
    for (const d of inputDocs) {
      if (!d || typeof d !== "object") continue;
      const dr = d as Record<string, unknown>;
      const filename = typeof dr.filename === "string" ? dr.filename.trim().slice(0, 255) : "";
      if (!filename) continue;
      const sizeBytes =
        typeof dr.sizeBytes === "number" && Number.isFinite(dr.sizeBytes) && dr.sizeBytes >= 0
          ? Math.floor(dr.sizeBytes)
          : 0;

      const existingId = typeof dr.id === "string" ? dr.id : null;
      const prior = existingId ? existingDocsById.get(existingId) : null;
      if (prior) {
        // Keep original upload stamps; only the filename/size are
        // allowed to drift (they shouldn't in normal use, but a client
        // round-trip shouldn't erase who-uploaded-when).
        docs.push({
          ...prior,
          filename,
          sizeBytes,
        });
      } else {
        docs.push({
          id: shadowMakeId("doc"),
          filename,
          sizeBytes,
          uploadedAt: now,
          uploadedByUserId: user.id,
        });
      }
    }

    sanitizedBodies.push({ id: inputId, name, documents: docs });
  }

  const approval: AuthorityApproval = {
    required: body.required,
    bodies: sanitizedBodies,
  };

  const updated = setAuthorityApproval(bookingId, approval, user.id);
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details: `Authority approval: required=${approval.required}, bodies=${sanitizedBodies.length}`,
  });

  return NextResponse.json({ authorityApproval: updated.authorityApproval });
}
