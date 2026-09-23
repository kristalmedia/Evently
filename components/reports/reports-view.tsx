"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { Callsign } from "@/components/shared/broadcast-marks";
import { EVENT_STATUSES } from "@/lib/constants";
import { formatBND } from "@/lib/utils";
import type { EventClassification, EventPriority, EventStatus } from "@/lib/types";

export interface ReportRow {
  id: string;
  refNo: string;
  title: string;
  venue: string;
  category: string;
  startDate: string;
  endDate: string;
  status: EventStatus;
  priority: EventPriority;
  classification: EventClassification;
  attendance: number | null;
  estCostBND?: number;
  actCostBND?: number;
  overtimeBND?: number;
  mealAllowanceBND?: number;
}

export function ReportsView({
  rows,
  showBudget,
}: {
  rows: ReportRow[];
  showBudget: boolean;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<EventStatus | "ALL">("ALL");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (!query) return true;
      return (
        r.title.toLowerCase().includes(query) ||
        r.refNo.toLowerCase().includes(query) ||
        r.venue.toLowerCase().includes(query) ||
        r.category.toLowerCase().includes(query)
      );
    });
  }, [q, status, rows]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const live = filtered.filter((r) => r.status === "ONGOING").length;
    const upcoming = filtered.filter(
      (r) => r.status === "UPCOMING" || r.status === "APPROVED"
    ).length;
    const commercial = filtered.filter((r) => r.classification === "COMMERCIAL").length;
    return { total, live, upcoming, commercial };
  }, [filtered]);

  function exportCSV() {
    const headers = [
      "Ref no",
      "Title",
      "Venue",
      "Category",
      "Classification",
      "Start",
      "End",
      "Status",
      "Priority",
      "Attendance",
      ...(showBudget
        ? [
            "Est. total (BND)",
            "Actual total (BND)",
            "Overtime (BND)",
            "Meal allowance (BND)",
          ]
        : []),
    ];
    const csvRows = filtered.map((r) => {
      const base = [
        r.refNo,
        r.title,
        r.venue,
        r.category,
        r.classification,
        r.startDate,
        r.endDate,
        r.status,
        r.priority,
        r.attendance ?? "",
      ];
      if (showBudget) {
        base.push(
          r.estCostBND?.toFixed(2) ?? "",
          r.actCostBND?.toFixed(2) ?? "",
          r.overtimeBND?.toFixed(2) ?? "",
          r.mealAllowanceBND?.toFixed(2) ?? ""
        );
      }
      return base;
    });

    const escape = (v: string | number) => {
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const csv = [headers, ...csvRows]
      .map((row) => row.map(escape).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evently-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} rows to CSV`);
  }

  async function exportPDF() {
    try {
      // Dynamic import — keeps jsPDF out of the main bundle
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

      doc.setFontSize(16);
      doc.text("Kristal Media — Events Report", 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(
        `Generated ${new Date().toLocaleString("en-GB")} · ${filtered.length} events`,
        40,
        58
      );

      const head: string[] = [
        "Ref",
        "Title",
        "Venue",
        "Category",
        "Class.",
        "Start",
        "Status",
        "Attend.",
      ];
      if (showBudget) head.push("Est. total", "Overtime", "Meals");

      const body = filtered.map((r) => {
        const base: (string | number)[] = [
          r.refNo,
          r.title,
          r.venue,
          r.category,
          r.classification === "COMMERCIAL" ? "Comm." : "CSR",
          r.startDate,
          r.status,
          r.attendance ?? "—",
        ];
        if (showBudget) {
          base.push(
            r.estCostBND != null ? formatBND(r.estCostBND) : "—",
            r.overtimeBND != null ? formatBND(r.overtimeBND) : "—",
            r.mealAllowanceBND != null ? formatBND(r.mealAllowanceBND) : "—"
          );
        }
        return base;
      });

      autoTable(doc, {
        startY: 72,
        head: [head],
        body,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [11, 42, 74], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      doc.save(`evently-events-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(`Exported ${filtered.length} rows to PDF`);
    } catch (err) {
      toast.error("PDF export failed — check the console");
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Events" value={summary.total} />
        <SummaryTile label="Live now" value={summary.live} tone="onair" />
        <SummaryTile label="Upcoming" value={summary.upcoming} tone="accent" />
        <SummaryTile label="Commercial" value={summary.commercial} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as EventStatus | "ALL")}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {EVENT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
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

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead className="hidden md:table-cell">Venue</TableHead>
                <TableHead className="hidden lg:table-cell">Start</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Priority</TableHead>
                {showBudget && (
                  <TableHead className="text-right">Est. total (BND)</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showBudget ? 6 : 5} className="text-center py-12 text-muted-foreground">
                    Nothing to show.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{r.title}</div>
                        <Callsign value={r.refNo} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {r.venue}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {r.startDate}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <PriorityBadge priority={r.priority} />
                    </TableCell>
                    {showBudget && (
                      <TableCell className="text-right font-mono text-sm">
                        {r.estCostBND != null ? formatBND(r.estCostBND) : "—"}
                      </TableCell>
                    )}
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

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "accent" | "onair";
}) {
  const cls =
    tone === "accent"
      ? "text-accent"
      : tone === "onair"
        ? "text-onair"
        : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-5 space-y-2">
      <div className="callsign">{label}</div>
      <div className={`text-3xl font-semibold tracking-tight ${cls}`}>
        {value}
      </div>
    </div>
  );
}
