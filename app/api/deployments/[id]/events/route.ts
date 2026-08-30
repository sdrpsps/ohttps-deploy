import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { logs } from "@/db/schema";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ async start(controller) {
    const rows = await db.select().from(logs).where(eq(logs.deploymentId, id)).orderBy(asc(logs.sequence));
    for (const row of rows) controller.enqueue(encoder.encode(`id: ${row.sequence}\ndata: ${JSON.stringify({ level: row.level, message: row.message, createdAt: row.createdAt })}\n\n`));
    controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ deploymentId: id })}\n\n`)); controller.close();
  }});
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" } });
}

