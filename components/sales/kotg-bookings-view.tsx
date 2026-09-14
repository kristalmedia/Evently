"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import type { KotgBookingWithClient } from "@/lib/google-sheets-types";

export function KotgBookingsView({
  initialBookings,
  initialError,
}: {
  initialBookings: KotgBookingWithClient[];
  initialError: string | null;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [error, setError] = useState(initialError);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/integrations/kotg-bookings?refresh=1", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to refresh");
      setBookings(data.bookings);
      setLastFetchedAt(data.fetchedAt);
      setError(null);
      toast.success(`Refreshed — ${data.bookings.length} bookings`, {
        position: "bottom-center",
      });
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return bookings;
    return bookings.filter(({ booking, client }) => {
      const haystack = [
        booking.ServiceName,
        booking.BookingID,
        booking.QuotationNumber,
        booking.ContactPersonName,
        client?.ClientName,
        client?.CompanyName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [q, bookings]);

  const missingClientCount = bookings.filter((b) => !b.client).length;

  if (error && bookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <div className="text-sm font-medium">Couldn't load bookings</div>
              <div className="text-xs text-muted-foreground break-words">{error}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search service, client, quotation…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {missingClientCount > 0 && (
            <Badge variant="amber" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {missingClientCount} unmatched client{missingClientCount === 1 ? "" : "s"}
            </Badge>
          )}
          <span className="text-xs callsign">
            {filtered.length} of {bookings.length}
          </span>
          <Button variant="outline" size="sm" className="gap-2" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          Last refresh failed ({error}) — showing the most recently loaded data.
        </div>
      )}
      {lastFetchedAt && (
        <div className="text-[0.7rem] text-muted-foreground">
          Last refreshed {new Date(lastFetchedAt).toLocaleTimeString("en-GB")}
        </div>
      )}

      {bookings.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No KOTG bookings found"
          description='No ServiceBookings rows have Category = "KRISTAL On The Go" right now.'
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="hidden lg:table-cell">Dates</TableHead>
                    <TableHead className="hidden sm:table-cell">Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        No bookings match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(({ booking, client }) => (
                      <TableRow key={booking.BookingID}>
                        <TableCell>
                          <div className="font-medium">{booking.ServiceName || "—"}</div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {booking.BookingID}
                            {booking.QuotationNumber && ` · ${booking.QuotationNumber}`}
                          </div>
                        </TableCell>
                        <TableCell>
                          {client ? (
                            <div>
                              <div className="font-medium">{client.ClientName || "—"}</div>
                              {client.CompanyName && (
                                <div className="text-xs text-muted-foreground">{client.CompanyName}</div>
                              )}
                            </div>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                              title={`ClientID "${booking.ClientID}" not found in Clients sheet`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Unmatched ({booking.ClientID || "no ID"})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {booking.ContactPersonName || client?.ContactPerson || "—"}
                          {(booking.ContactPersonEmail || client?.Email) && (
                            <div className="text-xs font-mono">
                              {booking.ContactPersonEmail || client?.Email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                          {booking.StartDate || "—"}
                          {booking.EndDate && ` → ${booking.EndDate}`}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm font-mono">
                          {booking.Price || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant="outline">{booking.Status || "—"}</Badge>
                            {booking.ConfirmationStatus && (
                              <span className="text-[0.65rem] text-muted-foreground">
                                {booking.ConfirmationStatus}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
