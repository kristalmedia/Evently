"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, KeyRound, Radio, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KristalMark } from "@/components/layout/kristal-mark";

export function SetPasswordPanel({
  token,
  user,
}: {
  token: string | null;
  user: { id: string; fullName: string; email: string } | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const invalid = !token || !user;

  async function submit() {
    if (!token || !user) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to set password");
      }
      setDone(true);
      toast.success("Password set — you can now sign in.");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side (reused motif) */}
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
            <span className="text-white/80">Onboarding · set password</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">
            Welcome to KEMS.
          </h1>
          <p className="text-white/70 leading-relaxed">
            Set your password to activate your account. Once verified, you'll be able
            to sign in with your Kristal Media email.
          </p>
        </div>

        <div className="relative text-[0.7rem] font-mono uppercase tracking-widest text-white/40">
          KM-EMS-v0.1 · Onboarding
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex justify-center">
            <KristalMark className="text-accent h-8 w-8" />
          </div>

          {invalid ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-fit rounded-full bg-destructive/10 p-3 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="callsign">Invalid link</div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  This invitation isn't valid
                </h2>
                <p className="text-sm text-muted-foreground">
                  The link may have expired, already been used, or been mistyped.
                  Ask IT to resend a fresh invitation.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : done ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-fit rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="callsign">Verified</div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  You're all set
                </h2>
                <p className="text-sm text-muted-foreground">
                  Redirecting you to sign in…
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="callsign">Onboarding</div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Set your password
                </h2>
                <p className="text-sm text-muted-foreground">
                  Signing in as{" "}
                  <span className="font-mono text-foreground">{user!.email}</span>
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pw">New password</Label>
                  <Input
                    id="pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw2">Confirm password</Label>
                  <Input
                    id="pw2"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>

              <Button
                className="w-full gap-2"
                size="lg"
                variant="accent"
                onClick={submit}
                disabled={pending}
              >
                <KeyRound className="h-4 w-4" />
                {pending ? "Setting password…" : "Set password & verify account"}
              </Button>

              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
                <span>
                  Passwords are hashed. This flow is mock — real deployment will
                  bind to Microsoft Entra ID with SSO.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
