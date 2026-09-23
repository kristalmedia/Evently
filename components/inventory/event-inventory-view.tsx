"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Download, FileDown, Lock, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPath } from "@/lib/api-path";
import type {
  CatalogItem,
  EventInventoryTick,
  InventoryDept,
} from "@/lib/inventory-types";
import {
  EMPTY_TICK,
  INVENTORY_DEPT_LABEL,
  INVENTORY_DEPT_ORDER,
} from "@/lib/inventory-types";
import {
  exportInventoryCsv,
  exportInventoryPdf,
} from "@/lib/inventory-export";
import { useSessionStore } from "@/stores/session-store";
import { hasRole, isSuperAdmin } from "@/lib/permissions";

function canEditDeptClient(
  user: ReturnType<typeof useSessionStore.getState>["user"],
  dept: InventoryDept,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;
  if (!hasRole(user, "INVENTORY_ADMIN")) return false;
  return user.inventoryDept === dept;
}

export function EventInventoryView({
  bookingId,
  displayTitle,
  clientName,
  venue,
  items,
  initialTicks,
}: {
  bookingId: string;
  displayTitle: string;
  clientName?: string;
  venue?: string;
  items: CatalogItem[];
  initialTicks: Record<string, EventInventoryTick>;
}) {
  const router = useRouter();
  const currentUser = useSessionStore((s) => s.user);
  const [ticks, setTicks] = useState<Record<string, EventInventoryTick>>(initialTicks);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const g = new Map<InventoryDept, CatalogItem[]>();
    for (const dept of INVENTORY_DEPT_ORDER) g.set(dept, []);
    for (const item of items) g.get(item.dept)?.push(item);
    for (const [, list] of g) {
      list.sort((a, b) => {
        if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
    }
    return g;
  }, [items]);

  function tickFor(itemId: string): EventInventoryTick {
    return ticks[itemId] ?? EMPTY_TICK;
  }

  function updateTick(itemId: string, patch: Partial<EventInventoryTick>): void {
    setTicks((prev) => {
      const current = prev[itemId] ?? EMPTY_TICK;
      return { ...prev, [itemId]: { ...current, ...patch } };
    });
  }

  async function save() {
    setBusy(true);
    try {
      // Only send ticks the caller can actually edit — the server would
      // reject the rest anyway, and this keeps the audit trail clean.
      const payload: Record<string, EventInventoryTick> = {};
      for (const item of items) {
        if (!canEditDeptClient(currentUser, item.dept)) continue;
        payload[item.id] = tickFor(item.id);
      }
      const res = await fetch(apiPath(`/api/inventory/event/${bookingId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticks: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save");
      }
      const { record } = await res.json();
      setTicks(record.ticks ?? {});
      toast.success("Inventory checklist saved", { position: "bottom-center" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function doExportCsv() {
    exportInventoryCsv({ bookingId, displayTitle, clientName, venue, items, ticks });
  }

  async function doExportPdf() {
    try {
      await exportInventoryPdf({ bookingId, displayTitle, clientName, venue, items, ticks });
    } catch (e) {
      toast.error(`PDF export failed: ${(e as Error).message}`);
    }
  }

  const canEditAny = useMemo(
    () => items.some((i) => canEditDeptClient(currentUser, i.dept)),
    [items, currentUser],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Boxes className="h-4 w-4 text-accent" />
          <span>Inventory checklist</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={doExportCsv}
              className="gap-1.5"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={doExportPdf}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {INVENTORY_DEPT_ORDER.map((dept) => {
          const list = grouped.get(dept) ?? [];
          if (list.length === 0) return null;
          const canEdit = canEditDeptClient(currentUser, dept);
          return (
            <div key={dept} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                <span>{INVENTORY_DEPT_LABEL[dept]}</span>
                {!canEdit && (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    read-only
                  </span>
                )}
              </div>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left px-2 py-1.5">Items</th>
                      <th className="w-24 text-center px-2 py-1.5">Required?</th>
                      <th className="w-20 text-center px-2 py-1.5">Quantity</th>
                      <th className="w-24 text-center px-2 py-1.5">Prepared?</th>
                      <th className="w-32 text-center px-2 py-1.5">Item at Warehouse?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((item) => {
                      const t = tickFor(item.id);
                      return (
                        <tr key={item.id} className="border-t">
                          <td className="px-2 py-1.5">{item.name}</td>
                          <td className="text-center px-2 py-1.5">
                            <Checkbox
                              checked={t.required}
                              disabled={!canEdit}
                              onCheckedChange={(v) =>
                                updateTick(item.id, { required: v === true })
                              }
                              aria-label={`Required: ${item.name}`}
                            />
                          </td>
                          <td className="text-center px-2 py-1.5">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={t.quantity}
                              disabled={!canEdit}
                              onChange={(e) =>
                                updateTick(item.id, {
                                  quantity: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="h-8 text-sm text-center w-16 mx-auto"
                              aria-label={`Quantity: ${item.name}`}
                            />
                          </td>
                          <td className="text-center px-2 py-1.5">
                            <Checkbox
                              checked={t.prepared}
                              disabled={!canEdit}
                              onCheckedChange={(v) =>
                                updateTick(item.id, { prepared: v === true })
                              }
                              aria-label={`Prepared: ${item.name}`}
                            />
                          </td>
                          <td className="text-center px-2 py-1.5">
                            <Checkbox
                              checked={t.atWarehouse}
                              disabled={!canEdit}
                              onCheckedChange={(v) =>
                                updateTick(item.id, { atWarehouse: v === true })
                              }
                              aria-label={`At warehouse: ${item.name}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {canEditAny && (
          <div className="flex items-center justify-end pt-2 border-t">
            <Button
              variant="accent"
              size="sm"
              onClick={save}
              disabled={busy}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
            >
              <Save className="h-3.5 w-3.5" />
              {busy ? "Saving…" : "Save inventory"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
