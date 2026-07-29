import type { EventConcept } from "./types";
import { calculateStaffing, formatDayDate } from "./roster-calc";
import { formatBND } from "./utils";
import { EVENT_STATUSES } from "./constants";

/**
 * Generate a styled single-event PDF summary and trigger a browser download.
 * Uses jsPDF + jspdf-autotable (loaded dynamically so they stay out of the
 * main bundle).
 */
export async function exportEventPDF(event: EventConcept, opts?: { includeBudget?: boolean }) {
  const includeBudget = opts?.includeBudget ?? true;
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // ─── Header band ────────────────────────────────────────────────────────
  doc.setFillColor(11, 42, 74); // signal-800
  doc.rect(0, 0, pageW, 80, "F");
  doc.setTextColor(255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("KRISTAL MEDIA · KEMS", margin, 32);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Event Summary", margin, 58);

  // Right-aligned ref no. + status
  doc.setFontSize(9);
  doc.setFont("courier", "bold");
  doc.text(event.s1.eventRefNo, pageW - margin, 32, { align: "right" });
  const statusLabel = EVENT_STATUSES.find((s) => s.value === event.status)?.label ?? event.status;
  doc.setFont("helvetica", "normal");
  doc.text(`Status: ${statusLabel}`, pageW - margin, 58, { align: "right" });

  // ─── Title block ────────────────────────────────────────────────────────
  let y = 108;
  doc.setTextColor(30);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  const title = event.s1.eventName || "Untitled event";
  const titleLines = doc.splitTextToSize(title, pageW - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 20 + 4;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  const meta: string[] = [];
  if (event.category) meta.push(`Category: ${event.category}`);
  if (event.s2.classification) {
    meta.push(
      event.s2.classification === "COMMERCIAL"
        ? "Commercial / Paid"
        : "Community / CSR"
    );
  }
  if (event.priority) meta.push(`Priority: ${event.priority}`);
  doc.text(meta.join("  ·  "), margin, y);
  y += 24;

  // ─── General information table ──────────────────────────────────────────
  const info: [string, string][] = [
    ["Venue", event.s1.venue || "—"],
    ["Organiser", event.s1.conceptPreparedBy || "—"],
    ["Concept date", event.s1.conceptDate || "—"],
    ["Expected attendance", String(event.s1.expectedAttendance ?? "—")],
  ];
  if (event.s1.startDate) info.push(["Start", new Date(event.s1.startDate).toLocaleString("en-GB")]);
  if (event.s1.endDate) info.push(["End", new Date(event.s1.endDate).toLocaleString("en-GB")]);

  autoTable(doc, {
    startY: y,
    head: [["General information", ""]],
    body: info,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 5, textColor: 40 },
    headStyles: { fillColor: [232, 236, 244], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 140, fontStyle: "bold" }, 1: { cellWidth: pageW - margin * 2 - 140 } },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error jspdf-autotable augments the doc with lastAutoTable
  y = doc.lastAutoTable.finalY + 16;

  // ─── Concept & objectives ───────────────────────────────────────────────
  if (event.s3?.description) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30);
    doc.text("Concept & Objectives", margin, y);
    y += 14;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(event.s3.description, pageW - margin * 2);
    // Guard against very long descriptions overflowing the page
    const maxLines = 20;
    const shown = lines.slice(0, maxLines);
    doc.text(shown, margin, y);
    y += shown.length * 11 + 4;
    if (lines.length > maxLines) {
      doc.setTextColor(150);
      doc.text(`(${lines.length - maxLines} more lines omitted)`, margin, y);
      y += 14;
    }
    y += 8;
  }

  // ─── Broadcast schedule ─────────────────────────────────────────────────
  if (event.s8?.schedule && event.s8.schedule.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Broadcast day", "Time slots"]],
      body: event.s8.schedule.map((d) => [
        formatDayDate(d.date),
        d.slots.map((s) => `${s.start}–${s.end}`).join(",  "),
      ]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 5, textColor: 40 },
      headStyles: { fillColor: [232, 236, 244], textColor: 20, fontStyle: "bold" },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error jspdf-autotable
    y = doc.lastAutoTable.finalY + 16;
  }

  // ─── Staff + budget ─────────────────────────────────────────────────────
  const staffing = calculateStaffing(event.s5.staff ?? []);
  if ((event.s5.staff ?? []).length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Role", "Count", "Confirmed", "Roster"]],
      body: (event.s5.staff ?? []).map((s) => [
        s.role || "—",
        String(s.count ?? 0),
        s.confirmed ? "Yes" : "No",
        `${(s.rosterSlots ?? []).length} shift(s)`,
      ]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 5, textColor: 40 },
      headStyles: { fillColor: [232, 236, 244], textColor: 20, fontStyle: "bold" },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error jspdf-autotable
    y = doc.lastAutoTable.finalY + 16;
  }

  if (includeBudget) {
    const manualEst = event.s6.costs.reduce((s, c) => s + c.estimatedBND, 0);
    const grandEst = manualEst + staffing.overtimeBND + staffing.mealAllowanceBND;
    autoTable(doc, {
      startY: y,
      head: [["Budget summary", "BND"]],
      body: [
        ["Manual costs", formatBND(manualEst)],
        ["Overtime (auto from roster)", formatBND(staffing.overtimeBND)],
        ["Meal allowance (auto from roster)", formatBND(staffing.mealAllowanceBND)],
        ["Grand total (est.)", formatBND(grandEst)],
      ],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 5, textColor: 40 },
      headStyles: { fillColor: [232, 236, 244], textColor: 20, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error jspdf-autotable
    y = doc.lastAutoTable.finalY + 16;
  }

  // ─── Sign-off ───────────────────────────────────────────────────────────
  if ((event.s11.entries ?? []).length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Approver", "Name", "Signed at"]],
      body: event.s11.entries.map((e) => [
        e.role.replaceAll("_", " "),
        e.name || "—",
        e.signedAt ? new Date(e.signedAt).toLocaleString("en-GB") : "—",
      ]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 5, textColor: 40 },
      headStyles: { fillColor: [232, 236, 244], textColor: 20, fontStyle: "bold" },
      margin: { left: margin, right: margin },
    });
  }

  // ─── Footer ─────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `Generated ${new Date().toLocaleString("en-GB")} · KEMS · page ${i} of ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" }
    );
  }

  // Safe filename
  const safeName = (event.s1.eventName || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  doc.save(`${event.s1.eventRefNo}_${safeName || "event"}.pdf`);
}
