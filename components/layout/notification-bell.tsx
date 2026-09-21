"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPath } from "@/lib/api-path";

const POLL_INTERVAL_MS = 10_000;

export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch(apiPath("/api/notifications/count"), { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (!cancelled) setCount(data.count ?? 0);
      } catch {
        // silent
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);
    // Also refresh when tab regains focus.
    const onFocus = () => fetchCount();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const displayCount = count > 99 ? "99+" : String(count);

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
      className="relative"
    >
      <Link href="/notifications">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-onair text-white text-[0.6rem] font-mono font-bold leading-4 text-center border border-background"
          >
            {displayCount}
          </span>
        )}
      </Link>
    </Button>
  );
}
