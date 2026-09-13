import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { postWebhook } from "@/domain/webhook";

export const runtime = "nodejs";

const requestSchema = z.object({ webhookUrl: z.string().trim().url().max(2048) }).strict();

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "请输入有效的 Bark 推送 URL" } }, { status: 400 });
  const { webhookUrl } = parsed.data;
  const result = await postWebhook({ eventId: randomUUID(), eventType: "notification.test", occurredAt: new Date().toISOString(), object: { type: "notification" }, status: "success" }, webhookUrl);
  if (!result.ok) return NextResponse.json({ error: { code: "BARK_DELIVERY_FAILED", message: result.error } }, { status: 422 });
  return NextResponse.json({ data: { summary: result.summary } });
}
