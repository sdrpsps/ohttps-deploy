import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const [heartbeat] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "worker_heartbeat")).limit(1);
  const workerAt = heartbeat?.value ? new Date(heartbeat.value).getTime() : 0;
  const worker = workerAt > Date.now() - 2 * 60 * 1000;
  return NextResponse.json({ data: { status: worker ? "ok" : "degraded", service: "ohttps-deploy", worker, timestamp: new Date().toISOString() } });
}
