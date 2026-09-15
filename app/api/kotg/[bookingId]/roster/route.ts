import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditDept } from "@/lib/kotg-permissions";
import {
  getOrCreateShadowEvent,
  MANAGER_DEPT_KEYS,
  setDeptRoster,
} from "@/lib/shadow-events";
import type {
  DeptRoster,
  ShadowDeptKey,
} from "@/lib/shadow-events-types";
import { logAudit } from "@/lib/store";

/**
 * PUT — replace one department's roster block on this booking's shadow
 *      record. The body specifies which dept and the full block (slots +
 *      staff + optional `completed` flag). Full-replace rather than
 *      patch: keeps the wire simple and mirrors how the client edits
 *      the block as a single form.
 *
 *      Auth: caller must hold canEditDept for the target dept at the
 *      record's current kemsStatus.
 *
 *      The shadow store recomputes kemsStatus on every write, so the
 *      client just needs to send the block; workflow advancement is
 *      automatic when the last Manager block flips `completed: true`.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { bookingId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    deptKey?: string;
    roster?: Partial<DeptRoster>;
  };
  const deptKey = body.deptKey as ShadowDeptKey | undefined;
  if (!deptKey || !(MANAGER_DEPT_KEYS as readonly string[]).includes(deptKey)) {
    return NextResponse.json(
      { error: `deptKey must be one of ${MANAGER_DEPT_KEYS.join(", ")}` },
      { status: 400 },
    );
  }

  const shadow = getOrCreateShadowEvent(bookingId);
  if (!canEditDept(user, deptKey, shadow.kemsStatus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Normalise the incoming block — defensive against a client that
  // omits arrays. Completed is intentionally accepted as boolean-or-
  // undefined so the client can save intermediate progress without
  // flipping the flag.
  const nextBlock: DeptRoster = {
    completed: body.roster?.completed === true,
    slots: Array.isArray(body.roster?.slots) ? body.roster!.slots : [],
    staff: Array.isArray(body.roster?.staff) ? body.roster!.staff : [],
  };
  if (nextBlock.completed) {
    nextBlock.completedAt = new Date().toISOString();
    nextBlock.completedByUserId = user.id;
  }

  const updated = setDeptRoster(bookingId, deptKey, nextBlock);
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details: `Dept ${deptKey} roster ${
      nextBlock.completed ? "completed" : "saved"
    } (kemsStatus → ${updated.kemsStatus})`,
  });
  return NextResponse.json({ shadow: updated });
}
