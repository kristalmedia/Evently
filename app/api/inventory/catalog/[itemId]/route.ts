import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditInventoryDept } from "@/lib/inventory-permissions";
import {
  deleteCatalogItem,
  getCatalogItem,
  setCatalogItemQuantity,
} from "@/lib/inventory-store";
import { INVENTORY_DEPT_LABEL } from "@/lib/inventory-types";
import { logAudit } from "@/lib/store";

/**
 * PATCH — update one catalog item. Currently supports `quantity` only.
 * Body: { quantity?: number }. Fractional/negative/non-finite values
 * get normalised to 0 or floored down in the store layer.
 *
 * Auth: dept-scoped — caller must hold canEditInventoryDept for the
 * item's own dept. Both seed and custom items are editable here; only
 * DELETE below treats isSeed as protected (quantity updates are
 * exactly what the department wants seed items for).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { itemId } = await params;
  const item = getCatalogItem(itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditInventoryDept(user, item.dept)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { quantity?: unknown };
  if (typeof body.quantity !== "number") {
    return NextResponse.json({ error: "quantity must be a number" }, { status: 400 });
  }

  const updated = setCatalogItemQuantity(itemId, body.quantity);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only audit when the stored value actually changed — the store returns
  // the existing record (reference-equal) when the incoming value equals
  // the current one, avoiding an audit entry for a no-op PATCH.
  if (updated.quantity !== item.quantity) {
    logAudit({
      kind: "STATUS_CHANGED",
      actor: user,
      details: `Inventory: ${INVENTORY_DEPT_LABEL[item.dept]} / "${item.name}" quantity ${item.quantity} → ${updated.quantity}`,
    });
  }

  return NextResponse.json({ item: updated });
}

/**
 * DELETE — remove a CUSTOM (non-seed) catalog item. Seed items ship with
 * the app and are protected so an accidental delete can't drop something
 * every event's checklist expects to be there; the store rejects those
 * silently, which we surface here as a 400.
 *
 * Auth: caller must hold canEditInventoryDept for the item's own dept.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { itemId } = await params;
  const item = getCatalogItem(itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.isSeed) {
    return NextResponse.json(
      { error: "Seed items can't be deleted — only custom items added via 'Add More Inventory Asset' can be removed." },
      { status: 400 },
    );
  }
  if (!canEditInventoryDept(user, item.dept)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ok = deleteCatalogItem(itemId);
  if (!ok) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    details: `Inventory: removed custom item "${item.name}" from ${INVENTORY_DEPT_LABEL[item.dept]}`,
  });
  return NextResponse.json({ ok: true });
}
