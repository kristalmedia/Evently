import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "accent" | "onair" | "amber" | "emerald";
}) {
  const toneClass = {
    default: "text-muted-foreground",
    accent: "text-accent",
    onair: "text-onair",
    amber: "text-amber-600 dark:text-amber-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
  }[tone];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="callsign">{label}</div>
        <div className={cn("rounded-md bg-muted p-1.5", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}
