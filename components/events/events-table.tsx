"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpDown, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { OnAirPill, Callsign } from "@/components/shared/broadcast-marks";
import { EVENT_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { EventListRow, EventStatus } from "@/lib/types";

type SortKey = "title" | "startDate" | "status" | "priority";

export function EventsTable({ rows }: { rows: EventListRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<EventStatus | "ALL">("ALL");
  /** Month filter: "ALL" or "YYYY-MM". */
  const [month, setMonth] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Build the list of months present in the data — sorted newest first.
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (!r.startDate) continue;
      const d = new Date(r.startDate);
      if (Number.isNaN(d.getTime())) continue;
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(set).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = rows;
    if (status !== "ALL") list = list.filter((r) => r.status === status);
    if (month !== "ALL") {
      list = list.filter((r) => {
        if (!r.startDate) return false;
        const d = new Date(r.startDate);
        if (Number.isNaN(d.getTime())) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === month;
      });
    }
    if (query) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.refNo.toLowerCase().includes(query) ||
          r.venue.toLowerCase().includes(query) ||
          r.organizer.toLowerCase().includes(query)
      );
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else if (sortKey === "startDate")
        cmp = +new Date(a.startDate) - +new Date(b.startDate);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "priority") cmp = a.priority.localeCompare(b.priority);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [q, status, sortKey, sortDir, rows]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title, ref, venue, organiser…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as EventStatus | "ALL")}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {/* Cancelled bookings are filtered upstream — hiding the
                filter option too so nobody wonders where their filter
                choice went. Legacy statuses left in the taxonomy (see
                lib/constants.ts) still render for other consumers. */}
            {EVENT_STATUSES.filter((s) => s.value !== "CANCELLED").map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All months</SelectItem>
            {monthOptions.map((m) => {
              const [y, mm] = m.split("-");
              const label = new Date(+y, +mm - 1, 1).toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              });
              return (
                <SelectItem key={m} value={m}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs callsign">
          {filtered.length} of {rows.length}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  onClick={() => toggleSort("title")}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  Event <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">Venue</TableHead>
              <TableHead className="hidden lg:table-cell">Organiser</TableHead>
              <TableHead>
                <button
                  onClick={() => toggleSort("startDate")}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  Date <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => toggleSort("status")}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  Status <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                <button
                  onClick={() => toggleSort("priority")}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  Priority <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No events match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/events/${row.id}`} className="block space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.title}</span>
                        {row.isLive && <OnAirPill />}
                      </div>
                      <Callsign value={row.refNo} />
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate">{row.venue}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {row.organizer}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(row.startDate)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <PriorityBadge priority={row.priority} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm" className="gap-1">
                      <Link href={`/events/${row.id}`}>
                        View
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}
