"use client";

import Link from "next/link";
import {
  Bell,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  CircleCheck,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/utils";
import type { Notification, NotificationKind } from "@/lib/types";

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  EVENT_CREATED: CalendarPlus,
  EVENT_UPDATED: CalendarClock,
  EVENT_CANCELLED: Bell,
  EVENT_PUBLISHED: CheckCircle2,
  APPROVAL_REQUEST: ShieldCheck,
  APPROVAL_GRANTED: CheckCircle2,
  APPROVAL_DENIED: XCircle,
  REMINDER: Bell,
  TODAY: CircleCheck,
};

/**
 * Notifications list — read-only after the KOTG pivot. The old
 * approve/deny in-line actions were tied to the sign-off chain that no
 * longer exists; users now click through to the event detail page to
 * take action on the shadow-record workflow.
 */
export function NotificationsView({ notifications }: { notifications: Notification[] }) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="You're all caught up"
        description="New notifications will appear here as KOTG bookings go Active or workflow stages advance."
      />
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => {
        const Icon = KIND_ICON[n.kind] ?? Bell;
        const unread = !n.readAt;
        const denied = n.kind === "APPROVAL_DENIED";
        return (
          <div
            key={n.id}
            className={`rounded-lg border p-4 transition-colors ${
              denied
                ? "border-rose-500/30 bg-rose-500/5"
                : unread
                  ? "bg-accent/5 border-accent/30"
                  : "hover:bg-secondary/40"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`rounded-md p-2 shrink-0 ${
                  denied
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    : unread
                      ? "bg-accent/15 text-accent"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  {unread && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                  )}
                </div>
                {n.body && (
                  <div className="text-sm text-muted-foreground mt-1">{n.body}</div>
                )}
                {n.denialReason && (
                  <div className="mt-2 rounded border-l-2 border-rose-500/60 bg-rose-500/5 p-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      Justification
                    </span>
                    <div className="mt-1 text-foreground">{n.denialReason}</div>
                  </div>
                )}
                <div className="callsign mt-1.5">{formatDateTime(n.createdAt)}</div>
                {n.eventId && (
                  <Link
                    href={`/events/${n.eventId}`}
                    className="inline-block mt-2 text-xs font-medium text-accent hover:underline"
                  >
                    Open event →
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
