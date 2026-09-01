import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { logs } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const rows = await db.select({ id: logs.id, sequence: logs.sequence, level: logs.level, message: logs.message, createdAt: logs.createdAt })
    .from(logs).where(eq(logs.syncJobId, id)).orderBy(asc(logs.sequence));
  return NextResponse.json({ data: rows });
}
