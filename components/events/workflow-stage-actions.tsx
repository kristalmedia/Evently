"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Coins, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { EventStatus, Role } from "@/lib/types";

/**
 * Post-approval workflow action panel — shows on the event detail page
 * when the current viewer is the person responsible for the next handoff.
 *
 *   STAFFING_IN_PROGRESS + Manager  → "Complete Staffing"
 *   FINANCIAL_REVIEW     + Finance Lead → "Complete Financials"
 *   (Super Admin sees both prompts as an admin override.)
 *
 * The buttons POST to /api/events/[id]/complete-staffing and
 * /complete-financials respectively; both live in Wave-2 commit 3/4.
 */
export function WorkflowStageActions({
  eventId,
  status,
  userRoles,
}: {
  eventId: string;
  status: EventStatus;
  /** All roles the user holds (primary first, optional secondary second).
   *  Passed as an array so this component doesn't need to import server-only
   *  helpers to check both roles. */
  userRoles: Role[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const holds = (r: Role) => userRoles.includes(r);
  const isSuper = holds("SUPER_ADMIN");
  const isManager = holds("MANAGER") || isSuper;
  const isFinanceLead = holds("FINANCE_LEAD") || isSuper;

  const showStaffing = status === "STAFFING_IN_PROGRESS" && isManager;
  const showFinancials = status === "FINANCIAL_REVIEW" && isFinanceLead;
  if (!showStaffing && !showFinancials) return null;

  async function completeStaffing() {
    if (!confirm("Mark Staff complete? This unlocks Financial for the Finance Lead and cannot be undone from here.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/complete-staffing`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Staff completed — Financial section now with the Finance Lead", {
        position: "bottom-center",
      });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function completeFinancials() {
    if (!confirm("Mark Financials complete? This marks the event as PUBLISHED. Users were already notified when Jenny approved — no re-notification fires here.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/complete-financials`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Financials complete — event published", {
        position: "bottom-center",
      });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (showStaffing) {
    return (
      <div className="rounded-lg border-2 border-emerald-600/40 bg-emerald-500/[0.06] p-4 space-y-3">
        <div className="flex items-start gap-3">
          <ClipboardList className="h-5 w-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Staffing in progress — your action needed</div>
            <p className="text-xs text-muted-foreground mt-1">
              Jenny finalized the event brief. Fill the Staff section (roster + shifts) so the
              Finance Lead can complete Financial. When you're done, click "Complete Staffing" to
              hand off.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-8">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={`/events/${eventId}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
              Edit Staff section
            </Link>
          </Button>
          <Button
            size="sm"
            variant="accent"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
            disabled={busy}
            onClick={completeStaffing}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {busy ? "Working…" : "Complete Staffing"}
          </Button>
        </div>
      </div>
    );
  }

  // showFinancials
  return (
    <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/[0.06] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Coins className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Financial review — your action needed</div>
          <p className="text-xs text-muted-foreground mt-1">
            Staff is complete and the auto-calculated overtime / meal-allowance figures are ready.
            Review the Financial section, add any manual lines, then click "Complete Financials" to
            publish the event to everyone.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-8">
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/events/${eventId}/edit`}>
            <Pencil className="h-3.5 w-3.5" />
            Edit Financial section
          </Link>
        </Button>
        <Button
          size="sm"
          variant="accent"
          className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-amber-700"
          disabled={busy}
          onClick={completeFinancials}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {busy ? "Working…" : "Complete Financials"}
        </Button>
      </div>
    </div>
  );
}

/** Read-only version for spectators — shows the current post-approval stage
 *  without any action buttons. Rendered when a non-owner viewer is looking at
 *  an event mid-workflow, so they understand what's blocking. */
export function WorkflowStageWaiting({ status }: { status: EventStatus }) {
  if (status !== "STAFFING_IN_PROGRESS" && status !== "FINANCIAL_REVIEW") return null;
  const [Icon, label, blurb] =
    status === "STAFFING_IN_PROGRESS"
      ? [
          ClipboardList,
          "Staffing in progress",
          "The Manager team is filling the Staff section. Financial opens next for the Finance Lead once Staff is complete.",
        ]
      : [
          Coins,
          "Financial review",
          "The Finance Lead is reviewing the Financial section. The event will be published to everyone once they mark it complete.",
        ];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 flex items-start gap-3 text-xs">
      <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span className="font-medium inline-flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <p className="text-muted-foreground mt-0.5">{blurb}</p>
      </div>
    </div>
  );
}
