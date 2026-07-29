import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { nextSequentialRefKey } from "@/lib/store";

export async function GET() {
  const session = await getSession();
  if (!can(session?.user, "events.create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ref: nextSequentialRefKey() });
}
