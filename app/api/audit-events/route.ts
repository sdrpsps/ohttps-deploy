import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";

export const runtime = "nodejs";

const querySchema = z.object({ objectType: z.string().max(80).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid audit filters" } }, { status: 400 });
  const { objectType, from, to } = parsed.data;
  const conditions = [objectType ? eq(auditEvents.objectType, objectType) : undefined, from ? gte(auditEvents.createdAt, from) : undefined, to ? lte(auditEvents.createdAt, to) : undefined].filter((condition): condition is SQL => Boolean(condition));
  const rows = await db.select().from(auditEvents).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(auditEvents.createdAt)).limit(200);
  return NextResponse.json({ data: rows });
}
