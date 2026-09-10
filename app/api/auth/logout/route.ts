import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export async function POST() {
  const { wasEntraSession } = await signOut();
  return NextResponse.json({ ok: true, wasEntraSession });
}
