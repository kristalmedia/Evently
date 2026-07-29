import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Cog,
  Mail,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { transportStatus } from "@/lib/store";

const REQUIRED_VARS: { key: string; hint: string }[] = [
  { key: "EMAIL_SMTP_HOST", hint: "e.g. smtp.office365.com, smtp.sendgrid.net" },
  { key: "EMAIL_SMTP_PORT", hint: "587 (STARTTLS) or 465 (TLS)" },
  { key: "EMAIL_SMTP_USER", hint: "SMTP username / API key user" },
  { key: "EMAIL_SMTP_PASS", hint: "SMTP password / API key secret" },
  { key: "EMAIL_FROM", hint: "Verified sender address" },
];

const OPTIONAL_VARS: { key: string; hint: string }[] = [
  { key: "EMAIL_SMTP_SECURE", hint: "'true' for port 465, default false" },
];

export default async function SettingsPage() {
  const { user } = await requireSession();
  if (!can(user, "system.settings")) redirect("/dashboard");

  const status = transportStatus();
  const configured = status.configured;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System administration"
        title="System settings"
        description="Configuration status for external integrations. Values are read from environment variables at runtime — set them in .env.local and restart the server to apply."
      />

      {/* SMTP status card (spec §4) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-accent" />
            Email notification engine — SMTP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status banner */}
          <div
            className={`rounded-lg border p-4 flex items-start gap-3 ${
              configured
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-amber-500/40 bg-amber-500/5"
            }`}
          >
            {configured ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 min-w-0 flex-1">
              <div className="text-sm font-medium">
                {configured
                  ? "SMTP configured — email dispatch is enabled"
                  : "SMTP not configured — email dispatch is currently simulated"}
              </div>
              <div className="text-xs text-muted-foreground">
                {configured
                  ? "Invitation emails and other user alerts will be delivered through your configured provider."
                  : `Set the required environment variables in .env.local to enable real email delivery. Missing: ${status.missing.join(", ")}.`}
              </div>
            </div>
            <Badge variant={configured ? "emerald" : "amber"}>
              {configured ? "Enabled" : "Simulated"}
            </Badge>
          </div>

          {/* Var checklist */}
          <div className="space-y-2">
            <div className="callsign">Required environment variables</div>
            <div className="rounded-md border overflow-hidden divide-y">
              {REQUIRED_VARS.map((v) => {
                const set = !!process.env[v.key];
                return (
                  <div
                    key={v.key}
                    className="grid grid-cols-[24px_1fr_auto] gap-3 items-center px-3 py-2"
                  >
                    {set ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-500" />
                    )}
                    <div>
                      <div className="font-mono text-xs">{v.key}</div>
                      <div className="text-[0.7rem] text-muted-foreground">{v.hint}</div>
                    </div>
                    <Badge variant={set ? "emerald" : "muted"}>
                      {set ? "Set" : "Missing"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="callsign">Optional</div>
            <div className="rounded-md border overflow-hidden divide-y">
              {OPTIONAL_VARS.map((v) => {
                const set = !!process.env[v.key];
                return (
                  <div
                    key={v.key}
                    className="grid grid-cols-[24px_1fr_auto] gap-3 items-center px-3 py-2"
                  >
                    <span className="text-muted-foreground text-xs font-mono">·</span>
                    <div>
                      <div className="font-mono text-xs">{v.key}</div>
                      <div className="text-[0.7rem] text-muted-foreground">{v.hint}</div>
                    </div>
                    <Badge variant={set ? "signal" : "muted"}>
                      {set ? "Set" : "Not set"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground space-y-2">
            <div className="font-medium text-foreground">How to configure</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Copy <code className="font-mono">.env.local.example</code> to{" "}
                <code className="font-mono">.env.local</code>
              </li>
              <li>Fill in the SMTP block with your provider's credentials</li>
              <li>Restart the dev server (or redeploy in production)</li>
              <li>Reload this page — the status above should flip to Enabled</li>
            </ol>
            <div className="pt-1">
              Common providers: <span className="font-medium">Office 365</span> (smtp.office365.com:587),{" "}
              <span className="font-medium">SendGrid</span> (smtp.sendgrid.net:587 with user{" "}
              <code className="font-mono">apikey</code>),{" "}
              <span className="font-medium">Resend</span> (smtp.resend.com:465).
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder for future settings sections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cog className="h-4 w-4 text-muted-foreground" />
            Other integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Microsoft Entra ID single sign-on, company profile, timezone, and
            calendar preferences will land here as they're wired up. The
            permissions, store, and RBAC scaffolding is already in place.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
