import Link from "next/link";
import { CalendarPlus, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EventsTable } from "@/components/events/events-table";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getEventRows } from "@/lib/store";

export default async function EventsPage() {
  const { user } = await requireSession();
  const rows = getEventRows();
  const canCreate = can(user, "events.create");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event Management"
        title="Events"
        description="All events across the organisation. Filter by status, category, or search by name or reference."
        actions={
          canCreate && (
            <Button asChild variant="accent" className="gap-2">
              <Link href="/events/new">
                <CalendarPlus className="h-4 w-4" />
                New event
              </Link>
            </Button>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No events yet"
          description="Create your first event to get started."
          action={
            canCreate && (
              <Button asChild variant="accent" className="gap-2">
                <Link href="/events/new">
                  <CalendarPlus className="h-4 w-4" />
                  New event
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <EventsTable rows={rows} />
      )}
    </div>
  );
}
