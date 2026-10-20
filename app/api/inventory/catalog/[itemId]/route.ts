import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditInventoryDept } from "@/lib/inventory-permissions";
import {
  deleteCatalogItem,
  getCatalogItem,
  updateCatalogItem,
} from "@/lib/inventory-store";
import { INVENTORY_DEPT_LABEL } from "@/lib/inventory-types";
import { logAudit } from "@/lib/store";

/**
 * PATCH — update one catalog item. Body: { name?, description?,
 * quantity? } — any subset. The store normalises inputs (trims names,
 * clamps quantity to a non-negative integer, treats a blank description
 * as "clear the field"). Any unknown fields in the body are ignored.
 *
 * Auth: dept-scoped — caller must hold canEditInventoryDept for the
 * item's own dept. Both seed and custom items are editable.
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

  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    description?: unknown;
    quantity?: unknown;
  };

  const patch: { name?: string; description?: string; quantity?: number } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.quantity === "number") patch.quantity = body.quantity;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Provide at least one of: name, description, quantity." },
      { status: 400 },
    );
  }

  // Empty name after trimming would wipe the item's label — reject
  // rather than silently falling through to the store's "already-matches"
  // short-circuit (which would keep the old name without telling the
  // client their input was ignored).
  if (patch.name !== undefined && patch.name.trim().length === 0) {
    return NextResponse.json(
      { error: "Item name can't be empty." },
      { status: 400 },
    );
  }

  const updated = updateCatalogItem(itemId, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reference equality means the store detected a no-op (every patched
  // field already matched the stored value); skip the audit entry in
  // that case so a dept-level Save Changes click that touched some rows
  // but not others doesn't fill the audit log with "no change" noise.
  if (updated !== item) {
    const changes: string[] = [];
    if (patch.name !== undefined && updated.name !== item.name) {
      changes.push(`name: "${item.name}" → "${updated.name}"`);
    }
    if (
      patch.description !== undefined &&
      updated.description !== item.description
    ) {
      changes.push(
        `description: "${item.description ?? ""}" → "${updated.description ?? ""}"`,
      );
    }
    if (patch.quantity !== undefined && updated.quantity !== item.quantity) {
      changes.push(`quantity: ${item.quantity} → ${updated.quantity}`);
    }
    if (changes.length > 0) {
      logAudit({
        kind: "STATUS_CHANGED",
        actor: user,
        details: `Inventory: ${INVENTORY_DEPT_LABEL[item.dept]} / "${item.name}" updated — ${changes.join("; ")}`,
      });
    }
  }

  return NextResponse.json({ item: updated });
}

/**
 * DELETE — remove any catalog item (seed or custom). Seed-protection was
 * removed per the "Delete button for every item" spec; a dept that
 * accidentally wipes their seeded roster can restore it with a PM2
 * restart (the store rebuilds from lib/inventory-seed.ts on boot).
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
