import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EventForm } from "@/components/events/event-form";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function NewEventPage() {
  const { user } = await requireSession();
  if (!can(user, "events.create")) redirect("/events");

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1 -ml-3">
          <Link href="/events">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to events
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow="KM-EVT-CONCEPT-v1"
        title="New event concept"
        description="Work through all 11 sections. Save a draft at any point — submit for GM approval when ready."
      />
      <EventForm />
    </div>
  );
}
