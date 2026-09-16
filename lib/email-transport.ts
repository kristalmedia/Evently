/**
 * Email transport layer.
 *
 * Two supported transports, checked in this order:
 *
 *   1. Microsoft Graph (preferred) — OAuth client-credentials flow
 *      against an Entra ID app registration. No plaintext mailbox
 *      password ever lives in the environment; the client secret is
 *      a scoped credential that can be rotated centrally.
 *
 *      Required env vars (all four):
 *        MSGRAPH_TENANT_ID     — Directory (tenant) ID
 *        MSGRAPH_CLIENT_ID     — Application (client) ID
 *        MSGRAPH_CLIENT_SECRET — Client secret VALUE (not Secret ID)
 *        MSGRAPH_SENDER_UPN    — UPN of the mailbox to send from
 *                                (e.g. noreply@kristal.media). Must be
 *                                a licensed mailbox in the tenant.
 *
 *      Entra app requires the "Mail.Send" APPLICATION permission on
 *      Microsoft Graph, with admin consent granted. Delegated
 *      permissions don't apply here since there's no user in the loop.
 *
 *   2. SMTP (fallback / legacy) — nodemailer against any SMTP relay
 *      (Office 365, SendGrid, an internal Postfix, whatever).
 *
 *      Required env vars (all five):
 *        EMAIL_SMTP_HOST / PORT / USER / PASS / EMAIL_FROM
 *      Optional:
 *        EMAIL_SMTP_SECURE — "true" for port 465 TLS
 *
 * If neither transport is configured, the send is honestly reported as
 * `simulated: true` — the UI shows a warning and the invitation URL as
 * a manual fallback rather than pretending the mail went out.
 */

export interface MailInput {
  to: string;
  subject: string;
  body: string;
}

export interface MailResult {
  ok: boolean;
  simulated: boolean;
  /** Which transport handled the send — undefined when simulated. */
  transport?: "graph" | "smtp";
  messageId?: string;
  error?: string;
}

// ─── Microsoft Graph transport ───────────────────────────────────────

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderUpn: string;
}

function readGraphConfig(): GraphConfig | null {
  const tenantId = process.env.MSGRAPH_TENANT_ID;
  const clientId = process.env.MSGRAPH_CLIENT_ID;
  const clientSecret = process.env.MSGRAPH_CLIENT_SECRET;
  const senderUpn = process.env.MSGRAPH_SENDER_UPN;
  if (!tenantId || !clientId || !clientSecret || !senderUpn) return null;
  return { tenantId, clientId, clientSecret, senderUpn };
}

/**
 * Cached access token. Client-credentials tokens live ~1 hour, so we
 * hang on to one across calls and refresh only when it's within 60s of
 * expiry. Anchored to globalThis so Next.js dev-mode HMR doesn't force
 * a fresh handshake on every module reload — same pattern as
 * lib/google-sheets.ts.
 */
interface TokenCache {
  accessToken: string;
  /** Epoch ms when the token stops being usable. */
  expiresAt: number;
  /** Tuple of (tenant, client) the cache is for — invalidates on env changes. */
  key: string;
}

const g = globalThis as unknown as { __evently_graph_token?: TokenCache };

async function fetchGraphToken(cfg: GraphConfig): Promise<string> {
  const cacheKey = `${cfg.tenantId}::${cfg.clientId}`;
  const cached = g.__evently_graph_token;
  if (
    cached &&
    cached.key === cacheKey &&
    cached.expiresAt - 60_000 > Date.now()
  ) {
    return cached.accessToken;
  }

  const url = `https://login.microsoftonline.com/${encodeURIComponent(
    cfg.tenantId,
  )}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Entra token endpoint returned ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  if (!data.access_token) {
    throw new Error("Entra token response missing access_token");
  }

  g.__evently_graph_token = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    key: cacheKey,
  };
  return data.access_token;
}

async function deliverViaGraph(
  cfg: GraphConfig,
  input: MailInput,
): Promise<MailResult> {
  try {
    const token = await fetchGraphToken(cfg);
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      cfg.senderUpn,
    )}/sendMail`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: {
            contentType: "Text",
            content: input.body,
          },
          toRecipients: [
            { emailAddress: { address: input.to } },
          ],
        },
        // Sent-Items would fill up the shared service mailbox with
        // system mail; keep it off. Delivery still succeeds either way.
        saveToSentItems: false,
      }),
      cache: "no-store",
    });

    // Graph sendMail returns 202 Accepted on success with an empty body.
    if (res.status === 202) {
      return { ok: true, simulated: false, transport: "graph" };
    }
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      simulated: false,
      transport: "graph",
      error: `Graph sendMail returned ${res.status}: ${text.slice(0, 300)}`,
    };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      transport: "graph",
      error: (err as Error).message,
    };
  }
}

// ─── SMTP transport (fallback) ───────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.EMAIL_SMTP_HOST;
  const portStr = process.env.EMAIL_SMTP_PORT;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;
  const from = process.env.EMAIL_FROM;
  if (!host || !portStr || !user || !pass || !from) return null;
  const port = Number(portStr);
  if (!Number.isFinite(port) || port <= 0) return null;
  const secure =
    (process.env.EMAIL_SMTP_SECURE ?? "").toLowerCase() === "true" || port === 465;
  return { host, port, user, pass, from, secure };
}

async function deliverViaSmtp(
  cfg: SmtpConfig,
  input: MailInput,
): Promise<MailResult> {
  try {
    // Dynamic import so environments without nodemailer installed still build.
    const nodemailerModule = (await import("nodemailer")) as unknown as {
      default: typeof import("nodemailer");
    } | typeof import("nodemailer");
    const nodemailer =
      "default" in nodemailerModule ? nodemailerModule.default : nodemailerModule;

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: `<pre style="font-family: system-ui, sans-serif; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(input.body)}</pre>`,
    });

    return {
      ok: true,
      simulated: false,
      transport: "smtp",
      messageId: info.messageId,
    };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      transport: "smtp",
      error: (err as Error).message,
    };
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/** Diagnostic — which transport (if any) is currently configured. */
export function transportStatus(): {
  configured: boolean;
  transport: "graph" | "smtp" | "none";
  missing: string[];
} {
  const graph = readGraphConfig();
  if (graph) {
    return { configured: true, transport: "graph", missing: [] };
  }
  const smtp = readSmtpConfig();
  if (smtp) {
    return { configured: true, transport: "smtp", missing: [] };
  }
  // Neither ready — surface which set of vars is closest to complete
  // so the deployer sees the shorter fix path first (Graph is preferred).
  const graphRequired = [
    "MSGRAPH_TENANT_ID",
    "MSGRAPH_CLIENT_ID",
    "MSGRAPH_CLIENT_SECRET",
    "MSGRAPH_SENDER_UPN",
  ];
  return {
    configured: false,
    transport: "none",
    missing: graphRequired.filter((k) => !process.env[k]),
  };
}

export async function deliverMail(input: MailInput): Promise<MailResult> {
  const graph = readGraphConfig();
  if (graph) return deliverViaGraph(graph, input);

  const smtp = readSmtpConfig();
  if (smtp) return deliverViaSmtp(smtp, input);

  return {
    ok: false,
    simulated: true,
    error:
      "Email transport not configured — set MSGRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET/SENDER_UPN in .env.local for Graph, or EMAIL_SMTP_HOST/PORT/USER/PASS + EMAIL_FROM for SMTP fallback.",
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
