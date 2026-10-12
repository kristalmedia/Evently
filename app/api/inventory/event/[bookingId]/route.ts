import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  canEditInventoryDept,
  canViewAnyInventoryDept,
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
 * GET — one booking's inventory ticks, filtered to the caller's
 * accessible departments. Under the new rule view and modify go
 * together, so the response only includes ticks whose catalog item
 * belongs to a dept the caller can view. A caller with zero accessible
 * depts gets a 403.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!canViewAnyInventoryDept(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { bookingId } = await params;
  const record = getEventInventory(bookingId);
  // Filter ticks down to those for items in a dept this user can view.
  // Missing/unknown item ids are also dropped so a stale tick doesn't
  // leak through if the catalog item was later deleted.
  const filteredTicks: Record<string, EventInventoryTick> = {};
  for (const [itemId, tick] of Object.entries(record.ticks)) {
    const item = getCatalogItem(itemId);
    if (!item) continue;
    if (!canViewInventory(user, item.dept)) continue;
    filteredTicks[itemId] = tick;
  }
  return NextResponse.json({ record: { ...record, ticks: filteredTicks } });
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
