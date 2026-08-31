import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" } }, { status: 401 });
  try {
    return await auth.api.signInUsername({
      body: { username: parsed.data.username, password: parsed.data.password, rememberMe: true },
      headers: request.headers,
      asResponse: true,
    });
  } catch {
    return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" } }, { status: 401 });
  }
}
