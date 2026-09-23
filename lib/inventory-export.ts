import type {
  CatalogItem,
  EventInventoryTick,
  InventoryDept,
} from "./inventory-types";
import { EMPTY_TICK, INVENTORY_DEPT_LABEL, INVENTORY_DEPT_ORDER } from "./inventory-types";

/**
 * CSV + PDF export for the inventory checklist. Both run client-side so
 * the browser triggers the download directly with no server round-trip;
 * jsPDF + jspdf-autotable are dynamically imported to keep them out of
 * the shared JS bundle (same pattern as lib/hr-export.ts).
 */

export interface InventoryExportBundle {
  /** Event context printed at the top of the PDF and in the CSV
   *  filename. Loosely-typed so both concept events and KOTG bookings
   *  can call this with whatever display fields they have. */
  bookingId: string;
  displayTitle: string;
  clientName?: string;
  venue?: string;
  items: CatalogItem[];
  ticks: Record<string, EventInventoryTick>;
}

function tickFor(bundle: InventoryExportBundle, itemId: string): EventInventoryTick {
  return bundle.ticks[itemId] ?? EMPTY_TICK;
}

function csvField(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function safeFilename(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 60);
}

function bool(v: boolean): string {
  return v ? "Yes" : "No";
}

function groupByDept(items: CatalogItem[]): Map<InventoryDept, CatalogItem[]> {
  const grouped = new Map<InventoryDept, CatalogItem[]>();
  for (const dept of INVENTORY_DEPT_ORDER) grouped.set(dept, []);
  for (const item of items) grouped.get(item.dept)?.push(item);
  return grouped;
}

/** CSV export — one flat table, department is a leading column so the
 *  same file survives round-tripping through a spreadsheet without
 *  losing dept boundaries. */
export function exportInventoryCsv(bundle: InventoryExportBundle): void {
  const header = [
    "Department",
    "Item",
    "Required",
    "Quantity",
    "Prepared",
    "At Warehouse",
  ];
  const lines: string[] = [header.join(",")];
  const grouped = groupByDept(bundle.items);
  for (const dept of INVENTORY_DEPT_ORDER) {
    const items = grouped.get(dept) ?? [];
    for (const item of items) {
      const t = tickFor(bundle, item.id);
      lines.push(
        [
          INVENTORY_DEPT_LABEL[dept],
          item.name,
          bool(t.required),
          String(t.quantity),
          bool(t.prepared),
          bool(t.atWarehouse),
        ]
          .map(csvField)
          .join(","),
      );
    }
  }
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  const filename = `inventory-${safeFilename(bundle.displayTitle)}-${todayStamp()}.csv`;
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

/** PDF export — one table per department, matching the on-screen
 *  section grouping. Dynamically imports jsPDF so it stays out of the
 *  main bundle. */
export async function exportInventoryPdf(bundle: InventoryExportBundle): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default as unknown as (
    doc: unknown,
    options: Record<string, unknown>,
  ) => void;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text("Inventory checklist", 40, 40);
  doc.setFontSize(10);
  doc.text(`Event: ${bundle.displayTitle}`, 40, 60);
  const contextParts: string[] = [];
  if (bundle.clientName) contextParts.push(`Client: ${bundle.clientName}`);
  if (bundle.venue) contextParts.push(`Venue: ${bundle.venue}`);
  contextParts.push(`Booking: ${bundle.bookingId}`);
  doc.text(contextParts.join(" · "), 40, 76);
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 40, 92);

  let cursorY = 110;
  const grouped = groupByDept(bundle.items);
  for (const dept of INVENTORY_DEPT_ORDER) {
    const items = grouped.get(dept) ?? [];
    if (items.length === 0) continue;
    doc.setFontSize(12);
    doc.text(INVENTORY_DEPT_LABEL[dept], 40, cursorY);
    cursorY += 8;
    autoTable(doc, {
      startY: cursorY,
      head: [["Item", "Required", "Qty", "Prepared", "At Warehouse"]],
      body: items.map((item) => {
        const t = tickFor(bundle, item.id);
        return [item.name, bool(t.required), String(t.quantity), bool(t.prepared), bool(t.atWarehouse)];
      }),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [50, 60, 80], textColor: 255 },
      margin: { left: 40, right: 40 },
    });
    // jspdf-autotable stashes its final Y on the doc after each call.
    cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 24;
  }

  const filename = `inventory-${safeFilename(bundle.displayTitle)}-${todayStamp()}.pdf`;
  doc.save(filename);
}
