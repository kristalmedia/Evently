"use client";

import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Card } from "@/components/ui/card";
import { CATEGORY_COLOR, CATEGORY_COLOR_UNSET, DEFAULT_CATEGORIES } from "@/lib/constants";
import type { EventStatus } from "@/lib/types";

interface CalendarItem {
  id: string;
  title: string;
  start: string;
  end?: string;
  url?: string;
  status: EventStatus;
  category?: string;
}

function colorFor(category?: string): string {
  return (category && CATEGORY_COLOR[category]) || CATEGORY_COLOR_UNSET;
}

export function EventsCalendar({ events }: { events: CalendarItem[] }) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    setIsMobile(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  return (
    <Card className="p-2 sm:p-4 overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[320px]">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={
              isMobile
                ? { left: "prev,next", center: "title", right: "today" }
                : {
                    left: "prev,next today",
                    center: "title",
                    right: "dayGridMonth,timeGridWeek,timeGridDay",
                  }
            }
            events={events.map((e) => {
              const color = colorFor(e.category);
              return {
                id: e.id,
                title: e.title,
                start: e.start,
                end: e.end,
                url: e.url,
                backgroundColor: color,
                borderColor: color,
                textColor: readableTextColor(color),
              };
            })}
            height="auto"
            firstDay={1}
            eventDisplay="block"
            dayMaxEvents={isMobile ? 1 : 3}
            titleFormat={{ year: "numeric", month: isMobile ? "short" : "long" }}
          />
        </div>
      </div>

      {/* Category legend — pairs the swatches with their labels so viewers
          can decode the calendar without hovering every event. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 text-xs">
        <span className="callsign">Category</span>
        {DEFAULT_CATEGORIES.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: c.color }}
            />
            <span className="text-muted-foreground">{c.name}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: CATEGORY_COLOR_UNSET }}
          />
          <span className="text-muted-foreground">unset</span>
        </span>
      </div>
    </Card>
  );
}

/**
 * Pick black or white text based on the swatch's perceived luminance, so
 * yellow/cyan swatches (which are near-white) still read against the pill.
 * Formula: WCAG relative luminance, cutoff at 0.5.
 */
function readableTextColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? "#111827" : "#ffffff";
}
