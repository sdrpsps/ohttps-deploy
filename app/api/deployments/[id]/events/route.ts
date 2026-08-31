import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { deployments, logs } from "@/db/schema";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({ async start(controller) {
    let sequence = Number(request.headers.get("last-event-id") ?? 0) || 0;
    const close = () => { closed = true; controller.close(); };
    request.signal.addEventListener("abort", close, { once: true });
    try {
      while (!closed) {
        const rows = await db.select().from(logs).where(and(eq(logs.deploymentId, id), gt(logs.sequence, sequence))).orderBy(asc(logs.sequence));
        for (const row of rows) { sequence = row.sequence; controller.enqueue(encoder.encode(`id: ${row.sequence}\ndata: ${JSON.stringify({ level: row.level, message: row.message, createdAt: row.createdAt })}\n\n`)); }
        const [deployment] = await db.select({ status: deployments.status }).from(deployments).where(eq(deployments.id, id)).limit(1);
        if (!deployment || ["succeeded", "failed", "cancelled", "partial"].includes(deployment.status)) { controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ deploymentId: id })}\n\n`)); controller.close(); return; }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    } catch { if (!closed) controller.error(new Error("event stream failed")); }
  }});
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" } });
}
