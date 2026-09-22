"use client";

import Link from "next/link";
import { CalendarClock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CATEGORY_COLOR, CATEGORY_COLOR_UNSET } from "@/lib/constants";
import type { EventStatus } from "@/lib/types";

/**
 * Same shape as EventsCalendar's CalendarItem, but with `start` optional
 * because these bookings don't have a StartDate yet — that's why they can't
 * live inside FullCalendar and need their own strip above it.
 */
export interface UnscheduledItem {
  id: string;
  title: string;
  status: EventStatus;
  category?: string;
  venue?: string;
}

function colorFor(category?: string): string {
  return (category && CATEGORY_COLOR[category]) || CATEGORY_COLOR_UNSET;
}

function readableTextColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? "#111827" : "#ffffff";
}

export function UnscheduledBookingsStrip({ items }: { items: UnscheduledItem[] }) {
  if (items.length === 0) return null;

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <span className="callsign">Unscheduled bookings</span>
        <span className="ml-auto text-[0.7rem] font-mono text-muted-foreground">
          {items.length} without a start date
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        These KOTG bookings are Active in the Sales sheet but don&apos;t have a
        start date yet, so the calendar can&apos;t place them. Open one to add
        a date, or ask the Sales team to fill the StartDate column.
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const color = colorFor(item.category);
          return (
            <Link
              key={item.id}
              href={`/events/${item.id}`}
              className="group inline-flex max-w-full items-center gap-2 rounded-full border pl-2 pr-3 py-1.5 text-xs bg-background hover:bg-secondary transition-colors"
              style={{ borderLeftColor: color, borderLeftWidth: 4 }}
              title={item.venue ? `${item.title} · ${item.venue}` : item.title}
            >
              {item.category && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium"
                  style={{ backgroundColor: color, color: readableTextColor(color) }}
                >
                  {item.category}
                </span>
              )}
              <span className="truncate max-w-[240px] font-medium">
                {item.title}
              </span>
              {item.venue && (
                <span className="hidden sm:inline-flex items-center gap-1 text-muted-foreground min-w-0">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[160px]">{item.venue}</span>
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
