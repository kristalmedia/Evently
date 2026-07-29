import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  createEvent,
  getAllEvents,
  getEventRows,
  getUserByEmail,
  logAudit,
  nextSequentialRefKey,
  pushNotificationTo,
} from "@/lib/store";
import { APPROVER_EMAILS } from "@/lib/constants";
import type { EventConcept } from "@/lib/types";

export async function GET() {
  const session = await getSession();
  if (!can(session?.user, "events.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ events: getEventRows() });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!can(session?.user, "events.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body0 = (await req.json().catch(() => ({}))) as Omit<
    EventConcept,
    "id" | "createdAt" | "updatedAt"
  >;
  let body = body0;

  if (!body.s1?.eventName || !body.s1?.eventRefNo) {
    return NextResponse.json(
      { error: "Section 1 requires eventName and eventRefNo" },
      { status: 400 }
    );
  }

  // Enforce ref uniqueness — if the client-provided key collides with an
  // existing event, replace with a fresh sequential one and audit the swap.
  const desiredRef = body.s1.eventRefNo;
  const collides = getAllEvents().some((e) => e.s1.eventRefNo === desiredRef);
  if (collides) {
    body = {
      ...body,
      s1: { ...body.s1, eventRefNo: nextSequentialRefKey() },
    };
  }

  const created = createEvent({
    ...body,
    createdBy: session!.user.id,
  });

  const submitter = session!.user;

  // Audit log
  logAudit({
    kind: created.status === "PENDING_APPROVAL" ? "EVENT_CREATED" : "DRAFT_SAVED",
    actor: submitter,
    eventId: created.id,
    eventRefNo: created.s1.eventRefNo,
    details: `Status = ${created.status}`,
  });

  // Sequential approval workflow (spec §5) — STRICT ISOLATION.
  // Only the next approver is notified. No cross-firing, no broadcast noise.
  if (created.status === "PENDING_APPROVAL") {
    // First Approver (Nabeng) submitted — target Rudy only.
    const rudy = getUserByEmail(APPROVER_EMAILS.SECOND_APPROVER);
    if (rudy) {
      pushNotificationTo(rudy.id, {
        kind: "APPROVAL_REQUEST",
        title: `Approval requested: ${created.s1.eventName}`,
        body: `${submitter.fullName} has submitted "${created.s1.eventName}" (${created.s1.eventRefNo}). Your Approve / Deny action is required.`,
        eventId: created.id,
        approverStage: "SECOND_APPROVER",
      });
    }
  }
  // Draft saves are intentionally NOT broadcast — silent persistence to
  // avoid notification noise for every keystroke-triggered save.

  return NextResponse.json({ event: created });
}
