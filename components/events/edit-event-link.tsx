"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EditEventLink({ eventId }: { eventId: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={`/events/${eventId}/edit`}>
        <Pencil className="h-3.5 w-3.5" />
        Edit event
      </Link>
    </Button>
  );
}
