"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";

interface PendingToast {
  id: string;
  title: string;
  body?: string;
  eventId?: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 8000;

/**
 * Silent client-side poller that watches for EVENT_PUBLISHED notifications
 * and fires a bottom-right toast for each one, then marks them as delivered
 * so they don't fire again on subsequent polls.
 *
 * Lives inside the main (authenticated) layout so it only runs for signed-in
 * users. Fails silently on network errors.
 */
export function BroadcastToastPoller() {
  const shownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/notifications/toasts", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { toasts?: PendingToast[] };
        const toasts = data.toasts ?? [];
        const fresh = toasts.filter((t) => !shownIds.current.has(t.id));
        if (fresh.length === 0) return;

        for (const t of fresh) {
          shownIds.current.add(t.id);
          toast.success(t.title, {
            description: t.body,
            duration: 10_000,
            position: "bottom-right",
            icon: <PartyPopper className="h-4 w-4 text-emerald-500" />,
            action: t.eventId
              ? {
                  label: "View event",
                  onClick: () => {
                    window.location.href = `/events/${t.eventId}`;
                  },
                }
              : undefined,
          });
        }

        // Mark server-side so other tabs / sessions don't re-fire.
        await fetch("/api/notifications/toasts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: fresh.map((t) => t.id) }),
        }).catch(() => {});
      } catch {
        // silent
      }
    }

    // First tick soon after mount, then on interval.
    const first = setTimeout(() => {
      if (!cancelled) tick();
    }, 1500);
    const interval = setInterval(() => {
      if (!cancelled) tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  return null;
}
