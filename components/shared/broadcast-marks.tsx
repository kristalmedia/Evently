import { cn } from "@/lib/utils";

/** Reserved for events currently broadcasting live. */
export function OnAirPill({ className }: { className?: string }) {
  return <span className={cn("on-air-pill", className)}>On Air</span>;
}

/** Broadcast callsign — for event reference numbers */
export function Callsign({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return <span className={cn("callsign", className)}>{value}</span>;
}
