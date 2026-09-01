import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
export const runtime = "nodejs";
const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "当前密码错误或新密码不符合要求" } }, { status: 400 });
  try {
    return await auth.api.changePassword({ body: parsed.data, headers: request.headers, asResponse: true });
  } catch {
    return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "当前密码错误或新密码不符合要求" } }, { status: 400 });
  }
}
