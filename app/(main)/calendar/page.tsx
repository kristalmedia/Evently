import { PageHeader } from "@/components/shared/page-header";
import { EventsCalendar } from "@/components/events/events-calendar";
import { requireSession } from "@/lib/auth";
import { getAllEvents } from "@/lib/store";

export default async function CalendarPage() {
  await requireSession();
  // Use the full event objects rather than getEventRows() so the calendar
  // can hand each event's description + venue into its hover popover.
  const events = getAllEvents();

  const items = events.map((e) => ({
    id: e.id,
    title: e.s1.eventName,
    start: e.s1.startDate,
    end: e.s1.endDate,
    status: e.status,
    category: e.category,
    description: e.s3?.description,
    venue: e.s1?.venue,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event Management"
        title="Calendar"
        description="Every scheduled event, colour-coded by category. Filter above; hover for a preview."
      />
      <EventsCalendar events={items} />
    </div>
  );
}
