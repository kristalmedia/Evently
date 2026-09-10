import { PageHeader } from "@/components/shared/page-header";
import { EventsCalendar } from "@/components/events/events-calendar";
import { requireSession } from "@/lib/auth";
import { getEventRows } from "@/lib/store";

export default async function CalendarPage() {
  await requireSession();
  const rows = getEventRows();

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    start: r.startDate,
    end: r.endDate,
    url: `/events/${r.id}`,
    status: r.status,
    category: r.category,
    isLive: r.isLive ?? false,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event Management"
        title="Calendar"
        description="Every scheduled event, colour-coded by category."
      />
      <EventsCalendar events={items} />
    </div>
  );
}
