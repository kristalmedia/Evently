import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUnreadCount } from "@/lib/store";

/**
 * Returns the current user's unread notification count.
 * Polled by the topbar bell badge every ~10 seconds.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: getUnreadCount(session.user.id) });
}
