import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getNotifications, store } from "@/lib/store";

/**
 * Returns pending real-time toasts for the current user.
 * A "toast" is any EVENT_PUBLISHED notification that hasn't yet had a toast
 * fired for it (`toastShown` is falsy). The client polls this every ~8s.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ toasts: [] });
  const notifs = getNotifications(session.user.id).filter(
    (n) => n.kind === "EVENT_PUBLISHED" && !n.toastShown
  );
  return NextResponse.json({
    toasts: notifs.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      eventId: n.eventId,
      createdAt: n.createdAt,
    })),
  });
}

/**
 * Mark a toast as shown so it doesn't re-fire on the next poll.
 * Body: { ids: string[] }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids : [];
  for (const id of ids) {
    const n = store.notifications.get(id);
    if (n && n.recipientUserId === session.user.id) {
      store.notifications.set(id, { ...n, toastShown: true });
    }
  }
  return NextResponse.json({ ok: true, count: ids.length });
}
