import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listCatalogItems } from "@/lib/inventory-store";
import { InventoryCatalogView } from "@/components/inventory/catalog-view";

export default async function InventoryPage() {
  const { user } = await requireSession();
  if (!can(user, "inventory.view")) redirect("/dashboard");
  const items = listCatalogItems();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Department inventory catalog"
        description="The master item list per department. Inventory Admins manage their own department's section; everyone else sees it read-only. Per-event checklists (Required / Quantity / Prepared / Warehouse) are ticked inside each event's own page."
      />
      <InventoryCatalogView items={items} />
    </div>
  );
}
