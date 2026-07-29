"use client";

import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Card } from "@/components/ui/card";
import type { EventStatus } from "@/lib/types";

interface CalendarItem {
  id: string;
  title: string;
  start: string;
  end?: string;
  url?: string;
  status: EventStatus;
}

const STATUS_COLOR: Record<EventStatus, string> = {
  DRAFT: "hsl(215 15% 55%)",
  PENDING_APPROVAL: "hsl(38 92% 50%)",
  PENDING_FINAL_APPROVAL: "hsl(38 92% 50%)",
  REVISION_REQUIRED: "hsl(346 82% 60%)",
  APPROVED: "hsl(215 88% 55%)",
  PUBLISHED: "hsl(160 84% 39%)",
  UPCOMING: "hsl(215 88% 55%)",
  ONGOING: "hsl(346 82% 60%)",
  COMPLETED: "hsl(160 84% 39%)",
  CANCELLED: "hsl(346 82% 60%)",
  ARCHIVED: "hsl(215 15% 55%)",
};

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
            events={events.map((e) => ({
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
              url: e.url,
              backgroundColor: STATUS_COLOR[e.status],
              borderColor: STATUS_COLOR[e.status],
            }))}
            height="auto"
            firstDay={1}
            eventDisplay="block"
            dayMaxEvents={isMobile ? 1 : 3}
            titleFormat={{ year: "numeric", month: isMobile ? "short" : "long" }}
          />
        </div>
      </div>
    </Card>
  );
}
