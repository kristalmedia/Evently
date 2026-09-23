import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  canEditInventoryDept,
  canViewInventory,
} from "@/lib/inventory-permissions";
import {
  getCatalogItem,
  getEventInventory,
  saveEventInventoryTicks,
} from "@/lib/inventory-store";
import type { EventInventoryTick } from "@/lib/inventory-types";
import { logAudit } from "@/lib/store";

/**
 * GET — one booking's inventory ticks. Any signed-in active user can
 * read (spec: "All authenticated users can view the completed inventory
 * list within the Event Details page").
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getSession();
  if (!canViewInventory(session?.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { bookingId } = await params;
  return NextResponse.json({ record: getEventInventory(bookingId) });
}

function isTick(v: unknown): v is EventInventoryTick {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.required === "boolean" &&
    typeof t.prepared === "boolean" &&
    typeof t.atWarehouse === "boolean" &&
    typeof t.quantity === "number" &&
    Number.isFinite(t.quantity) &&
    t.quantity >= 0
  );
}

/**
 * PUT — merge a partial patch of ticks into a booking's record. Body
 * shape: { ticks: Record<itemId, EventInventoryTick> }. Ticks for items
 * the caller isn't authorised to edit (wrong dept) are silently dropped
 * server-side — the UI already hides those inputs, so this is defence-
 * in-depth rather than a case the UI is expected to hit.
 *
 * Auth: caller must hold canEditInventoryDept for at least one dept to
 * be allowed through this handler at all; per-item authorization is
 * enforced by looking up each item's dept individually.
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
    ticks?: Record<string, unknown>;
  };
  const rawTicks = body.ticks ?? {};
  if (typeof rawTicks !== "object") {
    return NextResponse.json({ error: "ticks must be an object" }, { status: 400 });
  }

  const authorized: Record<string, EventInventoryTick> = {};
  const rejected: string[] = [];
  let editedAny = false;
  for (const [itemId, tick] of Object.entries(rawTicks)) {
    if (!isTick(tick)) {
      rejected.push(itemId);
      continue;
    }
    const item = getCatalogItem(itemId);
    if (!item) {
      rejected.push(itemId);
      continue;
    }
    if (!canEditInventoryDept(user, item.dept)) {
      rejected.push(itemId);
      continue;
    }
    authorized[itemId] = tick;
    editedAny = true;
  }
  if (!editedAny) {
    return NextResponse.json(
      { error: "Nothing to save — no ticks matched an item you're allowed to edit.", rejected },
      { status: 403 },
    );
  }

  const updated = saveEventInventoryTicks({
    bookingId,
    patch: authorized,
    userId: user.id,
  });
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    eventId: bookingId,
    details: `Inventory checklist updated (${Object.keys(authorized).length} items)`,
  });
  return NextResponse.json({ record: updated, rejected });
}
