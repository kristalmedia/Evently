import { Badge } from "@/components/ui/badge";
import { EVENT_STATUSES } from "@/lib/constants";
import type { EventStatus } from "@/lib/types";

type Variant = React.ComponentProps<typeof Badge>["variant"];

const TONE_TO_VARIANT: Record<string, Variant> = {
  muted: "muted",
  signal: "signal",
  amber: "amber",
  emerald: "emerald",
  rose: "rose",
  onair: "onair",
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const entry = EVENT_STATUSES.find((s) => s.value === status);
  if (!entry) return <Badge variant="muted">{status}</Badge>;
  return <Badge variant={TONE_TO_VARIANT[entry.tone] ?? "muted"}>{entry.label}</Badge>;
}
