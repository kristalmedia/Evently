import { NextResponse } from "next/server";
import { z } from "zod";
import { signInAsUserId } from "@/lib/auth";

const schema = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
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
