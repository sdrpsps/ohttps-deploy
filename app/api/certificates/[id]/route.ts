import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificates } from "@/db/schema";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  domain: z.string().trim().min(1).max(253).optional(),
  renewBeforeDays: z.coerce.number().int().min(1).max(365).optional(),
  status: z.enum(["active", "disabled"]).optional(),
}).strict();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [row] = await db.select().from(certificates).where(eq(certificates.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  return NextResponse.json({ data: row });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid certificate fields" } }, { status: 400 });
  const [row] = await db.update(certificates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(certificates.id, id)).returning();
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  return NextResponse.json({ data: row });
}

