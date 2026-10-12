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
  // Filter the catalog down to just the sections the user is allowed to
  // see — a Manager of IT only sees the IT section, etc. Super Admin
  // sees every section as before via the bypass inside canViewInventory.
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
