"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, MapPin, RefreshCw, Search } from "lucide-react";
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

/** Sheet-Status values that should be hidden from the KOTG bookings
 *  view. Cancelled bookings still exist in the Sheet (Sales keeps them
 *  for audit) but Kristal Operations shouldn't see them mixed in with
 *  live work. Matched case-insensitively + trimmed. */
const HIDDEN_SHEET_STATUSES = new Set(["cancelled", "canceled"]);

/** Whether this viewer is allowed to see the Contact column. Kept
 *  narrow per the spec: Sales dept + Super Admin only — even CCM Admins
 *  (who can otherwise use the KOTG bookings page) don't see contact
 *  details, since those are the Sales team's client-owned surface. */
function canViewContact(dept: string, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || dept === "Sales";
}

export function KotgBookingsView({
  initialBookings,
  initialError,
  viewerDepartment,
  viewerIsSuperAdmin,
}: {
  initialBookings: KotgBookingWithClient[];
  initialError: string | null;
  /** User.department of the viewer — determines whether the Contact
   *  column is rendered. Passed from the server page so this component
   *  doesn't have to reach into the session store. */
  viewerDepartment: string;
  viewerIsSuperAdmin: boolean;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [error, setError] = useState(initialError);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const showContact = canViewContact(viewerDepartment, viewerIsSuperAdmin);

  // Bookings passed through the hidden-status filter once, at the top of
  // every render — every downstream count/list works from `visible`.
  const visible = useMemo(
    () =>
      bookings.filter(
        (b) => !HIDDEN_SHEET_STATUSES.has(b.booking.Status.trim().toLowerCase()),
      ),
    [bookings],
  );

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
      const visibleCount = (data.bookings as KotgBookingWithClient[]).filter(
        (b) => !HIDDEN_SHEET_STATUSES.has(b.booking.Status.trim().toLowerCase()),
      ).length;
      toast.success(`Refreshed — ${visibleCount} active bookings`, {
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
    if (!query) return visible;
    return visible.filter(({ booking, client }) => {
      const haystack = [
        booking.ServiceName,
        booking.BookingID,
        booking.QuotationNumber,
        // Contact only enters the search haystack for viewers allowed to
        // see it — otherwise search would leak contact hits to viewers
        // who can't see the column.
        showContact ? booking.ContactPersonName : undefined,
        booking.LocationDetails,
        client?.ClientName,
        client?.CompanyName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [q, visible, showContact]);

  const missingClientCount = visible.filter((b) => !b.client).length;

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
            {filtered.length} of {visible.length}
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

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No active KOTG bookings"
          description={
            bookings.length === 0
              ? 'No ServiceBookings rows have Category = "KRISTAL On The Go" right now.'
              : "Every KOTG booking is currently Cancelled — Sales keeps those for audit but they're hidden here."
          }
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
                    {showContact && (
                      <TableHead className="hidden md:table-cell">Contact</TableHead>
                    )}
                    <TableHead className="hidden lg:table-cell">Dates</TableHead>
                    <TableHead className="hidden sm:table-cell">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={showContact ? 7 : 6}
                        className="text-center py-12 text-muted-foreground"
                      >
                        No bookings match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(({ booking, client, customPackage }) => (
                      <TableRow key={booking.BookingID}>
                        <TableCell>
                          <div className="font-medium">
                            {/* Prefer the CustomPackage name over the (usually
                                empty) ServiceName when the booking uses a
                                custom package. Falls back to ServiceName then
                                em-dash. */}
                            {customPackage?.PackageName || booking.ServiceName || "—"}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {booking.BookingID}
                            {booking.QuotationNumber && ` · ${booking.QuotationNumber}`}
                          </div>
                          {booking.LocationDetails && (
                            <div className="mt-1 flex items-start gap-1 text-[0.68rem] text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="min-w-0 break-words">
                                {booking.LocationDetails}
                              </span>
                            </div>
                          )}
                          {customPackage && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className="rounded bg-signal-500/10 text-signal-500 px-1.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider">
                                Custom package
                              </span>
                              <span className="text-[0.68rem] text-muted-foreground">
                                Final: {customPackage.FinalPrice || customPackage.ComputedTotal || "—"}
                              </span>
                            </div>
                          )}
                          {/* Data-quality signal — same rule as the Client
                              column's unmatched badge but for packages. */}
                          {booking.CustomPackageID && !customPackage && (
                            <div
                              className="mt-1 inline-flex items-center gap-1 text-[0.68rem] text-amber-600 dark:text-amber-400"
                              title={`CustomPackageID "${booking.CustomPackageID}" not found in CustomPackages sheet`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Unmatched package
                            </div>
                          )}
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
                        {showContact && (
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {booking.ContactPersonName || client?.ContactPerson || "—"}
                            {(booking.ContactPersonEmail || client?.Email) && (
                              <div className="text-xs font-mono">
                                {booking.ContactPersonEmail || client?.Email}
                              </div>
                            )}
                          </TableCell>
                        )}
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
                        <TableCell className="text-right">
                          {/* Cross-link to the KEMS event detail page —
                              the /events/[id] route resolves BookingID
                              back to this Sheet row via the shadow store. */}
                          <Button asChild variant="ghost" size="sm" className="gap-1">
                            <Link href={`/events/${booking.BookingID}`}>
                              View details
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
