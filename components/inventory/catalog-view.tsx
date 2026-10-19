"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Download, FileDown, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPath } from "@/lib/api-path";
import type { CatalogItem, InventoryDept } from "@/lib/inventory-types";
import {
  INVENTORY_DEPT_LABEL,
  INVENTORY_DEPT_ORDER,
} from "@/lib/inventory-types";
import {
  exportDeptCatalogCsv,
  exportDeptCatalogPdf,
} from "@/lib/inventory-export";
import { useSessionStore } from "@/stores/session-store";
import { hasRole, isSuperAdmin, rosterDeptKeyForDepartment } from "@/lib/permissions";

/** Client-side mirror of the roster-lead inventory mapping — must match
 *  ROSTER_DEPT_TO_INVENTORY_DEPT in lib/inventory-permissions.ts. */
const ROSTER_DEPT_TO_INVENTORY_DEPT: Partial<Record<string, InventoryDept>> = {
  IT: "IT",
  SALES: "SALES",
  TECH: "TECH_OPS",
};

/** Client-side mirror of canEditInventoryDept — we can't call the
 *  server helper directly from a client component, but the rule is
 *  simple enough to re-encode here for gating UI affordances. The
 *  server enforces it independently (see the /api/inventory routes).
 *  Three-way union: Super Admin bypass, roster-lead-for-this-dept,
 *  or explicit INVENTORY_ADMIN assignment via User.inventoryDept. */
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
        // Per-user-request: per-dept CSV / PDF export is gated STRICTLY
        // to the INVENTORY_ADMIN role. Super Admin does NOT bypass and
        // Managers who can otherwise view/edit the catalog do NOT get
        // the buttons. If you want to loosen this to "anyone who can
        // edit this dept", change the condition to `canEdit`.
        const canExport = hasRole(currentUser, "INVENTORY_ADMIN");
        return (
          <Card key={dept}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
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
                  {canExport && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-7 px-2 text-xs"
                        onClick={() => exportDeptCatalogCsv(dept, list)}
                        disabled={list.length === 0}
                        aria-label={`Save ${INVENTORY_DEPT_LABEL[dept]} inventory as CSV`}
                      >
                        <FileDown className="h-3 w-3" />
                        Save CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-7 px-2 text-xs"
                        onClick={async () => {
                          try {
                            await exportDeptCatalogPdf(dept, list);
                          } catch (e) {
                            toast.error(`PDF export failed: ${(e as Error).message}`);
                          }
                        }}
                        disabled={list.length === 0}
                        aria-label={`Save ${INVENTORY_DEPT_LABEL[dept]} inventory as PDF`}
                      >
                        <Download className="h-3 w-3" />
                        Save PDF
                      </Button>
                    </>
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
                    <CatalogRow
                      key={item.id}
                      item={item}
                      canEdit={canEdit}
                      onDelete={deleteItem}
                      busy={busy}
                    />
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

/**
 * One row in the catalog list. Lifted out of InventoryCatalogView so
 * each row can carry its own local state for the quantity input (local
 * state is what lets a user type "123" without the number briefly
 * showing "1", "12", "123" as the parent state round-trips).
 *
 * The quantity input autosaves on blur AND when the value is unchanged
 * for 800ms — the former catches a user tabbing away or clicking off
 * the field, the latter catches "typed and then forgot about it". Both
 * paths PATCH /api/inventory/catalog/[itemId] with just { quantity }.
 */
function CatalogRow({
  item,
  canEdit,
  onDelete,
  busy,
}: {
  item: CatalogItem;
  canEdit: boolean;
  onDelete: (item: CatalogItem) => void;
  busy: boolean;
}) {
  const router = useRouter();
  // Local draft so the input doesn't flicker on parent re-renders mid-typing.
  // Seeded from the server value, and re-synced to it whenever the server
  // value changes (e.g. after a successful save → router.refresh() → new
  // props). An empty string is a valid intermediate state while the user
  // clears the field; we only persist a number.
  const [draft, setDraft] = useState<string>(String(item.quantity));
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef<number>(item.quantity);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(String(item.quantity));
    lastSavedRef.current = item.quantity;
  }, [item.quantity]);

  async function persist(nextRaw: string) {
    if (!canEdit) return;
    const parsed = Number(nextRaw);
    const next = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    if (next === lastSavedRef.current) return;
    setSaving(true);
    try {
      const res = await fetch(apiPath(`/api/inventory/catalog/${item.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update quantity");
      }
      lastSavedRef.current = next;
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      // Revert the local draft to the last-known-good value so the UI
      // doesn't keep showing an unsaved number as if it stuck.
      setDraft(String(lastSavedRef.current));
    } finally {
      setSaving(false);
    }
  }

  function scheduleDebouncedSave(nextRaw: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persist(nextRaw);
    }, 800);
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="flex-1 min-w-0 truncate">{item.name}</span>
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={`qty-${item.id}`}
          className="text-[0.65rem] font-mono uppercase tracking-widest text-muted-foreground"
        >
          Qty
        </label>
        <Input
          id={`qty-${item.id}`}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            scheduleDebouncedSave(e.target.value);
          }}
          onBlur={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            persist(draft);
          }}
          disabled={!canEdit || saving || busy}
          className="h-8 w-20 text-right"
          aria-label={`Quantity for ${item.name}`}
        />
      </div>
      {canEdit && !item.isSeed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(item)}
          disabled={busy || saving}
          aria-label={`Remove ${item.name}`}
        >
          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
        </Button>
      )}
    </li>
  );
}
