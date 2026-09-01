import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { certificateSyncJobs, logs } from "@/db/schema";

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
        const rows = await db.select({ id: logs.id, sequence: logs.sequence, level: logs.level, message: logs.message, createdAt: logs.createdAt })
          .from(logs).where(and(eq(logs.syncJobId, id), gt(logs.sequence, sequence))).orderBy(asc(logs.sequence));
        for (const row of rows) {
          sequence = row.sequence;
          controller.enqueue(encoder.encode(`id: ${row.sequence}\ndata: ${JSON.stringify(row)}\n\n`));
        }
        const [job] = await db.select({ status: certificateSyncJobs.status }).from(certificateSyncJobs).where(eq(certificateSyncJobs.id, id)).limit(1);
        if (!job || ["succeeded", "failed", "cancelled"].includes(job.status)) {
          controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ syncJobId: id })}\n\n`));
          controller.close();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    } catch { if (!closed) controller.error(new Error("event stream failed")); }
  }});
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" } });
}
