import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Cog,
  Mail,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { transportStatus } from "@/lib/store";

interface EnvVar {
  key: string;
  hint: string;
}

const GRAPH_VARS: EnvVar[] = [
  { key: "MSGRAPH_TENANT_ID", hint: "Directory (tenant) ID from the Entra app registration" },
  { key: "MSGRAPH_CLIENT_ID", hint: "Application (client) ID from the Entra app" },
  { key: "MSGRAPH_CLIENT_SECRET", hint: "Client secret VALUE (not Secret ID) — rotate periodically" },
  { key: "MSGRAPH_SENDER_UPN", hint: "Licensed mailbox UPN to send as, e.g. noreply@kristal.media" },
];

const SMTP_VARS: EnvVar[] = [
  { key: "EMAIL_SMTP_HOST", hint: "e.g. smtp.office365.com, smtp.sendgrid.net" },
  { key: "EMAIL_SMTP_PORT", hint: "587 (STARTTLS) or 465 (TLS)" },
  { key: "EMAIL_SMTP_USER", hint: "SMTP username / API key user" },
  { key: "EMAIL_SMTP_PASS", hint: "SMTP password / API key secret" },
  { key: "EMAIL_FROM", hint: "Verified sender address" },
];

export default async function SettingsPage() {
  const { user } = await requireSession();
  if (!can(user, "system.settings")) redirect("/dashboard");

  const status = transportStatus();
  const configured = status.configured;
  const activeTransport = status.transport;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System administration"
        title="System settings"
        description="Configuration status for external integrations. Values are read from environment variables at runtime — set them in .env.local and restart the server to apply."
      />

      {/* Email transport card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-accent" />
            Email notification engine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
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
                  ? `Email dispatch enabled via ${activeTransport === "graph" ? "Microsoft Graph (Entra app)" : "SMTP"}`
                  : "Email transport not configured — dispatch is currently simulated"}
              </div>
              <div className="text-xs text-muted-foreground">
                {configured
                  ? activeTransport === "graph"
                    ? "Invitation, active-booking and confirmation emails are delivered through the Entra app's Mail.Send permission. No plaintext mailbox password required."
                    : "Invitation and notification emails are delivered through your configured SMTP relay. Consider switching to Microsoft Graph (recommended) for better secret hygiene."
                  : "Set either the MSGRAPH_ block (recommended) or the EMAIL_SMTP_ block in .env.local to enable real delivery."}
              </div>
            </div>
            <Badge variant={configured ? "emerald" : "amber"}>
              {configured
                ? activeTransport === "graph"
                  ? "Graph"
                  : "SMTP"
                : "Simulated"}
            </Badge>
          </div>

          {/* Graph transport section — the recommended path */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="callsign inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" />
                Option A: Microsoft Graph (recommended)
              </div>
              {activeTransport === "graph" && (
                <Badge variant="emerald" className="text-[0.6rem]">
                  Active
                </Badge>
              )}
            </div>
            <div className="rounded-md border overflow-hidden divide-y">
              {GRAPH_VARS.map((v) => {
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

          {/* SMTP fallback section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="callsign">Option B: SMTP fallback</div>
              {activeTransport === "smtp" && (
                <Badge variant="emerald" className="text-[0.6rem]">
                  Active
                </Badge>
              )}
            </div>
            <div className="rounded-md border overflow-hidden divide-y">
              {SMTP_VARS.map((v) => {
                const set = !!process.env[v.key];
                return (
                  <div
                    key={v.key}
                    className="grid grid-cols-[24px_1fr_auto] gap-3 items-center px-3 py-2"
                  >
                    {set ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <span className="text-muted-foreground text-xs font-mono">·</span>
                    )}
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
            <div className="font-medium text-foreground">How to configure Microsoft Graph</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Azure Portal → <span className="font-medium">Entra ID → App registrations</span>{" "}
                (reuse the SSO app or create a new one).
              </li>
              <li>
                <span className="font-medium">API permissions → Add → Microsoft Graph →
                Application permissions</span>, tick <code className="font-mono">Mail.Send</code>, then{" "}
                <span className="font-medium">Grant admin consent</span>.
              </li>
              <li>
                <span className="font-medium">Certificates &amp; secrets → New client secret</span>,
                copy the Value column immediately (Azure only shows it once).
              </li>
              <li>
                Pick a licensed Exchange mailbox as{" "}
                <code className="font-mono">MSGRAPH_SENDER_UPN</code> (e.g. a shared{" "}
                <code className="font-mono">noreply@kristal.media</code> mailbox).
              </li>
              <li>
                Paste all four values into <code className="font-mono">.env.local</code> and
                restart the dev server. Reload this page — the banner should flip to{" "}
                <span className="font-medium">Graph · Enabled</span>.
              </li>
            </ol>
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
            calendar preferences will land here as they&apos;re wired up. The
            permissions, store, and RBAC scaffolding is already in place.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
