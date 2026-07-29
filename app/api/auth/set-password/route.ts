import { NextResponse } from "next/server";
import { verifyUserPassword } from "@/lib/store";

/**
 * Verify a user's password against their invitation token.
 * In production, replace the trivial hash with bcrypt/argon2 and enforce
 * a real password policy server-side.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  if (!body.token || !body.password) {
    return NextResponse.json({ error: "Missing token or password" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // ⚠ Demo-only "hash". Replace with bcrypt in production.
  const passwordHash = `mock$${Buffer.from(body.password).toString("base64")}`;

  const user = verifyUserPassword(body.token, passwordHash);
  if (!user) {
    return NextResponse.json(
      { error: "Invitation not found or already used" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
