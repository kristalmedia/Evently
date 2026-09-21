import { NextResponse } from "next/server";
import { z } from "zod";
import { signInAsUserId } from "@/lib/auth";
import { TEST_LOGIN_ENABLED } from "@/lib/test-login";

const schema = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  // This route only exists to back the "test environment" seeded-user login.
  // In real production builds the flag is off and the route pretends not to
  // exist, so nobody can bypass Microsoft Entra ID by POSTing a userId.
  if (!TEST_LOGIN_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const session = await signInAsUserId(parsed.data.userId);
  if (!session) {
    return NextResponse.json({ error: "User not found or disabled" }, { status: 404 });
  }

  return NextResponse.json({ session });
}
