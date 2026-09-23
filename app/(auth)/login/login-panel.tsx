"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, LogIn, Radio, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiPath } from "@/lib/api-path";
import { authClient } from "@/lib/auth-client";
import { TEST_LOGIN_ENABLED } from "@/lib/test-login";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { KristalMark } from "@/components/layout/kristal-mark";
import { ROLE_LABEL } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";

export function LoginPanel({ users }: { users: User[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [msPending, setMsPending] = useState(false);

  const grouped = users.reduce<Record<string, User[]>>((acc, u) => {
    (acc[u.department] ??= []).push(u);
    return acc;
  }, {});

  async function signIn() {
    if (!selectedId) return;
    setPending(true);
    try {
      const res = await fetch(apiPath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedId }),
      });
      if (!res.ok) throw new Error("failed");
      const { session } = await res.json();
      useSessionStore.getState().setUser(session.user);
      toast.success(`Welcome, ${session.user.fullName.split(" ")[0]}`);
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Sign-in failed. Try another user.");
    } finally {
      setPending(false);
    }
  }

  async function signInWithMicrosoft() {
    setMsPending(true);
    try {
      const { error } = await authClient.signIn.social({
        provider: "microsoft",
        callbackURL: apiPath("/dashboard"),
      });
      // On success this call navigates the browser away to Microsoft's sign-in
      // page and never resolves normally — so reaching here with no error
      // means the request itself failed before it could redirect (e.g. an
      // incognito cookie block, or a misconfigured Entra ID app registration).
      if (error) {
        toast.error(error.message ?? "Couldn't start Microsoft sign-in. Check the browser console.");
      }
    } catch (err) {
      toast.error("Couldn't start Microsoft sign-in. Check the browser console.");
      console.error(err);
    } finally {
      setMsPending(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* ── Brand side ─────────────────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-signal-800 text-white overflow-hidden">
        <div className="absolute inset-0 broadcast-grid opacity-15" />
        <div className="absolute -right-32 top-1/4 h-96 w-96 rounded-full bg-signal-500 blur-3xl opacity-30" />
        <div className="absolute -left-24 -bottom-16 h-72 w-72 rounded-full bg-accent blur-3xl opacity-20" />

        <div className="relative flex items-center gap-3">
          <KristalMark className="text-white" />
          <div className="leading-none">
            <div className="text-[0.65rem] font-mono uppercase tracking-[0.22em] text-white/60">
              Kristal Media
            </div>
            <div className="text-base font-semibold tracking-tight">
              Event Management System
            </div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[0.7rem] font-mono uppercase tracking-widest">
            <Radio className="h-3 w-3 text-onair-bright" />
            <span className="text-white/80">On air · internal tools</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">
            From concept to broadcast, in one workflow.
          </h1>
          <p className="text-white/70 leading-relaxed">
            Plan events end-to-end using the KM-EVT-CONCEPT-v1 workflow —
            identification, resources, staffing, budget, timeline, broadcast, risk,
            debrief, sign-off. GM approval built in.
          </p>

          <ul className="space-y-2 pt-2 text-sm text-white/70">
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-accent" /> KOTG, remote broadcasts, launches, community
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-accent" /> Commercial + CSR classification with VoG pillars
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-accent" /> Live status tracking through the event lifecycle
            </li>
          </ul>
        </div>

        <div className="relative text-[0.7rem] font-mono uppercase tracking-widest text-white/40">
          KM-EMS-v0.1 · Prepared for internal deployment
        </div>
      </div>

      {/* ── Sign-in side ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex justify-center">
            <KristalMark className="text-accent h-8 w-8" />
          </div>

          <div className="space-y-2">
            <div className="callsign">Sign in</div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Welcome to Evently
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your <span className="font-mono">@kristal.media</span>{" "}
              Microsoft account{TEST_LOGIN_ENABLED ? ", or use the test environment below" : ""}.
            </p>
          </div>

          {/* Real Microsoft Entra ID SSO */}
          <Button
            variant="outline"
            size="lg"
            className="w-full gap-3 justify-start"
            onClick={signInWithMicrosoft}
            disabled={msPending}
          >
            <MicrosoftLogo />
            <span className="flex-1 text-left">
              {msPending ? "Redirecting…" : "Sign in with Microsoft"}
            </span>
          </Button>

          {TEST_LOGIN_ENABLED && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-xs text-muted-foreground uppercase tracking-widest font-mono">
                    Or continue in test environment
                  </span>
                </div>
              </div>

              <div className="rounded-lg border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <FlaskConical className="h-4 w-4" />
                  <span className="text-xs font-mono uppercase tracking-widest font-semibold">
                    Test environment
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sign in as a seeded test user — no Microsoft account required.
                  Use this to explore Evently before Entra ID SSO is configured.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="user-select" className="text-xs">
                    Seeded user
                  </Label>
                  <Select value={selectedId} onValueChange={setSelectedId}>
                    <SelectTrigger id="user-select" className="bg-background">
                      <SelectValue placeholder="Choose a user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(grouped).map(([dept, list]) => (
                        <SelectGroup key={dept}>
                          <div className="px-2 py-1 callsign">{dept}</div>
                          {list.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              <div className="flex flex-col items-start">
                                <span className="truncate">{u.fullName}</span>
                                <span className="text-[0.7rem] text-muted-foreground">
                                  {ROLE_LABEL[u.role]}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full gap-2"
                  size="lg"
                  variant="accent"
                  onClick={signIn}
                  disabled={pending || !selectedId}
                >
                  <LogIn className="h-4 w-4" />
                  {pending ? "Signing in…" : "Enter test environment"}
                </Button>
              </div>

              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
                <span>
                  Mock auth. Swap to real Microsoft Entra ID in{" "}
                  <code className="font-mono">lib/auth.ts</code> for production.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
