import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllUsers } from "@/lib/store";

/**
 * GET — lightweight users directory for authenticated viewers.
 *
 * Different from GET /api/users which is gated behind `users.manage`
 * (Super Admin only) and returns full user records including invitation
 * tokens. This endpoint returns just what a staff-picker combobox needs
 * — id, name, department, role — and lets any signed-in user consume it
 * so Managers can pick roster shifts and HR can filter to IT/Technical.
 *
 * Disabled accounts and unverified invites are excluded; a picker that
 * suggests them would waste HR/Manager time.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const users = getAllUsers()
    .filter(
      (u) => u.status === "active" && u.verificationStatus === "VERIFIED",
    )
    .map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      department: u.department,
      role: u.role,
      secondaryRole: u.secondaryRole,
    }));
  return NextResponse.json({ users });
}
