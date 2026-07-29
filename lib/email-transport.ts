/**
 * Email transport layer.
 *
 * Reads standard SMTP env vars and, if present, uses nodemailer to actually
 * deliver mail. If any required var is missing, the send is honestly reported
 * as simulated — the UI shows a warning and offers the invitation URL as a
 * manual fallback rather than pretending the mail went out.
 *
 * Required env vars for real delivery:
 *   EMAIL_SMTP_HOST      e.g. smtp.office365.com, smtp.sendgrid.net
 *   EMAIL_SMTP_PORT      e.g. 587 (STARTTLS) or 465 (TLS)
 *   EMAIL_SMTP_USER      auth username / API key user
 *   EMAIL_SMTP_PASS      auth password / API key secret
 *   EMAIL_FROM           verified sender address the provider will accept
 *   EMAIL_SMTP_SECURE    optional — "true" for port 465, default false
 *
 * Add these to .env.local. See .env.local.example for the full template.
 */

export interface MailInput {
  to: string;
  subject: string;
  body: string;
}

export interface MailResult {
  ok: boolean;
  simulated: boolean;
  messageId?: string;
  error?: string;
}

interface Config {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

function readConfig(): Config | null {
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

/** Missing-config diagnostic — surfaced to the UI when transport is not ready. */
export function transportStatus(): { configured: boolean; missing: string[] } {
  const required = [
    "EMAIL_SMTP_HOST",
    "EMAIL_SMTP_PORT",
    "EMAIL_SMTP_USER",
    "EMAIL_SMTP_PASS",
    "EMAIL_FROM",
  ];
  const missing = required.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}

export async function deliverMail(input: MailInput): Promise<MailResult> {
  const cfg = readConfig();
  if (!cfg) {
    return {
      ok: false,
      simulated: true,
      error:
        "SMTP not configured — set EMAIL_SMTP_HOST/PORT/USER/PASS + EMAIL_FROM in .env.local to enable real delivery.",
    };
  }

  try {
    // Dynamic import so environments without nodemailer installed still build.
    // (nodemailer is a regular dep, but if a slim deploy skips it this stays safe.)
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

    // Optional verify — surfaces auth / DNS errors clearly.
    await transporter.verify();

    const info = await transporter.sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      text: input.body,
      // Simple HTML wrap so recipients see something formatted.
      html: `<pre style="font-family: system-ui, sans-serif; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(input.body)}</pre>`,
    });

    return { ok: true, simulated: false, messageId: info.messageId };
  } catch (err) {
    return {
      ok: false,
      simulated: false,
      error: (err as Error).message,
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
