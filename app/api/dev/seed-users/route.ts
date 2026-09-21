import { NextResponse } from "next/server";
import { getAllUsers } from "@/lib/store";
import { TEST_LOGIN_ENABLED } from "@/lib/test-login";

/**
 * Dev-only endpoint that returns the full seed user list without auth,
 * exclusively so the RoleSwitcher can populate itself. Gated by the
 * same flag as /api/auth/login — with the flag off the route pretends
 * not to exist, so the user directory can't be enumerated anonymously.
 */
export async function GET() {
  if (!TEST_LOGIN_ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Only return VERIFIED users — invited-but-not-verified users can't sign in yet.
  const users = getAllUsers().filter((u) => u.verificationStatus === "VERIFIED");
  return NextResponse.json({ users });
}
