import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ data: await db.select({ id: notifications.id, eventId: notifications.eventId, eventType: notifications.eventType, objectType: notifications.objectType, objectId: notifications.objectId, status: notifications.status, attempts: notifications.attempts, lastError: notifications.lastError, responseSummary: notifications.responseSummary, nextRetryAt: notifications.nextRetryAt, deliveredAt: notifications.deliveredAt, createdAt: notifications.createdAt }).from(notifications).orderBy(desc(notifications.createdAt)).limit(200) }); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "notification id is required" } }, { status: 400 });
  const [row] = await db.update(notifications).set({ status: "pending", nextRetryAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(notifications.id, body.id)).returning({ id: notifications.id });
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "notification not found" } }, { status: 404 });
  return NextResponse.json({ data: row });
}
