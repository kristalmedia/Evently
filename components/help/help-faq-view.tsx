"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { FaqSection } from "@/lib/faq";

/**
 * Search + accordion for the FAQ. Uses native <details>/<summary> for
 * the accordion mechanics — accessible by default (keyboard toggle,
 * screen-reader semantics) and zero dependency cost beyond styling.
 *
 * Search matches on question and answer text, case-insensitive. Sections
 * with no matching entries are hidden entirely rather than shown empty.
 */
export function HelpFaqView({ sections }: { sections: FaqSection[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return sections;
    return sections
      .map((s) => ({
        ...s,
        entries: s.entries.filter(
          (e) =>
            e.q.toLowerCase().includes(query) || e.a.toLowerCase().includes(query)
        ),
      }))
      .filter((s) => s.entries.length > 0);
  }, [q, sections]);

  const totalMatches = filtered.reduce((n, s) => n + s.entries.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search FAQ…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {q.trim() && (
          <span className="text-xs callsign">
            {totalMatches} match{totalMatches === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description="Try a shorter or different search term."
        />
      ) : (
        <div className="space-y-6">
          {filtered.map((section) => (
            <div key={section.title} className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight">
                {section.title}
              </h2>
              <Card>
                <CardContent className="p-0 divide-y">
                  {section.entries.map((entry) => (
                    <details
                      key={entry.q}
                      className="group [&_summary::-webkit-details-marker]:hidden"
                      // Auto-expand every match when there's an active
                      // search so users don't have to click each one to
                      // see the answer they searched for.
                      open={!!q.trim()}
                    >
                      <summary className="flex items-start gap-3 p-3 cursor-pointer list-none hover:bg-secondary/40 transition-colors">
                        <ChevronDown className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground group-open:rotate-180 transition-transform" />
                        <span className="text-sm font-medium leading-tight min-w-0">
                          {entry.q}
                        </span>
                      </summary>
                      <div className="px-3 pb-3 pt-1 pl-10 text-sm text-muted-foreground leading-relaxed">
                        {entry.a}
                      </div>
                    </details>
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
