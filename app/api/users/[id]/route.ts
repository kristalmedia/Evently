import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getUserById, logAudit, upsertUser } from "@/lib/store";
import type { Role } from "@/lib/types";

/**
 * PATCH — Super Admin only. Update a user's name and/or role.
 * Spec §1B/§3: only Super Admins can edit names + roles. Change is audited.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!can(session?.user, "users.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = getUserById(id);
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    fullName?: string;
    role?: Role;
  };
  const updated = {
    ...existing,
    ...(body.fullName ? { fullName: body.fullName } : {}),
    ...(body.role ? { role: body.role } : {}),
  };
  upsertUser(updated);

  // Audit
  const changes: string[] = [];
  if (body.fullName && body.fullName !== existing.fullName) {
    changes.push(`name: "${existing.fullName}" → "${body.fullName}"`);
  }
  if (body.role && body.role !== existing.role) {
    changes.push(`role: ${existing.role} → ${body.role}`);
  }
  if (changes.length) {
    logAudit({
      kind: "USER_UPDATED",
      actor: session!.user,
      targetUserId: existing.id,
      details: `Target: ${existing.email}. ${changes.join("; ")}`,
    });
  }

  return NextResponse.json({ user: updated });
}
