import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { EventForm } from "@/components/events/event-form";
import { requireSession } from "@/lib/auth";
import { canEditEvent } from "@/lib/permissions";
import { getEventById } from "@/lib/store";
import { Callsign } from "@/components/shared/broadcast-marks";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireSession();
  const { id } = await params;

  // Persistent edit rights (spec §2) — Nabeng + Super Admin only.
  // Nabeng can edit at ANY status (draft, pending, published, etc.).
  if (!canEditEvent(user)) redirect("/events");

  const event = getEventById(id);
  if (!event) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <span>Editing</span>
            <Callsign value={event.s1.eventRefNo} />
          </div>
        }
        title={event.s1.eventName || "Untitled event"}
        description="Persistent edit access — Nabeng (First Approver) can edit event details at any time, including after submission, approval, or publication."
      />
      <EventForm
        editMode
        initialEvent={{
          status: event.status,
          priority: event.priority,
          category: event.category,
          s1: event.s1,
          s2: event.s2,
          s3: event.s3,
          s4: event.s4,
          s5: event.s5,
          s6: event.s6,
          s7: event.s7,
          s8: event.s8,
          s9: event.s9,
          s10: event.s10,
          s11: event.s11,
          id: event.id,
        }}
      />
    </div>
  );
}
