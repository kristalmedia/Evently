import { Badge } from "@/components/ui/badge";
import type { EventPriority } from "@/lib/types";

type Variant = React.ComponentProps<typeof Badge>["variant"];

const MAP: Record<EventPriority, { label: string; variant: Variant }> = {
  LOW: { label: "Low", variant: "muted" },
  MEDIUM: { label: "Medium", variant: "outline" },
  HIGH: { label: "High", variant: "amber" },
  CRITICAL: { label: "Critical", variant: "rose" },
};

export function PriorityBadge({ priority }: { priority: EventPriority }) {
  const { label, variant } = MAP[priority];
  return <Badge variant={variant}>{label}</Badge>;
}
