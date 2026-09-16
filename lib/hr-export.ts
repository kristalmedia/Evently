/**
 * PDF + CSV export helpers for the HR block. Both run client-side so
 * the browser can trigger the download without a server round-trip.
 *
 * jsPDF + jspdf-autotable are dynamically imported to keep them out of
 * the shared JS bundle — HR is a small fraction of visitors and neither
 * lib is small.
 */

export interface HrExportRow {
  /** "meal" or "overtime" — routed into different tables in the PDF. */
  kind: "meal" | "overtime";
  dept: string;
  staff: string;
  date: string;
  shift: string;
  amount: number;
  notes?: string;
}

export interface HrExportBundle {
  bookingId: string;
  displayTitle: string;
  clientName: string;
  venue: string;
  meal: HrExportRow[];
  overtime: HrExportRow[];
  mealTotal: number;
  overtimeTotal: number;
}

function formatBND(n: number): string {
  return `BND ${n.toFixed(2)}`;
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Escape one CSV field. Wraps in double-quotes when the value carries
 *  a comma, quote or newline; doubles any embedded quotes per RFC 4180. */
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
  // Revoke on the next tick — some browsers race the click.
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

export function exportHrCsv(bundle: HrExportBundle): void {
  const rows: string[] = [];
  // Header block — a small metadata frontmatter so the file is readable
  // by a human opening it directly, before the tabular section starts.
  rows.push(
    `HR summary — ${bundle.displayTitle} (${bundle.bookingId})`,
  );
  rows.push(`Client,${csvField(bundle.clientName)}`);
  rows.push(`Venue,${csvField(bundle.venue)}`);
  rows.push("");
  rows.push("Kind,Department,Staff,Date,Shift,Amount (BND),Notes");
  for (const r of [...bundle.meal, ...bundle.overtime]) {
    // OT rows with amount == 0 print as blank Notes / Amount cells —
    // those are handwritten fields on the paired PDF, not empty data.
    const isBlankOtRow = r.kind === "overtime" && r.amount === 0;
    rows.push(
      [
        r.kind,
        r.dept,
        r.staff,
        r.date,
        r.shift,
        isBlankOtRow ? "" : r.amount.toFixed(2),
        isBlankOtRow ? "" : (r.notes ?? ""),
      ]
        .map(csvField)
        .join(","),
    );
  }
  rows.push("");
  rows.push(`Meal allowance total,,,,,${bundle.mealTotal.toFixed(2)}`);
  rows.push(`Overtime total,,,,,(handwritten on PDF)`);

  const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  download(blob, `hr-${bundle.bookingId}-${todayStamp()}.csv`);
}

export async function exportHrPdf(bundle: HrExportBundle): Promise<void> {
  // Dynamic imports — heavy libs, only loaded when HR clicks Export.
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("HR — Overtime & Meal Allowance", 40, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(bundle.displayTitle, 40, 66);
  doc.text(`Booking ${bundle.bookingId}`, 40, 80);
  doc.text(`Client: ${bundle.clientName}   Venue: ${bundle.venue}`, 40, 94);
  doc.text(
    `Generated ${new Date().toLocaleString("en-GB")}`,
    pageWidth - 40,
    94,
    { align: "right" },
  );

  let cursorY = 120;

  // Meal allowance table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Meal allowance", 40, cursorY);
  cursorY += 8;
  autoTable(doc, {
    startY: cursorY,
    head: [["Dept", "Staff", "Date", "Shift", "Amount (BND)"]],
    body:
      bundle.meal.length === 0
        ? [["—", "No entries", "—", "—", "0.00"]]
        : bundle.meal.map((r) => [
            r.dept,
            r.staff,
            r.date,
            r.shift,
            r.amount.toFixed(2),
          ]),
    foot: [["", "", "", "Total", bundle.mealTotal.toFixed(2)]],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [23, 37, 84] },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursorY = (doc as any).lastAutoTable.finalY + 24;

  // Overtime table — printed as a fillable form. Notes and Amount
  // cells are intentionally BLANK when amount == 0 so HR can write
  // the values by hand on the printed page. Cells are also given a
  // taller row height for pen legibility.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Overtime (IT & Technical) — fill by hand", 40, cursorY);
  cursorY += 8;
  autoTable(doc, {
    startY: cursorY,
    head: [["Dept", "Staff", "Date", "Shift", "Notes", "Amount (BND)"]],
    body:
      bundle.overtime.length === 0
        ? [["—", "No IT / Technical shifts on roster", "", "", "", ""]]
        : bundle.overtime.map((r) => [
            r.dept,
            r.staff,
            r.date,
            r.shift,
            r.amount > 0 ? (r.notes ?? "") : "",
            r.amount > 0 ? r.amount.toFixed(2) : "",
          ]),
    styles: { fontSize: 9, cellPadding: 8, minCellHeight: 22 },
    headStyles: { fillColor: [23, 37, 84] },
    columnStyles: {
      4: { cellWidth: 180 },
      5: { cellWidth: 80, halign: "right" },
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursorY = (doc as any).lastAutoTable.finalY + 24;

  // Grand total — meal only, since OT amounts are filled in by hand
  // and aren't known at export time.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(
    `Meal allowance total: ${formatBND(bundle.mealTotal)}`,
    40,
    cursorY,
  );
  cursorY += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Overtime total: __________ (sum by hand after filling amounts above)",
    40,
    cursorY,
  );

  doc.save(`hr-${bundle.bookingId}-${todayStamp()}.pdf`);
}
