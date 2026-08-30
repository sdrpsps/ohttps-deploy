import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deployments, deploymentTargets } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [deployment] = await db.select().from(deployments).where(eq(deployments.id, id)).limit(1);
  if (!deployment) return NextResponse.json({ error: { code: "NOT_FOUND", message: "deployment not found" } }, { status: 404 });
  const targets = await db.select().from(deploymentTargets).where(eq(deploymentTargets.deploymentId, id));
  return NextResponse.json({ data: { ...deployment, targets } });
}

