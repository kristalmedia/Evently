"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  CircleCheck,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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

export function NotificationsView({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [denyOpen, setDenyOpen] = useState<Notification | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="You're all caught up"
        description="New notifications will appear here as events are created, submitted, approved or denied."
      />
    );
  }

  async function approve(n: Notification) {
    if (!n.eventId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${n.eventId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: n.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Approved — advancing to next stage", {
        position: "bottom-center",
      });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitDenial() {
    if (!denyOpen?.eventId) return;
    if (reason.trim().length < 10) {
      toast.error("Justification (10+ chars) is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${denyOpen.eventId}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          notificationId: denyOpen.id,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.error("Denied — event returned for revision", {
        position: "bottom-center",
      });
      setDenyOpen(null);
      setReason("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="space-y-2">
        {notifications.map((n) => {
          const Icon = KIND_ICON[n.kind] ?? Bell;
          const unread = !n.readAt;
          const isAction = n.kind === "APPROVAL_REQUEST" && !n.actedOn;
          const denied = n.kind === "APPROVAL_DENIED";
          return (
            <div
              key={n.id}
              className={`rounded-lg border p-4 transition-colors ${
                isAction
                  ? "border-accent bg-accent/5"
                  : denied
                    ? "border-rose-500/30 bg-rose-500/5"
                    : unread
                      ? "bg-accent/5 border-accent/30"
                      : "hover:bg-secondary/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-md p-2 shrink-0 ${
                    isAction
                      ? "bg-accent text-accent-foreground"
                      : denied
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
                    {unread && !isAction && (
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

                  {/* Interactive actions for APPROVAL_REQUEST */}
                  {isAction && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="accent"
                        disabled={busy}
                        onClick={() => approve(n)}
                        className="gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => {
                          setDenyOpen(n);
                          setReason("");
                        }}
                        className="gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Deny
                      </Button>
                      {n.eventId && (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/events/${n.eventId}`}>Review event</Link>
                        </Button>
                      )}
                    </div>
                  )}
                  {!isAction && n.eventId && (
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

      <Dialog open={!!denyOpen} onOpenChange={(v) => !v && setDenyOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deny approval — justification required</DialogTitle>
            <DialogDescription>
              The event will be moved to <span className="font-medium">Revision Required</span>{" "}
              and the previous submitter will receive an alert with your reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what needs to change before this can be approved… (min 10 characters)"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDenyOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || reason.trim().length < 10}
              onClick={submitDenial}
              className="gap-1"
            >
              <Send className="h-4 w-4" />
              Submit denial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
