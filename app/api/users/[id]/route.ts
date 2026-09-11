import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getUserById, logAudit, upsertUser } from "@/lib/store";
import type { Role } from "@/lib/types";

/**
 * PATCH — Super Admin only. Update a user's name and/or roles.
 * Spec §1B/§3: only Super Admins can edit names + roles. Change is audited.
 *
 * `secondaryRole` uses null-vs-undefined semantics:
 *   undefined → don't touch (backwards compatible with older clients)
 *   null      → explicit clear (user goes back to primary-role-only)
 *   Role      → set/overwrite
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
    secondaryRole?: Role | null;
  };

  // Reject secondary === primary — makes no sense and would silently
  // become dead weight in every permission check.
  const nextPrimary = body.role ?? existing.role;
  const nextSecondaryRaw =
    body.secondaryRole === undefined ? existing.secondaryRole : body.secondaryRole ?? undefined;
  if (nextSecondaryRaw && nextSecondaryRaw === nextPrimary) {
    return NextResponse.json(
      { error: "Secondary role must differ from primary role." },
      { status: 400 }
    );
  }

  const updated = {
    ...existing,
    ...(body.fullName ? { fullName: body.fullName } : {}),
    ...(body.role ? { role: body.role } : {}),
    // Explicitly assign so an incoming null actually clears it (spread would
    // just set the key to null, which serializes fine but reads awkward
    // elsewhere; normalise to undefined here).
    secondaryRole: nextSecondaryRaw,
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
  if (body.secondaryRole !== undefined && (body.secondaryRole ?? undefined) !== existing.secondaryRole) {
    changes.push(
      `secondaryRole: ${existing.secondaryRole ?? "—"} → ${body.secondaryRole ?? "—"}`
    );
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
