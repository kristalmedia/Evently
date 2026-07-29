import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { refreshInvitation, sendEmail } from "@/lib/store";

async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/**
 * Regenerate the invitation token for a user still in INVITED state,
 * then re-dispatch the (simulated) invitation email.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!can(session?.user, "users.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const user = refreshInvitation(id);
  if (!user) {
    return NextResponse.json(
      { error: "User not found or already verified" },
      { status: 404 }
    );
  }
  const invitationUrl = `${await baseUrl()}/set-password?token=${user.invitationToken}`;

  const email = await sendEmail({
    to: user.email,
    subject: "Reminder — set up your KEMS account",
    body:
      `Hi ${user.fullName},\n\n` +
      `A new invitation link has been generated for your KEMS account.\n\n` +
      `Activate your account here:\n${invitationUrl}\n\n` +
      `— Kristal Media`,
  });

  return NextResponse.json({
    user,
    invitationUrl,
    emailDispatched: {
      to: email.to,
      subject: email.subject,
      sentAt: email.sentAt,
      delivered: email.delivered,
      simulated: email.simulated,
      error: email.error,
    },
  });
}
