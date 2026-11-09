import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth";
import {
  canViewAnyInventoryDept,
  canViewInventory,
} from "@/lib/inventory-permissions";
import { listCatalogItems } from "@/lib/inventory-store";
import { InventoryCatalogView } from "@/components/inventory/catalog-view";

export default async function InventoryPage() {
  const { user } = await requireSession();
  // View and modify go together per the dept-roster-lead rule. A user
  // with no accessible depts is bounced back to the dashboard rather
  // than shown an empty catalog page.
  if (!canViewAnyInventoryDept(user)) redirect("/dashboard");
  // Strict per-dept filter: a user only sees the inventory sections
  // their role/assignment directly grants (SALES_ADMIN → SALES,
  // TECH_ADMIN → TECH_OPS, Manager of IT → IT, INVENTORY_ADMIN with
  // inventoryDept=X → X). Super Admin sees every section via the bypass
  // inside canViewInventory. See lib/inventory-permissions.ts for the
  // full rule set.
  const items = listCatalogItems().filter((item) => canViewInventory(user, item.dept));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Department inventory catalog"
        description="The master item list per department. You see the sections you lead (as the department's roster lead) or are assigned to (as an Inventory Admin). Per-event checklists (Required / Quantity / Prepared / Warehouse) are ticked inside each event's own page."
      />
      <InventoryCatalogView items={items} />
    </div>
  );
}
