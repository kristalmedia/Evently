"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Download, FileDown, Filter, Lock, Save } from "lucide-react";
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
import { hasRole, isSuperAdmin, rosterDeptKeyForDepartment } from "@/lib/permissions";

/** Must match ROSTER_DEPT_TO_INVENTORY_DEPT in
 *  lib/inventory-permissions.ts — the mapping from the roster-side
 *  ShadowDeptKey the user leads to the InventoryDept they get access to
 *  under the roster-lead rule. */
const ROSTER_DEPT_TO_INVENTORY_DEPT: Partial<Record<string, InventoryDept>> = {
  IT: "IT",
  SALES: "SALES",
  TECH: "TECH_OPS",
};

/** Client-side mirror of canEditInventoryDept — see
 *  components/inventory/catalog-view.tsx for the identical function.
 *  Server enforces this rule independently in /api/inventory/*. */
function canEditDeptClient(
  user: ReturnType<typeof useSessionStore.getState>["user"],
  dept: InventoryDept,
): boolean {
  if (!user || user.status === "disabled") return false;
  if (isSuperAdmin(user)) return true;

  if (hasRole(user, "MANAGER")) {
    const rosterKey = rosterDeptKeyForDepartment(user.department);
    if (rosterKey && ROSTER_DEPT_TO_INVENTORY_DEPT[rosterKey] === dept) return true;
  }

  if (hasRole(user, "INVENTORY_ADMIN") && user.inventoryDept === dept) return true;

  return false;
}

/** Client-side mirror of primaryInventoryDeptForUser in
 *  lib/inventory-permissions.ts. Returns the InventoryDept that should
 *  be the user's default focus on the event checklist — their roster-
 *  lead dept, then their admin-role implied dept, falling back to null
 *  (meaning "show all departments by default"). */
function primaryDeptForUserClient(
  user: ReturnType<typeof useSessionStore.getState>["user"],
): InventoryDept | null {
  if (!user || user.status === "disabled") return null;
  if (hasRole(user, "INVENTORY_ADMIN") && user.inventoryDept) {
    return user.inventoryDept;
  }
  if (hasRole(user, "MANAGER")) {
    const rosterKey = rosterDeptKeyForDepartment(user.department);
    if (rosterKey && ROSTER_DEPT_TO_INVENTORY_DEPT[rosterKey]) {
      return ROSTER_DEPT_TO_INVENTORY_DEPT[rosterKey] ?? null;
    }
  }
  if (hasRole(user, "SALES_ADMIN")) return "SALES";
  if (hasRole(user, "TECH_ADMIN")) return "TECH_OPS";
  if (hasRole(user, "CCM_ADMIN")) return "CCM_TECH_OPS";
  return null;
}

/** Filter options: "ALL" (show every dept) or a specific InventoryDept. */
type DeptFilter = "ALL" | InventoryDept;

export function EventInventoryView({
  bookingId,
  displayTitle,
  clientName,
  venue,
  startDate,
  endDate,
  statusLabel,
  items,
  initialTicks,
}: {
  bookingId: string;
  displayTitle: string;
  clientName?: string;
  venue?: string;
  /** Event start/end from the Sales sheet — passed through verbatim to
   *  the export so the PDF header + CSV columns carry real dates. */
  startDate?: string;
  endDate?: string;
  /** UI-side event status label (e.g. "Upcoming", "Confirmed") passed
   *  through to the PDF header. */
  statusLabel?: string;
  items: CatalogItem[];
  initialTicks: Record<string, EventInventoryTick>;
}) {
  const router = useRouter();
  const currentUser = useSessionStore((s) => s.user);
  const [ticks, setTicks] = useState<Record<string, EventInventoryTick>>(initialTicks);
  const [busy, setBusy] = useState(false);

  // Default the filter to the user's primary inventory dept — a Tech
  // Admin lands on TECH_OPS, a Sales Admin on SALES, etc. Users with no
  // primary dept (Super Admin, generic Inventory Admin, a FINANCIAL_ADMIN
  // viewer) default to "ALL". Local state only; no URL/query persistence.
  const [deptFilter, setDeptFilter] = useState<DeptFilter>(
    () => primaryDeptForUserClient(currentUser) ?? "ALL",
  );

  // Which depts actually appear on the page given the active filter.
  // "ALL" preserves INVENTORY_DEPT_ORDER; otherwise just the selected
  // dept. Items outside the filter are hidden but their existing ticks
  // are preserved in local state — switching filters restores them
  // without a server round-trip.
  const visibleDepts = useMemo<readonly InventoryDept[]>(
    () => (deptFilter === "ALL" ? INVENTORY_DEPT_ORDER : [deptFilter]),
    [deptFilter],
  );

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
    exportInventoryCsv({
      bookingId,
      displayTitle,
      clientName,
      venue,
      startDate,
      endDate,
      statusLabel,
      items,
      ticks,
    });
  }

  async function doExportPdf() {
    try {
      await exportInventoryPdf({
        bookingId,
        displayTitle,
        clientName,
        venue,
        startDate,
        endDate,
        statusLabel,
        items,
        ticks,
      });
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
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Boxes className="h-4 w-4 text-accent" />
          <span>Inventory checklist</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {/* Dept filter — defaults to the user's primary dept so a
                Tech Admin opening an event lands on TECH_OPS, etc.
                "All departments" is the comprehensive view option the
                spec names explicitly; available to everyone, not just
                elevated admins — since master catalog read access is
                granted at the role level (see
                MASTER_INVENTORY_READ_ROLES), hiding the toggle from
                some admins would be inconsistent. */}
            <label
              htmlFor="inventory-dept-filter"
              className="inline-flex items-center gap-1 text-[0.65rem] font-mono uppercase tracking-widest text-muted-foreground"
            >
              <Filter className="h-3 w-3" />
              Dept
            </label>
            <select
              id="inventory-dept-filter"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value as DeptFilter)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              aria-label="Filter checklist by department"
            >
              <option value="ALL">All departments</option>
              {INVENTORY_DEPT_ORDER.map((dept) => (
                <option key={dept} value={dept}>
                  {INVENTORY_DEPT_LABEL[dept]}
                </option>
              ))}
            </select>
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
        {/* Single-dept filter with zero items — show an empty state so
            the filter looks responsive rather than silently rendering
            nothing (which would read as broken UI). "All" view omits
            empty depts as before. */}
        {deptFilter !== "ALL" && (grouped.get(deptFilter) ?? []).length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No items in the {INVENTORY_DEPT_LABEL[deptFilter]} section yet.
          </div>
        )}
        {visibleDepts.map((dept) => {
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
