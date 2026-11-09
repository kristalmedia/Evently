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
  /** Event's own date range (StartDate/EndDate from the Sales sheet).
   *  Passed as raw strings and printed verbatim — the caller handles
   *  any normalisation. Both optional so a booking without a locked-in
   *  date range still exports (shows "TBC" in the header). */
  startDate?: string;
  endDate?: string;
  /** UI-side event status tag ("Upcoming", "Confirmed", etc). Comes
   *  from the EventStatus derived by mapKotgBookingToEventStatus; the
   *  caller formats to display text. */
  statusLabel?: string;
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

/** CSV export — one flat row per catalog item. Every row carries the
 *  event's own context (name, dates, department) as leading columns, so
 *  the file survives being merged with other events' exports in a
 *  spreadsheet without losing which event each row belongs to. */
export function exportInventoryCsv(bundle: InventoryExportBundle): void {
  const header = [
    "Event Name",
    "Start Date",
    "End Date",
    "Department",
    "Item",
    "Required",
    "Quantity",
    "Prepared",
    "At Warehouse",
  ];
  const lines: string[] = [header.join(",")];
  const grouped = groupByDept(bundle.items);
  const start = bundle.startDate?.trim() || "TBC";
  const end = bundle.endDate?.trim() || "TBC";
  for (const dept of INVENTORY_DEPT_ORDER) {
    const items = grouped.get(dept) ?? [];
    for (const item of items) {
      const t = tickFor(bundle, item.id);
      lines.push(
        [
          bundle.displayTitle,
          start,
          end,
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

/** PDF export — event header + one table per department + sign-off
 *  block at the bottom. Dynamically imports jsPDF so it stays out of
 *  the main bundle. */
export async function exportInventoryPdf(bundle: InventoryExportBundle): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default as unknown as (
    doc: unknown,
    options: Record<string, unknown>,
  ) => void;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = (doc.internal.pageSize as unknown as { width: number }).width;
  const pageHeight = (doc.internal.pageSize as unknown as { height: number }).height;

  // ── Header: event title + metadata in a two-column layout ─────────────
  doc.setFontSize(16);
  doc.text("Inventory Checklist", 40, 40);
  doc.setFontSize(10);
  doc.text(`Event: ${bundle.displayTitle}`, 40, 60);

  // Metadata rows — each key/value pair as "Label: Value" so a user
  // skimming the PDF can pick out the booking id / dates at a glance.
  const start = bundle.startDate?.trim() || "TBC";
  const end = bundle.endDate?.trim() || "TBC";
  const metaRows: string[] = [
    `Dates: ${start} → ${end}`,
    `Booking: ${bundle.bookingId}`,
  ];
  if (bundle.statusLabel) metaRows.splice(0, 0, `Status: ${bundle.statusLabel}`);
  if (bundle.clientName) metaRows.push(`Client: ${bundle.clientName}`);
  if (bundle.venue) metaRows.push(`Venue: ${bundle.venue}`);
  let headerY = 76;
  for (const row of metaRows) {
    doc.text(row, 40, headerY);
    headerY += 14;
  }
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 40, headerY + 4);
  doc.setTextColor(0);

  let cursorY = headerY + 28;
  const grouped = groupByDept(bundle.items);
  for (const dept of INVENTORY_DEPT_ORDER) {
    const items = grouped.get(dept) ?? [];
    if (items.length === 0) continue;
    doc.setFontSize(12);
    doc.text(INVENTORY_DEPT_LABEL[dept], 40, cursorY);
    cursorY += 8;
    autoTable(doc, {
      startY: cursorY,
      head: [["Item", "Required", "Qty", "Prepared", "At Warehouse", "Notes"]],
      body: items.map((item) => {
        const t = tickFor(bundle, item.id);
        return [
          item.name,
          bool(t.required),
          String(t.quantity),
          bool(t.prepared),
          bool(t.atWarehouse),
          "",
        ];
      }),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [50, 60, 80], textColor: 255 },
      columnStyles: { 5: { minCellHeight: 22 } },
      margin: { left: 40, right: 40 },
    });
    // jspdf-autotable stashes its final Y on the doc after each call.
    cursorY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 24;
  }

  // ── Sign-off block pinned to the bottom of the current page ─────────────
  // Two signature slots side-by-side so a dept lead + a Super Admin can
  // both counter-sign a paper copy. If the inventory tables push the
  // cursor past the sign-off region, start a new page for it.
  const signOffHeight = 90;
  if (cursorY + signOffHeight > pageHeight - 60) {
    doc.addPage();
    cursorY = 60;
  } else {
    cursorY = pageHeight - 60 - signOffHeight;
  }
  doc.setDrawColor(200);
  doc.line(40, cursorY, pageWidth - 40, cursorY);
  cursorY += 16;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text("Sign-off", 40, cursorY);
  cursorY += 18;
  // Two columns: Prepared by (left) / Approved by (right)
  const colWidth = (pageWidth - 80 - 40) / 2;
  const leftX = 40;
  const rightX = 40 + colWidth + 40;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Prepared by", leftX, cursorY);
  doc.text("Approved by", rightX, cursorY);
  cursorY += 32;
  doc.setDrawColor(100);
  doc.line(leftX, cursorY, leftX + colWidth, cursorY);
  doc.line(rightX, cursorY, rightX + colWidth, cursorY);
  cursorY += 12;
  doc.setFontSize(8);
  doc.text("Name & signature", leftX, cursorY);
  doc.text("Name & signature", rightX, cursorY);
  cursorY += 10;
  doc.text("Date: ____________________", leftX, cursorY);
  doc.text("Date: ____________________", rightX, cursorY);
  doc.setTextColor(0);

  const filename = `inventory-${safeFilename(bundle.displayTitle)}-${todayStamp()}.pdf`;
  doc.save(filename);
}

// ─── Per-department catalog export ────────────────────────────────────────
// Used by the /inventory catalog page's per-dept "Save CSV / Save PDF"
// buttons. Scope is just the master item list for one dept (name +
// quantity) — NOT per-event ticks. Separate from the per-event bundle
// above so the two exports don't drift as either side's columns evolve.

/** CSV export of one department's catalog. Includes every item (seed +
 *  custom) — the earlier seed-only exclusion was reverted after it left
 *  most depts with nothing to export, since the catalog is mostly seed
 *  data. Columns: Item, Quantity, Type (Seed / Custom), Last updated. */
export function exportDeptCatalogCsv(dept: InventoryDept, items: CatalogItem[]): void {
  const header = ["Item", "Quantity", "Type", "Last updated"];
  const lines: string[] = [header.join(",")];
  for (const item of items) {
    lines.push(
      [
        item.name,
        String(item.quantity),
        item.isSeed ? "Seed" : "Custom",
        item.updatedAt,
      ]
        .map(csvField)
        .join(","),
    );
  }
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  const filename = `evently-inventory-${safeFilename(INVENTORY_DEPT_LABEL[dept])}-${todayStamp()}.csv`;
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

/** PDF export of one department's catalog. Mirrors the CSV columns.
 *  Dynamically imports jsPDF to stay out of the shared bundle. */
export async function exportDeptCatalogPdf(
  dept: InventoryDept,
  items: CatalogItem[],
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default as unknown as (
    doc: unknown,
    options: Record<string, unknown>,
  ) => void;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text(`${INVENTORY_DEPT_LABEL[dept]} inventory catalog`, 40, 40);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 40, 60);
  doc.text(`${items.length} item${items.length === 1 ? "" : "s"}`, 40, 76);

  autoTable(doc, {
    startY: 96,
    head: [["Item", "Quantity", "Type", "Last updated"]],
    body: items.map((item) => [
      item.name,
      String(item.quantity),
      item.isSeed ? "Seed" : "Custom",
      new Date(item.updatedAt).toLocaleDateString("en-GB"),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [50, 60, 80], textColor: 255 },
    margin: { left: 40, right: 40 },
  });

  const filename = `evently-inventory-${safeFilename(INVENTORY_DEPT_LABEL[dept])}-${todayStamp()}.pdf`;
  doc.save(filename);
}
