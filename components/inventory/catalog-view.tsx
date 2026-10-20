"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Download,
  FileDown,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
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
  countExportableItems,
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

/** Client-side mirror of canEditInventoryDept — see
 *  lib/inventory-permissions.ts for the authoritative server-side rule.
 *  Three-way union: Super Admin bypass, roster-lead-for-this-dept, or
 *  explicit INVENTORY_ADMIN assignment via User.inventoryDept. */
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

/** Local draft of one row's editable fields. Separate from CatalogItem so
 *  the per-row toggleable edit state and the dept-level batch save can
 *  coexist cleanly — a row in "view mode" still carries a draft (which
 *  simply mirrors the server values); dept-level Save Changes diffs the
 *  draft against item.* and only PATCHes rows that drift. */
interface RowDraft {
  name: string;
  description: string;
  quantity: string; // string so an empty input is a valid intermediate
  editing: boolean;
}

function freshDraft(item: CatalogItem): RowDraft {
  return {
    name: item.name,
    description: item.description ?? "",
    quantity: String(item.quantity),
    editing: false,
  };
}

function normalizeQuantity(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Does this draft diverge from the server values on any editable field?
 *  Used by the dept-level Save Changes to decide which rows to PATCH. */
function draftDiffersFromItem(draft: RowDraft, item: CatalogItem): boolean {
  if (draft.name.trim() !== item.name) return true;
  if ((draft.description.trim() || undefined) !== item.description) return true;
  if (normalizeQuantity(draft.quantity) !== item.quantity) return true;
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

  // Draft state keyed by item.id. Re-seeds from props whenever the server
  // items change (e.g. after router.refresh), but preserves the `editing`
  // flag so a toggled-open row stays open through a routine refresh.
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() => {
    const seed: Record<string, RowDraft> = {};
    for (const item of items) seed[item.id] = freshDraft(item);
    return seed;
  });
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      for (const item of items) {
        const old = prev[item.id];
        next[item.id] = old
          ? {
              name: item.name,
              description: item.description ?? "",
              quantity: String(item.quantity),
              editing: old.editing,
            }
          : freshDraft(item);
      }
      return next;
    });
  }, [items]);

  const updateDraft = useCallback(
    (itemId: string, patch: Partial<RowDraft>) => {
      setDrafts((prev) => {
        const current = prev[itemId];
        if (!current) return prev;
        return { ...prev, [itemId]: { ...current, ...patch } };
      });
    },
    [],
  );

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

  /** Dept-level Save Changes: diff each row's draft against the server
   *  item, PATCH only the ones that drift. Rows pass validation first
   *  (no blank names); if any row fails, nothing is sent. Successful
   *  rows exit edit mode. */
  async function saveDeptChanges(dept: InventoryDept, list: CatalogItem[]) {
    const dirty = list
      .map((item) => ({ item, draft: drafts[item.id] }))
      .filter(
        (r): r is { item: CatalogItem; draft: RowDraft } =>
          !!r.draft && draftDiffersFromItem(r.draft, r.item),
      );

    if (dirty.length === 0) {
      toast.info("No changes to save", { position: "bottom-center" });
      return;
    }
    for (const { item, draft } of dirty) {
      if (!draft.name.trim()) {
        toast.error(`"${item.name}" needs a name`);
        return;
      }
    }

    setBusy(true);
    try {
      const results = await Promise.all(
        dirty.map(async ({ item, draft }) => {
          const res = await fetch(apiPath(`/api/inventory/catalog/${item.id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: draft.name.trim(),
              description: draft.description.trim(),
              quantity: normalizeQuantity(draft.quantity),
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? `Failed to save "${item.name}"`);
          }
          return item.id;
        }),
      );
      // Exit edit mode on everything we saved.
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of results) {
          if (next[id]) next[id] = { ...next[id], editing: false };
        }
        return next;
      });
      toast.success(
        `Saved ${results.length} change${results.length === 1 ? "" : "s"} in ${INVENTORY_DEPT_LABEL[dept]}`,
        { position: "bottom-center" },
      );
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
        const canExport = hasRole(currentUser, "INVENTORY_ADMIN");
        // Seed items are excluded from exports — see lib/inventory-export.ts.
        // Use this count to disable the buttons so a dept with only seed
        // items doesn't offer an export that would come back empty.
        const exportableCount = countExportableItems(list);
        const dirtyCount = list.filter((item) => {
          const d = drafts[item.id];
          return d && draftDiffersFromItem(d, item);
        }).length;

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
                        disabled={exportableCount === 0}
                        aria-label={`Save ${INVENTORY_DEPT_LABEL[dept]} inventory as CSV`}
                        title={
                          exportableCount === 0
                            ? "Nothing to export — seed items are excluded"
                            : undefined
                        }
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
                        disabled={exportableCount === 0}
                        aria-label={`Save ${INVENTORY_DEPT_LABEL[dept]} inventory as PDF`}
                        title={
                          exportableCount === 0
                            ? "Nothing to export — seed items are excluded"
                            : undefined
                        }
                      >
                        <Download className="h-3 w-3" />
                        Save PDF
                      </Button>
                    </>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                      draft={drafts[item.id] ?? freshDraft(item)}
                      canEdit={canEdit}
                      busy={busy}
                      onDraftChange={(patch) => updateDraft(item.id, patch)}
                      onDelete={() => deleteItem(item)}
                    />
                  ))}
                </ul>
              )}
              {canEdit && (
                <>
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
                      variant="outline"
                      size="sm"
                      onClick={() => addItem(dept)}
                      disabled={busy || !newItemNames[dept].trim()}
                      className="gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      {dirtyCount === 0
                        ? "No unsaved changes."
                        : `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}.`}
                    </span>
                    <div className="ml-auto">
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => saveDeptChanges(dept, list)}
                        disabled={busy || dirtyCount === 0}
                        className="gap-1.5"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save Changes
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * One row in the catalog list. View mode: shows name (large) + optional
 * description below, with the quantity on the right. Edit mode (toggled
 * by the pencil button): name and description become inputs. Quantity is
 * always editable when the dept is editable — it's a frequent-change
 * value and asking the user to toggle edit mode first for a +1 would be
 * tedious. Changes to any field are STAGED in the parent's draft state
 * and only persisted when the user clicks the dept-level Save Changes.
 */
function CatalogRow({
  item,
  draft,
  canEdit,
  busy,
  onDraftChange,
  onDelete,
}: {
  item: CatalogItem;
  draft: RowDraft;
  canEdit: boolean;
  busy: boolean;
  onDraftChange: (patch: Partial<RowDraft>) => void;
  onDelete: () => void;
}) {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (draft.editing) nameInputRef.current?.focus();
  }, [draft.editing]);

  return (
    <li className="flex items-start gap-3 px-3 py-3 text-sm">
      <div className="flex-1 min-w-0 space-y-1">
        {draft.editing ? (
          <>
            <Input
              ref={nameInputRef}
              value={draft.name}
              onChange={(e) => onDraftChange({ name: e.target.value })}
              placeholder="Item name"
              disabled={!canEdit || busy}
              className="h-9 text-base font-semibold"
              aria-label={`Name for ${item.name}`}
            />
            <Input
              value={draft.description}
              onChange={(e) => onDraftChange({ description: e.target.value })}
              placeholder="Description (optional)"
              disabled={!canEdit || busy}
              className="h-8 text-sm"
              aria-label={`Description for ${item.name}`}
            />
          </>
        ) : (
          <>
            {/* "Model Name" treatment — larger, bolder than the body
                 size the row previously used. Mirrors the H2-ish weight
                 we use on card titles elsewhere in the app. */}
            <div className="text-base font-semibold leading-tight truncate">
              {draft.name.trim() || item.name}
            </div>
            {(draft.description || item.description) && (
              <div className="text-xs text-muted-foreground leading-snug line-clamp-2">
                {draft.description || item.description}
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
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
          value={draft.quantity}
          onChange={(e) => onDraftChange({ quantity: e.target.value })}
          disabled={!canEdit || busy}
          className="h-8 w-20 text-right"
          aria-label={`Quantity for ${item.name}`}
        />
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDraftChange({ editing: !draft.editing })}
            disabled={busy}
            aria-label={draft.editing ? `Stop editing ${item.name}` : `Edit ${item.name}`}
            title={draft.editing ? "Collapse editor" : "Edit name & description"}
          >
            {draft.editing ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Remove ${item.name}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
          </Button>
        </div>
      )}
    </li>
  );
}
