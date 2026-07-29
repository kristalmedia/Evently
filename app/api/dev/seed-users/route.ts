import { NextResponse } from "next/server";
import { getAllUsers } from "@/lib/store";

/**
 * Dev-only endpoint that returns the full seed user list without auth,
 * exclusively so the RoleSwitcher can populate itself.
 * Delete this route (and the RoleSwitcher) before production deploy.
 */
export async function GET() {
  // Only return VERIFIED users — invited-but-not-verified users can't sign in yet.
  const users = getAllUsers().filter((u) => u.verificationStatus === "VERIFIED");
  return NextResponse.json({ users });
}
