"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, X } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import type { EventContentArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CATEGORY_COLOR, CATEGORY_COLOR_UNSET, DEFAULT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { EventStatus } from "@/lib/types";

interface CalendarItem {
  id: string;
  title: string;
  start: string;
  end?: string;
  status: EventStatus;
  category?: string;
  /** Short blurb from the event's Section 3 description, shown in the
   *  hover popover. Truncated in the caller — this component just renders. */
  description?: string;
  /** Venue string from Section 1, also shown in the hover popover. */
  venue?: string;
}

function colorFor(category?: string): string {
  return (category && CATEGORY_COLOR[category]) || CATEGORY_COLOR_UNSET;
}

/** Small helper — max ~200 chars, break at the nearest sentence/word. */
function summarize(text: string | undefined, max = 200): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 60 ? slice.slice(0, lastSpace) : slice) + "…";
}

function formatDateRange(startISO: string, endISO?: string): string {
  const start = new Date(startISO);
  if (!endISO) return start.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const end = new Date(endISO);
  const sameDay = start.toDateString() === end.toDateString();
  const s = start.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const e = sameDay
    ? end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : end.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  return `${s} → ${e}`;
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

  // Category filter state — Set of selected category names. Empty set = show
  // everything (no filter). Multi-select, toggled by clicking each chip.
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => {
    if (selectedCats.size === 0) return events;
    return events.filter((e) => e.category && selectedCats.has(e.category));
  }, [events, selectedCats]);
  const filterActive = selectedCats.size > 0;

  const toggleCat = (name: string) =>
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // O(1) lookup for hover popover data by event id — FullCalendar passes us
  // its own EventApi which doesn't carry our custom fields.
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  return (
    <Card className="p-2 sm:p-4 overflow-hidden">
      {/* Filter chips row */}
      <div className="mb-3 sm:mb-4 flex flex-wrap items-center gap-1.5 px-1 sm:px-0">
        <span className="callsign mr-1">Filter</span>
        {DEFAULT_CATEGORIES.map((c) => {
          const on = selectedCats.has(c.name);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCat(c.name)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                on
                  ? "border-transparent text-white shadow-sm"
                  : "border-input bg-background hover:bg-secondary text-foreground/80"
              )}
              style={on ? { backgroundColor: c.color, color: readableTextColor(c.color) } : undefined}
              title={on ? `Hide ${c.name}` : `Show only ${c.name}`}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: c.color }}
              />
              {c.name}
            </button>
          );
        })}
        {filterActive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 h-7 px-2 text-xs"
            onClick={() => setSelectedCats(new Set())}
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
        <span className="ml-auto text-[0.7rem] font-mono text-muted-foreground">
          {filtered.length} of {events.length}
        </span>
      </div>

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
            events={filtered.map((e) => {
              const color = colorFor(e.category);
              return {
                id: e.id,
                title: e.title,
                start: e.start,
                end: e.end,
                backgroundColor: color,
                borderColor: color,
                textColor: readableTextColor(color),
                // No `url` — click behavior is deferred to the "Show more"
                // button inside the hover popover so we don't fight the
                // hover UX with a same-click navigation.
              };
            })}
            // Custom render so each event chip can be a HoverCard trigger.
            eventContent={(arg) => (
              <CalendarEventChip
                arg={arg}
                item={byId.get(arg.event.id) ?? null}
              />
            )}
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
 * Renders a single event chip inside the FullCalendar cell, wrapped in a
 * Radix HoverCard so hovering shows a rich summary + Show-more button
 * without stealing click navigation.
 *
 * `openDelay` is tuned so casual scanning the calendar doesn't spam
 * popovers, but a deliberate hover fires within a comfortable ~200ms.
 */
function CalendarEventChip({
  arg,
  item,
}: {
  arg: EventContentArg;
  item: CalendarItem | null;
}) {
  const title = arg.event.title;
  const timeText = arg.timeText;

  if (!item) {
    // No item metadata (shouldn't happen — safety net). Render the plain chip.
    return (
      <div className="fc-event-title-container">
        <div className="fc-event-title fc-sticky truncate">{title}</div>
        {timeText && <div className="fc-event-time truncate">{timeText}</div>}
      </div>
    );
  }

  const summary = summarize(item.description);

  return (
    <HoverCard openDelay={200} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-sm"
        >
          <div className="fc-event-title-container">
            <div className="fc-event-title fc-sticky truncate">{title}</div>
            {timeText && <div className="fc-event-time truncate">{timeText}</div>}
          </div>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2.5">
        {/* Category badge on its own row so it doesn't compete with the
            title for horizontal space — the earlier flex-row layout caused
            long titles like "Taman SOAS — Weekend Broadcast" to truncate. */}
        {item.category && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
            style={{
              backgroundColor: colorFor(item.category),
              color: readableTextColor(colorFor(item.category)),
            }}
          >
            {item.category}
          </span>
        )}
        <div>
          <div className="text-sm font-semibold leading-tight break-words">{item.title}</div>
          <div className="text-[0.7rem] font-mono text-muted-foreground mt-0.5">
            {formatDateRange(item.start, item.end)}
          </div>
        </div>
        {item.venue && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{item.venue}</span>
          </div>
        )}
        {summary && (
          <p className="text-xs text-foreground/80 leading-relaxed">{summary}</p>
        )}
        <div className="pt-1">
          <Button asChild size="sm" variant="accent" className="w-full gap-1.5">
            <Link href={`/events/${item.id}`}>
              Show more
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
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
