"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Coins, Lock, Pencil, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { EventStatus, Role } from "@/lib/types";

/**
 * Workflow action panel — shows on the event detail page when the current
 * viewer is the person responsible for the next handoff.
 *
 *   BUDGET_PENDING       + Finance Lead → "Approve budget" / "Reject budget"
 *   STAFFING_IN_PROGRESS + Manager      → "Complete Staffing"
 *   FINANCIAL_REVIEW     + Finance Lead → "Complete Financials"
 *   (Super Admin sees the relevant prompt as an admin override.)
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

  const showBudgetGate = status === "BUDGET_PENDING" && isFinanceLead;
  const showStaffing = status === "STAFFING_IN_PROGRESS" && isManager;
  const showFinancials = status === "FINANCIAL_REVIEW" && isFinanceLead;
  if (!showBudgetGate && !showStaffing && !showFinancials) return null;

  async function approveBudget() {
    if (!confirm("Approve initial budget? Event advances to Rudy's review next.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/approve-budget`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Budget approved — Rudy has been notified", { position: "bottom-center" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rejectBudget() {
    const reason = prompt(
      "Reject the initial budget — reason will be sent to the submitter (min 10 characters):"
    );
    if (reason === null) return; // cancelled
    if (reason.trim().length < 10) {
      toast.error("Justification (10+ chars) is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/deny-budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.error("Budget rejected — event returned to Draft", { position: "bottom-center" });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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

  if (showBudgetGate) {
    return (
      <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/[0.06] p-4 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Budget approval requested — your action needed</div>
            <p className="text-xs text-muted-foreground mt-1">
              Review the event's budget before the Nabeng → Rudy → Jenny sign-off chain runs.
              Approving advances to Rudy. Rejecting sends it back to Draft with your reason.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-8">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={`/events/${eventId}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
              Review event
            </Link>
          </Button>
          <Button
            size="sm"
            variant="accent"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
            disabled={busy}
            onClick={approveBudget}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {busy ? "Working…" : "Approve budget"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            disabled={busy}
            onClick={rejectBudget}
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject budget
          </Button>
        </div>
      </div>
    );
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
  if (
    status !== "BUDGET_PENDING" &&
    status !== "STAFFING_IN_PROGRESS" &&
    status !== "FINANCIAL_REVIEW"
  ) {
    return null;
  }
  const [Icon, label, blurb] =
    status === "BUDGET_PENDING"
      ? [
          ShieldCheck,
          "Budget approval pending",
          "The Finance Lead is reviewing the initial budget. On approval, the event enters the Nabeng → Rudy → Jenny sign-off chain.",
        ]
      : status === "STAFFING_IN_PROGRESS"
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
