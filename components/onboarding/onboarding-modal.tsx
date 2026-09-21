"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessionStore } from "@/stores/session-store";
import { apiPath } from "@/lib/api-path";

/**
 * First-login welcome modal. Fires automatically for any signed-in user
 * whose User.onboardingSeenAt is unset. Dismissing (either button) POSTs
 * to /api/users/me/onboarding which stamps a timestamp on the User record
 * — the flag survives sign-outs and browser changes.
 *
 * Rendered from app/(main)/layout.tsx alongside SessionHydrator so it's
 * hydrated with the fresh User the layout resolved server-side.
 *
 * "Don't show again" is technically redundant with the plain "Got it"
 * button (both persist the same flag) — kept as a separate control
 * because it's the explicit disable users expect to find. The wording of
 * the two buttons still differentiates: "Got it" = I read it; "Don't
 * show again" = I read it AND actively want it gone.
 */
export function OnboardingModal() {
  const user = useSessionStore((s) => s.user);
  const setUser = useSessionStore((s) => s.setUser);
  const [open, setOpen] = useState(false);
  const [suppress, setSuppress] = useState(false);

  // Auto-open the first time we see a hydrated user without the flag.
  // Delayed one tick so the initial page paint isn't blocked by a modal
  // opening synchronously with the layout mount.
  useEffect(() => {
    if (!user) return;
    if (user.onboardingSeenAt) return;
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, [user]);

  async function dismiss() {
    setOpen(false);
    try {
      const res = await fetch(apiPath("/api/users/me/onboarding"), { method: "POST" });
      if (!res.ok) throw new Error("Failed to save preference");
      const { user: updated } = await res.json();
      // Reflect the timestamp on the client store so the modal doesn't
      // re-open on the next route change / re-render in the same session.
      setUser(updated);
    } catch (e) {
      // Non-fatal — the modal is a nice-to-have. Log and move on so the
      // user isn't blocked by a network glitch on a welcome screen.
      toast.error((e as Error).message);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Welcome to Kristal EMS, {user.fullName.split(" ")[0]}
          </DialogTitle>
          <DialogDescription>
            A quick tour of how events flow through the system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <TourStep
            icon={CalendarDays}
            title="Create + track events"
            body='Head to "Events → New event" to draft a concept. Fill only the sections your role owns — the form hides sections you don’t need. Everything else stays visible on the event detail page.'
          />
          <TourStep
            icon={ShieldCheck}
            title="Approval chain"
            body="Community events flow Nabeng → Rudy → Jenny. Paid events skip approval entirely. Once approved (or submitted as paid), Managers fill Staff, then the Finance Lead reviews budget, then it publishes."
          />
          <TourStep
            icon={CheckCircle2}
            title="Notifications"
            body="Actions that need you land in /notifications with Approve / Deny buttons — no need to hunt through /events for what's waiting. Toast messages also fan out live."
          />
          <TourStep
            icon={BookOpen}
            title="Get help"
            body={
              <>
                Stuck? See the{" "}
                <Link href="/help" className="text-accent underline underline-offset-2">
                  Help & FAQ
                </Link>{" "}
                page for common questions.
              </>
            }
          />
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={suppress}
              onCheckedChange={(v) => setSuppress(Boolean(v))}
            />
            Don't show again
          </label>
          <Button variant="accent" onClick={dismiss}>
            {suppress ? "Save & close" : "Got it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TourStep({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="rounded-md bg-accent/10 p-2 text-accent shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
