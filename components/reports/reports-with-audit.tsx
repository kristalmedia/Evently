"use client";

import { useState } from "react";
import { BarChart3, FileSpreadsheet, FileText, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportsView, type ReportRow } from "./reports-view";
import { Callsign } from "@/components/shared/broadcast-marks";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import type { AuditEntry } from "@/lib/types";

const AUDIT_LABEL: Record<AuditEntry["kind"], string> = {
  EVENT_CREATED: "Event created",
  EVENT_EDITED: "Event edited",
  DRAFT_SAVED: "Draft saved",
  EVENT_CANCELLED: "Event cancelled",
  EVENT_ARCHIVED: "Event archived",
  EVENT_DELETED: "Event deleted",
  APPROVAL_GRANTED: "Approval granted",
  APPROVAL_DENIED: "Approval denied",
  STATUS_CHANGED: "Status changed",
  USER_UPDATED: "User updated",
  USER_INVITED: "User invited",
  ATTACHMENT_UPLOADED: "Attachment uploaded",
  ATTACHMENT_DOWNLOADED: "Attachment downloaded",
  ATTACHMENT_DELETED: "Attachment deleted",
};

const AUDIT_TONE: Partial<Record<AuditEntry["kind"], string>> = {
  APPROVAL_GRANTED: "text-emerald-600 dark:text-emerald-400",
  APPROVAL_DENIED: "text-rose-600 dark:text-rose-400",
  EVENT_DELETED: "text-rose-600 dark:text-rose-400",
  EVENT_CANCELLED: "text-amber-600 dark:text-amber-400",
};

export function ReportsWithAudit({
  rows,
  showBudget,
  auditEntries,
}: {
  rows: ReportRow[];
  showBudget: boolean;
  auditEntries: AuditEntry[];
}) {
  const [tab, setTab] = useState<"events" | "audit">("events");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <TabButton
          active={tab === "events"}
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          onClick={() => setTab("events")}
        >
          Event analytics
        </TabButton>
        <TabButton
          active={tab === "audit"}
          icon={<History className="h-3.5 w-3.5" />}
          onClick={() => setTab("audit")}
        >
          Audit log
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-mono">
            {auditEntries.length}
          </span>
        </TabButton>
      </div>

      {tab === "events" ? (
        <ReportsView rows={rows} showBudget={showBudget} />
      ) : (
        <AuditLog entries={auditEntries} />
      )}
    </div>
  );
}

function TabButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-accent text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function AuditLog({ entries }: { entries: AuditEntry[] }) {
  function exportCSV() {
    const headers = ["Timestamp", "Kind", "Actor", "Email", "Event Ref", "Details"];
    const csvRows = entries.map((e) => [
      e.createdAt,
      AUDIT_LABEL[e.kind],
      e.actorName,
      e.actorEmail,
      e.eventRefNo ?? "",
      e.details ?? "",
    ]);
    const escape = (v: string) => {
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const csv = [headers, ...csvRows]
      .map((row) => row.map((c) => escape(String(c))).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kems-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${entries.length} audit entries to CSV`);
  }

  async function exportPDF() {
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text("Kristal Media — Audit Log", 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(
        `Generated ${new Date().toLocaleString("en-GB")} · ${entries.length} entries`,
        40,
        58
      );
      autoTable(doc, {
        startY: 72,
        head: [["Timestamp", "Kind", "Actor", "Event", "Details"]],
        body: entries.map((e) => [
          new Date(e.createdAt).toLocaleString("en-GB"),
          AUDIT_LABEL[e.kind],
          `${e.actorName}\n${e.actorEmail}`,
          e.eventRefNo ?? "—",
          e.details ?? "",
        ]),
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 4 },
        headStyles: { fillColor: [11, 42, 74], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
      doc.save(`kems-audit-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(`Exported ${entries.length} audit entries to PDF`);
    } catch (err) {
      toast.error("PDF export failed");
      console.error(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Every event action, approval, denial, and user edit — captured in order.
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button variant="accent" size="sm" onClick={exportPDF} className="gap-2">
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">Timestamp</TableHead>
                <TableHead className="w-[160px]">Kind</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="hidden md:table-cell">Event ref</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No audit entries yet. Create, edit, or approve an event to
                    populate the log.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${AUDIT_TONE[e.kind] ?? ""}`}>
                        {AUDIT_LABEL[e.kind]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{e.actorName}</div>
                      <div className="text-[0.7rem] font-mono text-muted-foreground">
                        {e.actorEmail}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {e.eventRefNo ? <Callsign value={e.eventRefNo} /> : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.details ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
