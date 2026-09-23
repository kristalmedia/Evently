import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditInventoryDept } from "@/lib/inventory-permissions";
import {
  deleteCatalogItem,
  getCatalogItem,
} from "@/lib/inventory-store";
import { INVENTORY_DEPT_LABEL } from "@/lib/inventory-types";
import { logAudit } from "@/lib/store";

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
