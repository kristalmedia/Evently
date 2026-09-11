"use client";

import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { OWNER_META, type SectionOwner } from "./section-shell";

export interface SectionDef {
  key: string;
  index: number;
  title: string;
  subtitle?: string;
  /** Department that owns this section — drives the colored ownership dot. */
  owner?: SectionOwner;
}

export function SectionNav({
  sections,
  activeKey,
  completed,
  locked,
  onSelect,
}: {
  sections: SectionDef[];
  activeKey: string;
  completed: Record<string, boolean>;
  locked?: Record<string, boolean>;
  onSelect: (key: string) => void;
}) {
  return (
    <nav>
      <div className="pb-2 callsign hidden lg:block">Sections</div>
      {/* Horizontal scrollable chip strip on mobile / tablet, vertical list on desktop */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 lg:mx-0 lg:px-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:space-y-0">
        {sections.map((s) => {
          const isActive = s.key === activeKey;
          const isDone = completed[s.key];
          const isLocked = locked?.[s.key];
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              disabled={isLocked}
              className={cn(
                "shrink-0 lg:w-full flex items-center lg:items-start gap-2 lg:gap-3 rounded-md border px-2.5 py-2 lg:p-2.5 text-left transition-colors",
                isActive
                  ? "border-accent/50 bg-accent/5"
                  : isLocked
                    ? "border-transparent opacity-50 cursor-not-allowed"
                    : "border-transparent hover:bg-secondary"
              )}
            >
              <div
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.7rem] font-mono font-semibold transition-colors",
                  isDone
                    ? "bg-accent text-accent-foreground"
                    : isActive
                      ? "bg-primary text-primary-foreground"
                      : isLocked
                        ? "bg-muted text-muted-foreground/60"
                        : "bg-muted text-muted-foreground"
                )}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : isLocked ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  String(s.index).padStart(2, "0")
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn(
                  "text-sm font-medium leading-tight whitespace-nowrap lg:whitespace-normal flex items-center gap-1.5",
                  isActive ? "text-foreground" : "text-foreground/80"
                )}>
                  {s.owner && (
                    <span
                      aria-hidden="true"
                      title={`Owned by ${OWNER_META[s.owner].label}`}
                      className={cn("h-2 w-2 rounded-full shrink-0", OWNER_META[s.owner].dot)}
                    />
                  )}
                  <span>{s.title}</span>
                </div>
                {s.subtitle && (
                  <div className="hidden lg:block text-xs text-muted-foreground truncate mt-0.5">
                    {s.subtitle}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
