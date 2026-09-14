"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, EyeOff, Lock, ShieldCheck, Send, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionShell } from "./section-shell";
import { APPROVER_LABEL, APPROVER_SEQUENCE } from "@/lib/constants";
import { approverRoleForUser, can, canSignOff, isSuperAdmin } from "@/lib/permissions";
import { useSessionStore } from "@/stores/session-store";
import type { EventConceptForm } from "@/lib/validation/event-schema";
import type { ApproverRole, SignOffEntry } from "@/lib/types";

export function Section8() {
  const router = useRouter();
  const { control, getValues } = useFormContext<EventConceptForm>();
  const user = useSessionStore((s) => s.user);
  const authorized = canSignOff(user);
  const userRole = approverRoleForUser(user);
  const superAdmin = isSuperAdmin(user);
  const [submitting, setSubmitting] = useState(false);
  const [denyOpen, setDenyOpen] = useState<false | ApproverRole>(false);
  const [denyReason, setDenyReason] = useState("");

  // Watch classification so the render (approval blocks vs paid submit
  // callout) reacts to the user flipping the Commercial / Community toggle
  // in Section 2 without needing a form reset.
  const classification = useWatch({ control, name: "s2.classification" });
  const isPaidEvent = classification === "COMMERCIAL";
  // Paid events skip the approval chain entirely — anyone with events.create
  // permission can submit them. Free events keep the FIRST_APPROVER-only
  // submit gate (Nabeng initiates the Nabeng → Rudy → Jenny chain).
  const canSubmitPaid = isPaidEvent && can(user, "events.create");

  // Strict isolation (spec §5): approvers only see their assigned block.
  function canView(slotRole: ApproverRole): boolean {
    if (superAdmin) return true;
    if (userRole) return userRole === slotRole;
    return true;
  }
  function canSign(slotRole: ApproverRole): boolean {
    return userRole === slotRole;
  }

  async function submitForApproval() {
    setSubmitting(true);
    try {
      const values = getValues();
      const payload = {
        ...values,
        // New pre-approval gate: free events now route to Putri (Finance
        // Lead) for a budget-only review FIRST, then Rudy → Jenny after
        // she approves. See /api/events/[id]/approve-budget.
        status: "BUDGET_PENDING",
        priority: values.priority ?? "MEDIUM",
        s11: {
          ...(values.s11 ?? { entries: [] }),
          entries: [
            ...((values.s11?.entries ?? []).filter((e) => e.role !== "FIRST_APPROVER")),
            {
              role: "FIRST_APPROVER" as ApproverRole,
              name: user?.fullName ?? "",
              signedAt: new Date().toISOString().slice(0, 16),
            },
          ],
        },
      };
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { event } = await res.json();
      toast.success("Submitted — awaiting Budget Approval (Finance Lead)", {
        position: "bottom-center",
      });
      router.push(`/events/${event.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Paid (COMMERCIAL) submit — skips the Nabeng → Rudy → Jenny chain and
   * drops the event directly into STAFFING_IN_PROGRESS so Managers can
   * fill the roster and Putri can review Financials. The server-side
   * events POST detects `status = STAFFING_IN_PROGRESS + COMMERCIAL` and
   * fires the same Manager + org-wide fan-out that Jenny's approve fires
   * for free events, via lib/event-notifications.ts.
   *
   * We do NOT stamp any s11.entries here — no one signed off, and
   * pretending an approver signed would be dishonest in the audit trail.
   */
  async function submitPaidEvent() {
    setSubmitting(true);
    try {
      const values = getValues();
      const payload = {
        ...values,
        status: "STAFFING_IN_PROGRESS",
        priority: values.priority ?? "MEDIUM",
        // Keep s11 as-is (typically empty entries) — this event never went
        // through the approval chain, so no signatures to record.
      };
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { event } = await res.json();
      toast.success("Paid event submitted — no approval needed, Managers notified for staffing", {
        position: "bottom-center",
      });
      router.push(`/events/${event.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionShell
      index={8}
      title={isPaidEvent ? "Submit Event (paid — no approval needed)" : "Final Approval & Sign-Off"}
      description={
        isPaidEvent
          ? "Paid engagements skip the Nabeng → Rudy → Jenny approval chain. Submit sends the event straight into staffing and notifies every user."
          : "Sequential approval chain: First (Nabeng) → Second (Rudy) → Final (Jenny). Each approver sees only their own block and receives an interactive notification when it's their turn."
      }
      owner="gm"
    >
      {/* Paid events don't run the sign-off chain — render the paid submit
          callout only and stop here. Managers still fill Staff and the
          Finance Lead still fills Financial post-submit; the whole approval
          UI just doesn't apply. */}
      {isPaidEvent ? (
        <PaidSubmitCallout
          canSubmit={canSubmitPaid}
          submitting={submitting}
          onSubmit={submitPaidEvent}
        />
      ) : (
        <>
      {/* Authorization banner */}
      <div
        className={`rounded-lg border p-4 flex items-start gap-3 ${
          authorized
            ? "border-accent/40 bg-accent/5"
            : "border-amber-500/40 bg-amber-500/5"
        }`}
      >
        {authorized ? (
          <ShieldCheck className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        ) : (
          <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1 min-w-0">
          <div className="text-sm font-medium">
            {superAdmin
              ? "Super Admin — view-only. Sign-off is reserved for the three designated approvers."
              : userRole
                ? `You are the ${APPROVER_LABEL[userRole].title}.`
                : "You can view the sign-off status but not sign."}
          </div>
          <div className="text-xs text-muted-foreground">
            {superAdmin
              ? "You can see all three blocks but cannot execute approvals."
              : userRole
                ? "Only your assigned approval block is shown below."
                : "Only Nabeng (1st), Rudy (2nd), and Jenny (Final) can sign."}
          </div>
        </div>
      </div>

      {/* Approval blocks — filtered by strict isolation */}
      <Controller
        control={control}
        name="s11.entries"
        render={({ field }) => {
          const entries = field.value ?? [];
          const byRole = new Map(entries.map((e) => [e.role, e]));

          function setFor(role: ApproverRole, patch: Partial<SignOffEntry>) {
            const existing = byRole.get(role);
            // Domain SignOffEntry.name is required, but the zod-inferred
            // form-side entry allows name?: string | undefined for partial
            // drafts. Coerce to "" so the assignment satisfies the domain
            // type — matches what the form validation eventually enforces
            // anyway when someone actually signs.
            const next: SignOffEntry = {
              role,
              name: existing?.name ?? "",
              signedAt: existing?.signedAt,
              ...patch,
            };
            const others = entries.filter((e) => e.role !== role);
            field.onChange([...others, next]);
          }

          const visibleRoles = APPROVER_SEQUENCE.filter(canView);
          const hiddenCount = APPROVER_SEQUENCE.length - visibleRoles.length;

          return (
            <div className="space-y-3">
              <div
                className={`grid gap-4 ${
                  visibleRoles.length === 1
                    ? "grid-cols-1"
                    : visibleRoles.length === 2
                      ? "sm:grid-cols-2"
                      : "lg:grid-cols-3"
                }`}
              >
                {visibleRoles.map((slotRole) => {
                  const entry = byRole.get(slotRole);
                  const meta = APPROVER_LABEL[slotRole];
                  const signed = !!entry?.signedAt;
                  const canISign = canSign(slotRole);

                  return (
                    <div
                      key={slotRole}
                      className={`rounded-lg border p-5 space-y-4 transition-colors ${
                        signed ? "border-accent/60 bg-accent/5" : ""
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="callsign">{meta.title}</div>
                        <div className="text-sm font-semibold">Approved by {meta.who}</div>
                        {!canISign && !superAdmin && (
                          <div className="text-[0.7rem] text-amber-600 dark:text-amber-400 flex items-center gap-1 pt-1">
                            <Lock className="h-3 w-3" />
                            {meta.who} only
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Name</label>
                        <Input
                          value={entry?.name ?? ""}
                          disabled={!canISign}
                          onChange={(e) => setFor(slotRole, { name: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium">Signed at</label>
                        <Input
                          type="datetime-local"
                          value={entry?.signedAt ?? ""}
                          disabled={!canISign}
                          onChange={(e) => setFor(slotRole, { signedAt: e.target.value })}
                        />
                      </div>

                      {canISign && (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setFor(slotRole, {
                                name: entry?.name ?? user?.fullName ?? "",
                                signedAt: signed
                                  ? undefined
                                  : new Date().toISOString().slice(0, 16),
                              });
                            }}
                            className={`w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed p-3 text-sm font-medium transition-colors ${
                              signed
                                ? "border-accent/60 text-accent bg-accent/5"
                                : "border-input text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            {signed ? (
                              <>
                                <CheckCircle2 className="h-4 w-4" />
                                Finally Approved
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="h-4 w-4" />
                                Approve / Finally Approve
                              </>
                            )}
                          </button>
                          {!signed && slotRole !== "FIRST_APPROVER" && (
                            <button
                              type="button"
                              onClick={() => {
                                setDenyOpen(slotRole);
                                setDenyReason("");
                              }}
                              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Deny (requires justification)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {hiddenCount > 0 && !superAdmin && (
                <div className="rounded-lg border border-dashed p-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <EyeOff className="h-3.5 w-3.5" />
                  {hiddenCount} other approval {hiddenCount === 1 ? "block is" : "blocks are"}{" "}
                  hidden — strict approval isolation.
                </div>
              )}
            </div>
          );
        }}
      />

      {/* Submit — First Approver only (starts the workflow) */}
      {userRole === "FIRST_APPROVER" && (
        <div className="rounded-lg border p-5 bg-muted/30 space-y-3">
          <div>
            <div className="callsign">Submit event for approval</div>
            <p className="text-sm text-muted-foreground mt-1">
              This starts the sequential approval chain — an interactive notification
              is sent to Rudy (Second Approver) with Approve / Deny buttons.
            </p>
          </div>
          <Button
            type="button"
            variant="accent"
            size="lg"
            disabled={submitting}
            onClick={submitForApproval}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {submitting ? "Submitting…" : "Submit / Publish"}
          </Button>
        </div>
      )}
      {userRole && userRole !== "FIRST_APPROVER" && (
        <div className="rounded-lg border p-4 bg-muted/30 text-sm text-muted-foreground">
          <span className="font-medium">Note:</span> You act on this event through your
          Approve / Deny notification (see /notifications). The Submit button only appears
          for the First Approver who initiates the chain.
        </div>
      )}
      {!userRole && !superAdmin && (
        <div className="rounded-lg border p-4 bg-muted/30 text-sm text-muted-foreground">
          The Submit button only appears for the First Approver (Nabeng).
        </div>
      )}
        </>
      )}

      {/* Denial modal (only relevant for the free approval-chain path — safe
          to render for paid too since it doesn't self-open). */}
      <Dialog open={!!denyOpen} onOpenChange={(v) => !v && setDenyOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deny approval — justification required</DialogTitle>
            <DialogDescription>
              The event will revert to <span className="font-medium">Revision Required</span>{" "}
              status and the previous submitter will be alerted with your reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={5}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Explain what needs to change before this can be approved…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDenyOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={denyReason.trim().length < 10}
              onClick={() => {
                if (denyReason.trim().length < 10) return;
                toast.error(
                  "Denied inside the form — real denials happen from the notifications page after submit.",
                  { position: "bottom-center" }
                );
                setDenyOpen(false);
                setDenyReason("");
              }}
            >
              Confirm denial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionShell>
  );
}

/**
 * Paid (commercial) event submit UI — replaces the 3-block sign-off chain
 * on the Sign-off section when Section 2's classification is COMMERCIAL.
 * The button POSTs the event with status = STAFFING_IN_PROGRESS; the server
 * detects that + classification and fires the Manager + org-wide fan-out.
 */
function PaidSubmitCallout({
  canSubmit,
  submitting,
  onSubmit,
}: {
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border-2 border-signal-400/40 bg-signal-500/[0.04] p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Zap className="h-5 w-5 text-signal-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-semibold">Paid engagement — no approval chain</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The event is classified as <span className="font-medium">Commercial / Paid</span>{" "}
            in Section 2, so it skips the Nabeng → Rudy → Jenny sign-off. Submitting
            drops it straight into <span className="font-mono text-[0.7rem]">STAFFING_IN_PROGRESS</span>:
            Managers are notified to fill the roster, then the Finance Lead reviews Financials.
            An <span className="font-medium">"event created"</span> in-app broadcast and email
            fan out to every user immediately on submit.
          </p>
        </div>
      </div>

      {canSubmit ? (
        <Button
          type="button"
          variant="accent"
          size="lg"
          disabled={submitting}
          onClick={onSubmit}
          className="gap-2"
        >
          <Send className="h-4 w-4" />
          {submitting ? "Submitting…" : "Submit paid event"}
        </Button>
      ) : (
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            The submit button only appears for users with event-creation permission
            (Sales Admin, CCM Admin, or Super Admin).
          </span>
        </div>
      )}
    </div>
  );
}
