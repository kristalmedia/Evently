import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  canEditInventoryDept,
  canViewInventory,
} from "@/lib/inventory-permissions";
import {
  addCatalogItem,
  listCatalogItems,
} from "@/lib/inventory-store";
import type { InventoryDept } from "@/lib/inventory-types";
import { INVENTORY_DEPT_LABEL } from "@/lib/inventory-types";
import { logAudit } from "@/lib/store";

const VALID_DEPTS = Object.keys(INVENTORY_DEPT_LABEL) as InventoryDept[];

function isInventoryDept(v: unknown): v is InventoryDept {
  return typeof v === "string" && (VALID_DEPTS as string[]).includes(v);
}

/** GET — every catalog item, grouped by dept client-side. Any signed-in
 *  active user can read. */
export async function GET() {
  const session = await getSession();
  if (!canViewInventory(session?.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ items: listCatalogItems() });
}

/** POST — add a custom item to the given dept. Body: { dept, name }.
 *  Only the dept-scoped INVENTORY_ADMIN (or Super Admin) can add. */
export async function POST(req: Request) {
  const session = await getSession();
  const user = session?.user;
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    dept?: unknown;
    name?: unknown;
  };
  if (!isInventoryDept(body.dept)) {
    return NextResponse.json(
      { error: `dept must be one of ${VALID_DEPTS.join(", ")}` },
      { status: 400 },
    );
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 200) {
    return NextResponse.json(
      { error: "name must be between 1 and 200 characters" },
      { status: 400 },
    );
  }
  if (!canEditInventoryDept(user, body.dept)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const item = addCatalogItem({ dept: body.dept, name });
  logAudit({
    kind: "STATUS_CHANGED",
    actor: user,
    details: `Inventory: added custom item "${item.name}" to ${INVENTORY_DEPT_LABEL[item.dept]}`,
  });
  return NextResponse.json({ item });
}
