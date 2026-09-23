import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { deleteUser, getAllUsers, inviteUser, logAudit, sendEmail } from "@/lib/store";
import type { Department, Role } from "@/lib/types";

async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function GET() {
  const session = await getSession();
  if (!can(session?.user, "users.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ users: getAllUsers() });
}

/**
 * Invite a new user — creates them in INVITED state with a token, and returns
 * the invitation URL for the IT admin to share (in real deployment this would
 * be delivered by email).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!can(session?.user, "users.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    fullName?: string;
    email?: string;
    department?: Department;
    role?: Role;
    jobTitle?: string;
  };
  if (!body.fullName || !body.email || !body.department || !body.role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const user = inviteUser({
    fullName: body.fullName,
    email: body.email,
    department: body.department,
    role: body.role,
    jobTitle: body.jobTitle,
  });
  logAudit({
    kind: "USER_INVITED",
    actor: session!.user,
    targetUserId: user.id,
    details: `Invited ${user.email} as ${user.role} in ${user.department}`,
  });
  const invitationUrl = `${await baseUrl()}/set-password?token=${user.invitationToken}`;

  // Attempt real delivery. If SMTP is configured (.env.local), the mail
  // actually leaves; otherwise the send is honestly reported as simulated
  // so the UI won't lie to IT.
  const email = await sendEmail({
    to: user.email,
    subject: `Welcome to Evently — set up your ${user.department} account`,
    body:
      `Hi ${user.fullName},\n\n` +
      `An account has been created for you on Evently, Kristal Media's event management system.\n\n` +
      `Role: ${user.role}\n` +
      `Department: ${user.department}\n\n` +
      `To activate your account and set your password, visit:\n${invitationUrl}\n\n` +
      `If you didn't expect this email, please ignore it or reply to your IT contact.\n\n` +
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

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!can(session?.user, "users.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Guard: nobody can delete their own account.
  if (id === session!.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  const target = (await import("@/lib/store")).getUserById(id);
  const ok = deleteUser(id);
  if (ok && target) {
    logAudit({
      kind: "USER_UPDATED",
      actor: session!.user,
      targetUserId: id,
      details: `Deleted account: ${target.email} (${target.role})`,
    });
  }
  return NextResponse.json({ ok });
}
