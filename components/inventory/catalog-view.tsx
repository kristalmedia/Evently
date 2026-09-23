"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiPath } from "@/lib/api-path";
import type { CatalogItem, InventoryDept } from "@/lib/inventory-types";
import {
  INVENTORY_DEPT_LABEL,
  INVENTORY_DEPT_ORDER,
} from "@/lib/inventory-types";
import { useSessionStore } from "@/stores/session-store";
import { hasRole, isSuperAdmin } from "@/lib/permissions";

/** Client-side mirror of canEditInventoryDept — we can't call the
 *  server helper directly from a client component, but the rule is
 *  simple enough to re-encode here for gating UI affordances. The
 *  server enforces it independently (see the /api/inventory routes). */
function canEditDeptClient(
  user: ReturnType<typeof useSessionStore.getState>["user"],
  dept: InventoryDept,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  if (!hasRole(user, "INVENTORY_ADMIN")) return false;
  return user.inventoryDept === dept;
}

export function InventoryCatalogView({ items }: { items: CatalogItem[] }) {
  const router = useRouter();
  const currentUser = useSessionStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [newItemNames, setNewItemNames] = useState<Record<InventoryDept, string>>({
    EVENTS: "",
    SALES: "",
    TECH_OPS: "",
    CCM_TECH_OPS: "",
    IT: "",
    OTHERS: "",
  });

  const grouped = useMemo(() => {
    const g = new Map<InventoryDept, CatalogItem[]>();
    for (const dept of INVENTORY_DEPT_ORDER) g.set(dept, []);
    for (const item of items) g.get(item.dept)?.push(item);
    // Deterministic ordering: seed items first (in id order), custom items after
    // (also in id order) — so newly-added custom items land at the bottom of
    // their section rather than reshuffling on every render.
    for (const [, list] of g) {
      list.sort((a, b) => {
        if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
    }
    return g;
  }, [items]);

  async function addItem(dept: InventoryDept) {
    const name = (newItemNames[dept] ?? "").trim();
    if (name.length < 1) {
      toast.error("Item name can't be empty");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/inventory/catalog"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dept, name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to add item");
      }
      setNewItemNames((prev) => ({ ...prev, [dept]: "" }));
      toast.success(`Added "${name}" to ${INVENTORY_DEPT_LABEL[dept]}`, {
        position: "bottom-center",
      });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(item: CatalogItem) {
    if (item.isSeed) {
      toast.error("Seed items can't be deleted");
      return;
    }
    if (!confirm(`Remove "${item.name}" from the ${INVENTORY_DEPT_LABEL[item.dept]} catalog?`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/inventory/catalog/${item.id}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to remove item");
      }
      toast.success(`Removed "${item.name}"`, { position: "bottom-center" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {INVENTORY_DEPT_ORDER.map((dept) => {
        const list = grouped.get(dept) ?? [];
        const canEdit = canEditDeptClient(currentUser, dept);
        return (
          <Card key={dept}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Boxes className="h-4 w-4 text-accent" />
                <span>{INVENTORY_DEPT_LABEL[dept]}</span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-xs font-normal text-muted-foreground font-mono">
                    {list.length} item{list.length === 1 ? "" : "s"}
                  </span>
                  {!canEdit && (
                    <span className="inline-flex items-center gap-1 text-[0.65rem] font-mono uppercase tracking-widest text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      Read-only
                    </span>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {list.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No items yet.
                </div>
              ) : (
                <ul className="divide-y rounded-md border">
                  {list.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      <span className="flex-1 min-w-0 truncate">{item.name}</span>
                      {item.isSeed ? (
                        <Badge variant="outline" className="text-[0.6rem]">seed</Badge>
                      ) : (
                        <Badge variant="signal" className="text-[0.6rem]">custom</Badge>
                      )}
                      {canEdit && !item.isSeed && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteItem(item)}
                          disabled={busy}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="Add more inventory asset…"
                    value={newItemNames[dept]}
                    onChange={(e) =>
                      setNewItemNames((prev) => ({ ...prev, [dept]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addItem(dept);
                      }
                    }}
                    disabled={busy}
                    className="flex-1"
                  />
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => addItem(dept)}
                    disabled={busy || !newItemNames[dept].trim()}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
